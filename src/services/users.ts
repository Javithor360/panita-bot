import type { User } from 'discord.js';
import { API_TIMEOUTS, api, ApiError } from '../lib/api';
import type {
  BotUser,
  BulkDeleteResult,
  DeactivateResult,
  EnabledIdsMeta,
  EnsureUserResult,
  MinecraftStatus,
} from '../lib/api/types';
import { avatarUrlOf } from '../lib/discord';

export type { BotUser };

/** Largest batch `POST /v1/discord/users/bulk-delete` accepts. */
const BULK_DELETE_CHUNK_SIZE = 500;

export class IgnTakenError extends Error {}
export class UserNotFoundError extends Error {}
export class AlreadyActivatedError extends Error {}
/** The account exists but is disabled (or has no row yet), so the action needs `/register` first. */
export class NotActivatedError extends Error {}
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

export interface ActivationInput {
  ign: string;
  minecraftStatus: MinecraftStatus;
  /** The optional legacy password; without one the account signs in with codes only. */
  password?: string;
}

/**
 * Enables the account with its IGN and Minecraft status, and a password when one is given (the API
 * validates and hashes it). Throws `InvalidActivationError`, `IgnTakenError`, `AlreadyActivatedError` or
 * `UserNotFoundError` for the rejections the caller is expected to explain to the user.
 */
export const activateAccount = async (
  discordId: string,
  { ign, minecraftStatus, password }: ActivationInput,
): Promise<void> => {
  try {
    const body = { ign, minecraft_status: minecraftStatus, ...(password === undefined ? {} : { password }) };
    await api.post('/v1/discord/users/{discordId}/activate', body, { params: { discordId } });
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

/** A `409` that says the account is not activated; the API puts the reason in `code` or in `details.reason`. */
export const isNotActivated = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.status === 409 &&
  (error.code === 'not_activated' || error.details?.reason === 'not_activated');

/** Records whether the member plays with a premium account. Throws `UserNotFoundError` or `NotActivatedError`. */
export const setMinecraftStatus = async (discordId: string, minecraftStatus: MinecraftStatus): Promise<void> => {
  try {
    // Writing the same value again changes nothing, so PUT keeps the client's default retries
    await api.put('/v1/discord/users/{discordId}/minecraft-status', { minecraft_status: minecraftStatus }, { params: { discordId } });
  } catch (error) {
    if (isNotActivated(error)) throw new NotActivatedError(discordId);
    if (error instanceof ApiError && error.status === 404) throw new UserNotFoundError(discordId);
    throw error;
  }
};

/**
 * Sets or replaces the legacy password of an active account (the API validates and hashes it, and closes
 * every session when it replaces an existing one). Throws `InvalidActivationError` (`special` or `length`),
 * `NotActivatedError` or `UserNotFoundError`.
 */
export const setPassword = async (discordId: string, password: string): Promise<void> => {
  try {
    await api.put('/v1/discord/users/{discordId}/password', { password }, { params: { discordId } });
  } catch (error) {
    if (error instanceof ApiError) {
      if (isNotActivated(error)) throw new NotActivatedError(discordId);
      if (error.status === 404) throw new UserNotFoundError(discordId);
      const reason = error.details?.reason;
      if (error.status === 400 && (reason === 'special' || reason === 'length')) throw new InvalidActivationError(reason);
    }
    throw error;
  }
};

/**
 * Disables the account and closes its sessions; the IGN, status and password are kept. Returns whether
 * anything changed (false for an account that was already disabled or does not exist). Other failures are
 * thrown for the caller to log; no member sees them.
 */
export const deactivateAccount = async (discordId: string): Promise<boolean> => {
  try {
    // The route is idempotent, so a failed call may be repeated
    const { deactivated } = await api.post<DeactivateResult>('/v1/discord/users/{discordId}/deactivate', undefined, {
      params: { discordId },
      idempotent: true,
    });
    return deactivated;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return false;
    throw error;
  }
};

/** Largest page `GET /v1/discord/users/enabled-ids` returns. */
const ENABLED_IDS_PAGE_SIZE = 500;

/** The Discord ids of every enabled account, read page by page. */
export const listEnabledDiscordIds = async (): Promise<string[]> => {
  const ids: string[] = [];
  for (let after = 0; ; ) {
    const page = await api.getEnvelope<string[], EnabledIdsMeta>('/v1/discord/users/enabled-ids', {
      query: { after, limit: ENABLED_IDS_PAGE_SIZE },
      timeoutMs: API_TIMEOUTS.bulk,
    });
    ids.push(...page.data);
    // The cursor is an account id, not a Discord id; it is null on the last page
    if (page.meta.next_after === null) return ids;
    after = page.meta.next_after;
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
