import { MODERATION } from '../config/constants';
import { UserError } from '../core/errors';
import { api, isApiError } from '../lib/api';
import type { BlacklistEntry, BlacklistMeta, BlacklistStatus } from '../lib/api/types';
import { createTtlCache } from '../lib/ttlCache';

export type { BlacklistEntry };

/** The user already has an active entry. */
export class AlreadyBlacklistedError extends Error {
  constructor() {
    super('The user is already blacklisted');
  }
}

/** The entry does not exist. */
export class BlacklistEntryNotFoundError extends Error {
  constructor() {
    super('The blacklist entry does not exist');
  }
}

/** Somebody removed the entry first. */
export class BlacklistEntryAlreadyRevokedError extends Error {
  constructor() {
    super('The blacklist entry was already removed');
  }
}

/** How many entries one call asks for. */
const PAGE_SIZE = 100;

/** The answer to "is this user blacklisted?" is reused for this long, because it is asked before every command. */
export const STATUS_TTL_MS = 30_000;

const statuses = createTtlCache<BlacklistEntry | null>(STATUS_TTL_MS);

/** A reason for the API: trimmed, never empty and never longer than it accepts. */
const reasonFor = (text: string): string => {
  const reason = text.trim();
  if (!reason) throw new UserError('Debes indicar una razón.');
  if (reason.length > MODERATION.reasonMax) {
    throw new UserError(`La razón es demasiado larga (máximo ${MODERATION.reasonMax} caracteres).`);
  }
  return reason;
};

/** Bars a user from the bot, for good or until `expiresAt`. */
export const addToBlacklist = async (entry: {
  userId: string;
  moderatorId: string;
  reason: string;
  expiresAt?: Date;
}): Promise<BlacklistEntry> => {
  try {
    const created = await api.post<BlacklistEntry>('/v1/discord/blacklist', {
      user_id: entry.userId,
      moderator_id: entry.moderatorId,
      reason: reasonFor(entry.reason),
      ...(entry.expiresAt ? { expires_at: entry.expiresAt.toISOString() } : {}),
    });
    statuses.delete(entry.userId);
    return created;
  } catch (error) {
    if (isApiError(error, 409)) throw new AlreadyBlacklistedError();
    throw error;
  }
};

export interface BlacklistPage {
  /** Newest first. */
  entries: BlacklistEntry[];
  /** How many entries match the filter, which can be more than `entries` holds. */
  total: number;
}

/** The entries, newest first. `active` leaves out the removed and the expired ones. */
export const listBlacklist = async ({ active = true }: { active?: boolean } = {}): Promise<BlacklistPage> => {
  const page = await api.getEnvelope<BlacklistEntry[], BlacklistMeta>('/v1/discord/blacklist', {
    query: { active: active ? 'true' : 'false', limit: PAGE_SIZE },
  });
  return { entries: page.data, total: page.meta.total };
};

/** The active entry of a user, or `null`. Never cached, because a moderator acts on what it shows. */
export const findActiveEntry = async (discordId: string): Promise<BlacklistEntry | null> => {
  const status = await api.get<BlacklistStatus>('/v1/discord/blacklist/users/{discordId}', { params: { discordId } });
  statuses.set(discordId, status.entry);
  return status.entry;
};

/** Removes an entry, which stays in the history. */
export const removeFromBlacklist = async (entry: BlacklistEntry, revokedBy: string, reason?: string): Promise<BlacklistEntry> => {
  const text = reason?.trim();
  try {
    const revoked = await api.patch<BlacklistEntry>(
      '/v1/discord/blacklist/{id}',
      { revoked_by: revokedBy, ...(text ? { reason: reasonFor(text) } : {}) },
      { params: { id: entry.id } },
    );
    statuses.delete(entry.user_id);
    return revoked;
  } catch (error) {
    if (isApiError(error, 404)) throw new BlacklistEntryNotFoundError();
    if (isApiError(error, 409)) throw new BlacklistEntryAlreadyRevokedError();
    throw error;
  }
};

/**
 * The check before every command: the active entry of the user, or `null`. It fails open: when the API cannot answer,
 * nobody is locked out of the bot (a blacklisted user gets through during an outage, which is accepted).
 */
export const blacklistEntryOf = async (discordId: string): Promise<BlacklistEntry | null> => {
  const known = statuses.get(discordId);
  if (known !== undefined) return known;
  try {
    return await findActiveEntry(discordId);
  } catch (error) {
    console.warn('[Blacklist] Could not check the blacklist, letting the member through:', error instanceof Error ? error.message : error);
    return null;
  }
};
