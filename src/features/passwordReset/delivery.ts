import type { PendingReset, ReportedDelivery } from '../../lib/api/types';
import { buildChannelMessage, buildDmMessage, RESET_TTL_MS, type ResetMessage } from './view';

/** Discord's answer when a member does not accept DMs from the bot (`CannotSendMessagesToThisUser`). */
const DMS_CLOSED_CODE = 50007;

export const isDmsClosed = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === DMS_CLOSED_CODE;

/** Somewhere a message can be sent: a member (their DMs) or a channel. */
export interface Recipient {
  send(message: ResetMessage): Promise<unknown>;
}

export interface DeliveryTargets {
  fetchUser(discordId: string): Promise<Recipient>;
  /** The public fallback channel, or `null` when none is set or it cannot be used. */
  fetchChannel(): Promise<Recipient | null>;
}

/**
 * Sends a reset request to the member and says how it went. A DM refused because the member's DMs are
 * closed is `dms_closed` (the web then offers the channel). Any other DM failure is thrown, because it may
 * be passing and the caller tries again; a channel failure is final: `failed`.
 */
export const deliverReset = async (
  request: PendingReset,
  targets: DeliveryTargets,
  { logger = console, now = Date.now }: { logger?: Pick<Console, 'error'>; now?: () => number } = {},
): Promise<ReportedDelivery> => {
  // The API does not say when the request ends; it lives 10 minutes from its creation, a few seconds before this
  const expiresAt = new Date(now() + RESET_TTL_MS);
  if (request.delivery === 'channel') {
    try {
      const channel = await targets.fetchChannel();
      if (!channel) return 'failed';
      await channel.send(buildChannelMessage(request.id, request.discord_id, expiresAt));
      return 'delivered';
    } catch (error) {
      logger.error(`[Password-Reset] Could not post request ${request.id} in the channel:`, error);
      return 'failed';
    }
  }

  try {
    const user = await targets.fetchUser(request.discord_id);
    await user.send(buildDmMessage(request.id, request.discord_id, expiresAt));
    return 'delivered';
  } catch (error) {
    if (isDmsClosed(error)) return 'dms_closed';
    throw error;
  }
};
