import type { GuildMember } from 'discord.js';
import { API_TIMEOUTS, api, isApiError } from '../lib/api';
import type { ResyncSummary, RoleSyncCounts } from '../lib/api/types';
import { avatarUrlOf, isAltAccount } from '../lib/discord';
import { syncProfile } from './users';

export type { ResyncSummary };
export type MemberSyncResult = RoleSyncCounts;

export interface MemberSyncOptions {
  /**
   * Delete `UserEdition` rows whose edition role the member no longer has.
   * TODO: soft-disable UserEdition (an `enabled` flag) instead of deleting, so `history_text`
   * written on panita-web is never lost when a Discord role is removed.
   */
  removeEditions: boolean;
}

/** Largest chunk `POST /v1/discord/members/resync` accepts. */
const RESYNC_CHUNK_SIZE = 50;

/**
 * Mirrors a member's Discord roles into the database: web roles and editions that are mapped to a
 * Discord role (`discord_role_id`). Roles without a Discord mapping are managed only by the web and
 * are never touched. Returns `null` when the member has no account.
 */
export const syncMemberRoles = async (
  discordId: string,
  discordRoleIds: string[],
  { removeEditions }: MemberSyncOptions,
): Promise<MemberSyncResult | null> => {
  try {
    return await api.put<RoleSyncCounts>(
      '/v1/discord/users/{discordId}/roles',
      { discord_role_ids: discordRoleIds, remove_editions: removeEditions },
      { params: { discordId } },
    );
  } catch (error) {
    if (isApiError(error, 404)) return null;
    throw error;
  }
};

export interface AvatarSyncSummary {
  /** Accounts whose stored avatar was written. */
  updated: number;
  /** Members the API left alone: no account, or nothing to change. */
  unchanged: number;
  /** Members whose call failed; the rest still went through. */
  failed: number;
  /** Bots and alt accounts. */
  skipped: number;
}

/** How many profile updates run at once; the API has no bulk route for profiles. */
const AVATAR_SYNC_CONCURRENCY = 5;

/**
 * Writes the current Discord avatar (the server one when the member has it, like the live events do)
 * of every member that has an account. Never creates accounts. A failed member is counted and does
 * not stop the rest.
 */
export const syncAvatars = async (members: GuildMember[]): Promise<AvatarSyncSummary> => {
  const eligible = members.filter(m => !m.user.bot && !isAltAccount(m));
  const summary: AvatarSyncSummary = { updated: 0, unchanged: 0, failed: 0, skipped: members.length - eligible.length };

  for (let i = 0; i < eligible.length; i += AVATAR_SYNC_CONCURRENCY) {
    const batch = eligible.slice(i, i + AVATAR_SYNC_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(member => syncProfile(member.id, { avatarUrl: avatarUrlOf(member) })));

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (result.value > 0) summary.updated += 1;
        else summary.unchanged += 1;
      } else {
        summary.failed += 1;
        console.error(`[AvatarSync] Failed for ${batch[index].id}:`, result.reason);
      }
    });
  }

  return summary;
};

/**
 * Full, non-destructive resync of every member: creates missing accounts, refreshes profile data and
 * mirrors mapped roles. Editions are only added, never removed, so web-managed data is preserved.
 * Bots and alt accounts are skipped. Chunks are sent one after another.
 */
export const resyncMembers = async (members: GuildMember[]): Promise<ResyncSummary> => {
  const eligible = members.filter(m => !m.user.bot && !isAltAccount(m));
  const summary: ResyncSummary = { processed: 0, created: 0, skipped: members.length - eligible.length };

  for (let i = 0; i < eligible.length; i += RESYNC_CHUNK_SIZE) {
    const chunk = eligible.slice(i, i + RESYNC_CHUNK_SIZE).map(member => ({
      discord_id: member.id,
      username: member.user.username,
      avatar_url: avatarUrlOf(member.user),
      joined_at: member.joinedAt?.toISOString() ?? null,
      discord_role_ids: [...member.roles.cache.keys()],
    }));

    // Repeating a resync changes nothing, so a failed chunk may be retried
    const result = await api.post<ResyncSummary>(
      '/v1/discord/members/resync',
      { members: chunk },
      { timeoutMs: API_TIMEOUTS.bulk, idempotent: true },
    );
    summary.processed += result.processed;
    summary.created += result.created;
    summary.skipped += result.skipped;
  }

  return summary;
};
