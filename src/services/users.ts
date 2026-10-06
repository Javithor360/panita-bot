import type { User } from 'discord.js';
import { API_TIMEOUTS, api, ApiError } from '../lib/api';
import type { BotUser, BulkDeleteResult, EnsureUserResult } from '../lib/api/types';
import { avatarUrlOf } from '../lib/discord';

export type { BotUser };

/** Largest batch `POST /v1/discord/users/bulk-delete` accepts. */
const BULK_DELETE_CHUNK_SIZE = 500;

export class IgnTakenError extends Error {}
export class UserNotFoundError extends Error {}
export class AlreadyActivatedError extends Error {}
/** The API refused the IGN or the password; `reason` says which rule failed. */
export class InvalidActivationError extends Error {
  constructor(readonly reason: 'ign_format' | 'special' | 'length') {
    super(reason);
  }
}

export interface DiscordProfile {
  discordId: string;
  username: string;
  avatarUrl: string;
  joinedAt?: Date | null;
}

export const profileOf = (user: User, joinedAt?: Date | null): DiscordProfile => ({
  discordId: user.id,
  username: user.username,
  avatarUrl: avatarUrlOf(user),
  joinedAt,
});

/**
 * Returns the user's account, creating a disabled one (no IGN/password, default role) if missing.
 * Safe to call concurrently: the API creates it exactly once.
 */
export const ensureUser = (profile: DiscordProfile): Promise<EnsureUserResult> =>
  api.put<EnsureUserResult>(
    '/v1/discord/users/{discordId}',
    { username: profile.username, avatar_url: profile.avatarUrl, joined_at: profile.joinedAt?.toISOString() ?? null },
    { params: { discordId: profile.discordId } },
  );

/** Updates the cached Discord profile fields. No-op when the user has no account. */
export const syncProfile = async (discordId: string, fields: { username?: string; avatarUrl?: string }) => {
  const body = { username: fields.username, avatar_url: fields.avatarUrl };
  if (body.username === undefined && body.avatar_url === undefined) return 0;

  // Writing the same values again changes nothing, so a failed call may be repeated
  const { updated } = await api.patch<{ updated: number }>('/v1/discord/users/{discordId}/profile', body, {
    params: { discordId },
    idempotent: true,
  });
  return updated;
};

/**
 * Enables the web account with its IGN and password (the API validates and hashes the password).
 * Throws `InvalidActivationError`, `IgnTakenError`, `AlreadyActivatedError` or `UserNotFoundError`
 * for the rejections the caller is expected to explain to the user.
 */
export const activateAccount = async (discordId: string, ign: string, password: string): Promise<void> => {
  try {
    await api.post('/v1/discord/users/{discordId}/activate', { ign, password }, { params: { discordId } });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) throw new UserNotFoundError(discordId);
      if (error.status === 409 && error.code === 'already_activated') throw new AlreadyActivatedError(discordId);
      if (error.status === 409 && error.details?.field === 'ign') throw new IgnTakenError(ign);
      const reason = error.details?.reason;
      if (error.status === 400 && (reason === 'ign_format' || reason === 'special' || reason === 'length')) {
        throw new InvalidActivationError(reason);
      }
    }
    throw error;
  }
};

/** Deletes the accounts in chunks. Accounts that own web content are skipped, not deleted. */
export const deleteUsersByDiscordIds = async (discordIds: string[]): Promise<BulkDeleteResult> => {
  const total: BulkDeleteResult = { deleted: 0, skipped: [] };
  for (let i = 0; i < discordIds.length; i += BULK_DELETE_CHUNK_SIZE) {
    const result = await api.post<BulkDeleteResult>(
      '/v1/discord/users/bulk-delete',
      { discord_ids: discordIds.slice(i, i + BULK_DELETE_CHUNK_SIZE) },
      { timeoutMs: API_TIMEOUTS.bulk },
    );
    total.deleted += result.deleted;
    total.skipped.push(...result.skipped);
  }
  return total;
};
