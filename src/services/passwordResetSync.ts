import type { Client } from 'discord.js';
import { env } from '../config/env';
import { ApiError } from '../lib/api';
import type { PendingReset, ReportedDelivery } from '../lib/api/types';
import { deliverReset, type DeliveryTargets } from '../features/passwordReset/delivery';
import { listPendingResets, reportDelivery } from './passwordResets';

/**
 * Web → Discord delivery of password resets. A member asks for one on the website; the API keeps it as a
 * pending request, and this polls the pending list and sends each request (a DM, or the public channel
 * once the member agreed). The list is state, not events: a request made while the bot was down is still
 * delivered when it returns, as long as it has not expired.
 *
 * The API cannot push to the bot, and it treats each poll as proof that the bot is alive: the web disables
 * the option when no poll arrived for a few seconds. That is why the interval is short and a slow delivery
 * never holds the next poll back.
 */

/** Shorter than the API's window for calling the bot alive, with room for a slow answer. */
const POLL_INTERVAL_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;
/** DM attempts that fail for a reason other than closed DMs, before the request is reported as `dms_closed` anyway. */
const MAX_DM_ATTEMPTS = 3;
const STATES_MAX = 200;

export interface PasswordResetSyncDeps {
  fetchPending(): Promise<PendingReset[]>;
  deliver(request: PendingReset): Promise<ReportedDelivery>;
  reportDelivery(id: string, status: ReportedDelivery): Promise<void>;
  schedule(callback: () => void, delayMs: number): unknown;
  logger: Pick<Console, 'log' | 'error'>;
}

export interface PasswordResetSync {
  /** Begins polling. */
  start(): void;
  /** One poll: asks for the pending requests, schedules the next poll, then delivers them. Never throws. */
  poll(): Promise<void>;
}

/** What is known of a request this process already worked on, so the API listing it again does not send it twice. */
interface RequestState {
  attempts: number;
  /** Set once delivery has an answer (also a final failure); the report to the API may still be pending. */
  outcome?: ReportedDelivery;
  reported: boolean;
  /** A request is being worked on right now (the next poll may list it while a slow send is in flight). */
  busy: boolean;
}

/** An answer that retrying the report cannot change (the request is gone or was already settled). */
const isSettled = (error: unknown): boolean =>
  error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429;

export const createPasswordResetSync = (deps: PasswordResetSyncDeps): PasswordResetSync => {
  const { logger } = deps;
  let failures = 0;
  const states = new Map<string, RequestState>();

  const stateOf = (request: PendingReset): RequestState => {
    // One request can be listed for the DM and later for the channel; each is delivered once
    const key = `${request.id}:${request.delivery}`;
    let state = states.get(key);
    if (!state) {
      state = { attempts: 0, reported: false, busy: false };
      states.set(key, state);
      if (states.size > STATES_MAX) states.delete(states.keys().next().value as string);
    }
    return state;
  };

  /** Delivers one request and reports it. Never throws; what fails is tried again on a later poll. */
  const handle = async (request: PendingReset) => {
    const state = stateOf(request);
    if (state.reported || state.busy) return;
    state.busy = true;
    try {
      if (state.outcome === undefined) {
        try {
          state.outcome = await deps.deliver(request);
        } catch (error) {
          state.attempts++;
          logger.error(`[Password-Reset] Could not deliver request ${request.id} (attempt ${state.attempts}):`, error);
          if (state.attempts < MAX_DM_ATTEMPTS) return;
          // A DM that cannot be delivered is, for the member, a closed DM: reporting `failed` (final) would take the
          // public-channel fallback away from someone who has no other way to get the message
          state.outcome = request.delivery === 'dm' ? 'dms_closed' : 'failed';
        }
      }

      try {
        await deps.reportDelivery(request.id, state.outcome);
        state.reported = true;
        logger.log(`[Password-Reset] Request ${request.id} (${request.delivery}): ${state.outcome}`);
      } catch (error) {
        if (isSettled(error)) state.reported = true; // gone or already settled: nothing left to tell
        else logger.error(`[Password-Reset] Could not report request ${request.id}; trying again:`, error);
      }
    } finally {
      state.busy = false;
    }
  };

  const poll = async () => {
    let next = POLL_INTERVAL_MS;
    let pending: PendingReset[] = [];
    try {
      pending = await deps.fetchPending();
      if (failures > 0) logger.log('[Password-Reset] Recovered; polling again.');
      failures = 0;
    } catch (error) {
      failures++;
      if (failures === 1) logger.error('[Password-Reset] Could not poll the API; retrying with backoff:', error);
      next = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** (failures - 1));
    }
    // Before delivering: a slow send must not let the heartbeat lapse
    deps.schedule(() => void poll(), next);
    await Promise.all(pending.map(handle));
  };

  return { start: () => void poll(), poll };
};

/** Starts delivering password resets. */
export const startPasswordResetSync = (client: Client) => {
  const targets: DeliveryTargets = {
    fetchUser: id => client.users.fetch(id),
    async fetchChannel() {
      const id = env.PASSWORD_RESET_CHANNEL_ID;
      if (!id) return null;
      const channel = await client.channels.fetch(id);
      return channel?.isTextBased() && 'send' in channel ? channel : null;
    },
  };

  createPasswordResetSync({
    fetchPending: listPendingResets,
    deliver: request => deliverReset(request, targets),
    reportDelivery,
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    logger: console,
  }).start();
};
