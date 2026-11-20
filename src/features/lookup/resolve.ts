import type { Client, Guild, GuildMember } from 'discord.js';
import { EXACT, rankMembers, type LookupMember, type Ranked } from './rank';

/** How many people the confirmation menu can hold (Discord allows 25 options). */
export const MAX_CANDIDATES = 25;

const MENTION = /^<@!?(\d{17,20})>$/;
const SNOWFLAKE = /^\d{17,20}$/;

/** What the lookup needs from Discord, so it can be tested without it. */
export interface TargetSource {
  cachedMembers(): Iterable<LookupMember>;
  searchMembers(query: string, limit: number): Promise<LookupMember[]>;
  /** Whether an account with that ID exists, in the server or not. */
  accountExists(id: string): Promise<boolean>;
}

export interface TargetInput {
  /** The user option, or a mention or ID that the prefix parser already took out of the text. */
  user: { id: string } | null;
  /** What was written instead: a name, an ID or a mention. */
  query: string | null;
  /** Whoever asked, who is the target when nothing is given. */
  selfId: string;
}

export type LookupFailure = 'unknown_id' | 'no_match' | 'too_many';

export type TargetResult =
  | { kind: 'found'; userId: string }
  | { kind: 'ask'; candidates: LookupMember[] }
  | { kind: 'none'; reason: LookupFailure };

/** The plain text of each failure, written to be shown as `❌ ~ **Name**, text` (Noa's own words). */
export const lookupFailureText = (reason: LookupFailure): string => {
  switch (reason) {
    case 'unknown_id': return 'esa ID no pertenece a nadie.';
    case 'too_many': return 'muchos usuarios coinciden con tu búsqueda, intenta ser más específico.';
    default: return 'no hay usuarios que coincidan con tu búsqueda, intenta ser más específico.';
  }
};

/** An ID or a mention in the text, if that is what it is. */
export const idFromText = (text: string): string | null => {
  const clean = text.trim();
  return MENTION.exec(clean)?.[1] ?? (SNOWFLAKE.test(clean) ? clean : null);
};

/**
 * Who the command is about:
 *  - nothing given: the person who asked;
 *  - a user, a mention or an ID: that account, **even when it is not in the server**;
 *  - a name: the best match among the members. One match (or one exact match among several) is used; several are
 *    handed back so the person can pick one; none, or too many, is a failure.
 */
export const resolveTarget = async (source: TargetSource, input: TargetInput): Promise<TargetResult> => {
  if (input.user) return { kind: 'found', userId: input.user.id };

  const query = input.query?.trim();
  if (!query) return { kind: 'found', userId: input.selfId };

  const id = idFromText(query);
  if (id) return (await source.accountExists(id)) ? { kind: 'found', userId: id } : { kind: 'none', reason: 'unknown_id' };

  const searched = await source.searchMembers(query, MAX_CANDIDATES + 1).catch(() => [] as LookupMember[]);
  const ranked = rankMembers(query, [...source.cachedMembers(), ...searched]);

  if (ranked.length === 0) return { kind: 'none', reason: 'no_match' };
  if (ranked.length === 1) return { kind: 'found', userId: ranked[0].member.id };

  const exact = ranked.filter((entry: Ranked) => entry.score === EXACT);
  if (exact.length === 1) return { kind: 'found', userId: exact[0].member.id };

  if (ranked.length > MAX_CANDIDATES) return { kind: 'none', reason: 'too_many' };
  return { kind: 'ask', candidates: ranked.map(entry => entry.member) };
};

export const lookupMemberOf = (member: GuildMember): LookupMember => ({
  id: member.id,
  username: member.user.username,
  globalName: member.user.globalName,
  nickname: member.nickname,
  displayName: member.displayName,
});

/** The real source: the member cache, a search on Discord for those that are not cached, and the accounts of Discord. */
export const discordSource = (guild: Guild, client: Client): TargetSource => ({
  cachedMembers: () => [...guild.members.cache.values()].map(lookupMemberOf),
  searchMembers: async (query, limit) => [...(await guild.members.search({ query, limit })).values()].map(lookupMemberOf),
  accountExists: async id => !!(await client.users.fetch(id).catch(() => null)),
});
