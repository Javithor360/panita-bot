import { api, ApiError } from '../lib/api';
import type { BotSession, ConfirmedLogin } from '../lib/api/types';
import { isNotActivated, NotActivatedError } from './users';

export type { BotSession, ConfirmedLogin };

/** No open login request of this member has that code: it is wrong, expired or already used. */
export class CodeNotFoundError extends Error {}

/**
 * Confirms the sign-in that the member's code belongs to; the waiting app collects its session on its
 * next poll. Throws `CodeNotFoundError` or `NotActivatedError`.
 */
export const confirmLogin = async (discordId: string, code: string): Promise<ConfirmedLogin> => {
  try {
    // Never retried (the default for POST): after a lost answer, a second try would report "not found" for
    // a request that was in fact confirmed
    return await api.post<ConfirmedLogin>('/v1/discord/login-requests/confirm', { discord_id: discordId, code });
  } catch (error) {
    if (isNotActivated(error)) throw new NotActivatedError(discordId);
    if (error instanceof ApiError && error.status === 404 && error.details?.reason === 'code_not_found') {
      throw new CodeNotFoundError(code);
    }
    throw error;
  }
};

/** The member's open sessions, newest first (at most 20). A member with no account has none. */
export const listSessions = async (discordId: string): Promise<BotSession[]> => {
  try {
    return await api.get<BotSession[]>('/v1/discord/users/{discordId}/sessions', { params: { discordId } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return [];
    throw error;
  }
};

/** Closes one session. Returns false when it was already gone. */
export const revokeSession = async (discordId: string, sessionId: string): Promise<boolean> => {
  try {
    await api.delete('/v1/discord/users/{discordId}/sessions/{sessionId}', { params: { discordId, sessionId } });
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return false;
    throw error;
  }
};

/** Closes every session of the member and returns how many were open. */
export const revokeAllSessions = async (discordId: string): Promise<number> => {
  try {
    const { revoked } = await api.delete<{ revoked: number }>('/v1/discord/users/{discordId}/sessions', { params: { discordId } });
    return revoked;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return 0;
    throw error;
  }
};
