import { api, ApiError } from '../lib/api';
import type { PendingReset, ReportedDelivery } from '../lib/api/types';
import { InvalidActivationError, isNotActivated, NotActivatedError } from './users';

export type { PendingReset, ReportedDelivery };

/** The request expired, was already used or cancelled, or does not belong to this member. */
export class ResetNotAvailableError extends Error {}

/** A request the API answers `404` or `410` for can no longer be used, whichever of the two it was. */
const isGone = (error: unknown): boolean => error instanceof ApiError && (error.status === 404 || error.status === 410);

/**
 * The reset requests the bot still has to deliver. Being asked is also how the API knows the bot is alive,
 * so the poller calls it often and it is not retried: the next poll is the retry.
 */
export const listPendingResets = (): Promise<PendingReset[]> =>
  api.get<PendingReset[]>('/v1/discord/password-resets/pending', { idempotent: false, quiet: true });

/** Tells the API whether the request reached the member. Throws `ApiError` (`404`/`410` when it is no longer open). */
export const reportDelivery = async (id: string, status: ReportedDelivery): Promise<void> => {
  await api.post('/v1/discord/password-resets/{id}/delivery', { status }, { params: { id } });
};

/**
 * Replaces the member's password with the one they typed in Discord, once. Throws `InvalidActivationError`
 * (`length` or `special`; the request stays open so they can try again), `ResetNotAvailableError` or
 * `NotActivatedError`. Never retried: the password travels in the body and the request is single use.
 */
export const completeReset = async (id: string, discordId: string, password: string): Promise<void> => {
  try {
    await api.post('/v1/discord/password-resets/{id}/complete', { discord_id: discordId, password }, { params: { id } });
  } catch (error) {
    if (isGone(error)) throw new ResetNotAvailableError(id);
    if (isNotActivated(error)) throw new NotActivatedError(discordId);
    if (error instanceof ApiError && error.status === 400) {
      const reason = error.details?.reason;
      if (reason === 'length' || reason === 'special') throw new InvalidActivationError(reason);
    }
    throw error;
  }
};

/** Cancels the request ("Ignorar"). Throws `ResetNotAvailableError` when it can no longer be cancelled. */
export const ignoreReset = async (id: string, discordId: string): Promise<void> => {
  try {
    await api.post('/v1/discord/password-resets/{id}/ignore', { discord_id: discordId }, { params: { id } });
  } catch (error) {
    if (isGone(error)) throw new ResetNotAvailableError(id);
    throw error;
  }
};
