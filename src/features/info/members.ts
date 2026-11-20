import type { Guild } from 'discord.js';
import { createTtlCache } from '../../lib/ttlCache';

/**
 * The full member list, fetched at most once every ten minutes (Discord limits it): `server` and `user` both need it for
 * counts, join positions and the newest and oldest members; in between, the cache is used.
 */

const MEMBERS_TTL_MS = 10 * 60 * 1000;
const refreshed = createTtlCache<true>(MEMBERS_TTL_MS);

export const ensureMembers = async (guild: Guild): Promise<void> => {
  if (refreshed.get(guild.id)) return;
  refreshed.set(guild.id, true);
  try {
    await guild.members.fetch();
  } catch (error) {
    // The cache is used, and the next call tries again
    refreshed.delete(guild.id);
    console.warn('[Members] Could not fetch the members:', error);
  }
};

/** Whether the member cache holds (almost) everybody; a cache far from complete would give wrong numbers. */
export const isMemberListComplete = (cached: number, memberCount: number): boolean => cached > 0 && cached >= memberCount * 0.9;

export interface JoinEntry {
  id: string;
  joinedTimestamp: number | null;
}

/**
 * The place of a member by the date they joined, 1 being the first. `null` when the list is incomplete (the number would be
 * wrong) or the member has no join date.
 */
export const joinPosition = (entries: readonly JoinEntry[], id: string, complete: boolean): number | null => {
  if (!complete) return null;
  const own = entries.find(entry => entry.id === id);
  if (!own || own.joinedTimestamp === null) return null;
  return 1 + entries.filter(entry => entry.joinedTimestamp !== null && (entry.joinedTimestamp < own.joinedTimestamp! || (entry.joinedTimestamp === own.joinedTimestamp && entry.id < id))).length;
};

/** The first and last `count` members by join date, oldest first and newest first (only those with a join date). */
export const joinExtremes = <T extends JoinEntry>(entries: readonly T[], count: number): { oldest: T[]; newest: T[] } => {
  const dated = entries.filter(entry => entry.joinedTimestamp !== null).sort((a, b) => a.joinedTimestamp! - b.joinedTimestamp! || a.id.localeCompare(b.id));
  return { oldest: dated.slice(0, count), newest: dated.slice(-count).reverse() };
};
