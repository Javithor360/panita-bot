import type { GuildMember } from 'discord.js';
import { prisma } from '../lib/prisma';
import { avatarUrlOf, isAltAccount } from '../lib/discord';
import { ensureUser, profileOf, syncProfile } from './users';

export interface MemberSyncOptions {
  /**
   * Delete `UserEdition` rows whose edition role the member no longer has.
   * TODO: soft-disable UserEdition (an `enabled` flag) instead of deleting, so `history_text`
   * written on panita-web is never lost when a Discord role is removed.
   */
  removeEditions: boolean;
}

export interface MemberSyncResult {
  rolesAdded: number;
  rolesRemoved: number;
  editionsAdded: number;
  editionsRemoved: number;
}

const difference = <T>(a: T[], b: T[]) => a.filter(item => !b.includes(item));

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
  const user = await prisma.user.findUnique({
    where: { discord_id: discordId },
    select: { id: true, roles: { select: { id: true, discord_role_id: true } } },
  });
  if (!user) return null;

  const [heldRoles, mappedEditions] = await Promise.all([
    prisma.role.findMany({ where: { discord_role_id: { in: discordRoleIds } }, select: { id: true } }),
    prisma.edition.findMany({ where: { discord_role_id: { not: null } }, select: { id: true, discord_role_id: true } }),
  ]);

  // Roles
  const currentMapped = user.roles.filter(r => r.discord_role_id !== null).map(r => r.id);
  const currentAll = user.roles.map(r => r.id);
  const target = heldRoles.map(r => r.id);
  const rolesToAdd = difference(target, currentAll);
  const rolesToRemove = difference(currentMapped, target);

  if (rolesToAdd.length > 0 || rolesToRemove.length > 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        roles: {
          connect: rolesToAdd.map(id => ({ id })),
          disconnect: rolesToRemove.map(id => ({ id })),
        },
      },
    });
  }

  // Editions
  const heldEditions = mappedEditions.filter(e => discordRoleIds.includes(e.discord_role_id!)).map(e => e.id);
  const existing = await prisma.userEdition.findMany({
    where: { user_id: user.id, edition_id: { in: mappedEditions.map(e => e.id) } },
    select: { edition_id: true },
  });
  const existingIds = existing.map(ue => ue.edition_id);
  const editionsToAdd = difference(heldEditions, existingIds);
  const editionsToRemove = removeEditions ? difference(existingIds, heldEditions) : [];

  if (editionsToRemove.length > 0) {
    await prisma.userEdition.deleteMany({ where: { user_id: user.id, edition_id: { in: editionsToRemove } } });
  }
  if (editionsToAdd.length > 0) {
    await prisma.userEdition.createMany({
      data: editionsToAdd.map(editionId => ({ user_id: user.id, edition_id: editionId, joined_at: new Date() })),
      skipDuplicates: true,
    });
  }

  return {
    rolesAdded: rolesToAdd.length,
    rolesRemoved: rolesToRemove.length,
    editionsAdded: editionsToAdd.length,
    editionsRemoved: editionsToRemove.length,
  };
};

export interface ResyncSummary {
  processed: number;
  created: number;
  skipped: number;
}

const RESYNC_CONCURRENCY = 5;

/**
 * Full, non-destructive resync of every member: creates missing accounts, refreshes profile data and
 * mirrors mapped roles. Editions are only added, never removed, so web-managed data is preserved.
 * Bots and alt accounts are skipped.
 */
export const resyncMembers = async (members: GuildMember[]): Promise<ResyncSummary> => {
  const summary: ResyncSummary = { processed: 0, created: 0, skipped: 0 };
  const eligible = members.filter(m => !m.user.bot && !isAltAccount(m));
  summary.skipped = members.length - eligible.length;

  for (let i = 0; i < eligible.length; i += RESYNC_CONCURRENCY) {
    await Promise.all(eligible.slice(i, i + RESYNC_CONCURRENCY).map(async member => {
      const { created } = await ensureUser(profileOf(member.user, member.joinedAt));
      if (!created) await syncProfile(member.id, { username: member.user.username, avatarUrl: avatarUrlOf(member.user) });
      await syncMemberRoles(member.id, [...member.roles.cache.keys()], { removeEditions: false });
      summary.processed++;
      if (created) summary.created++;
    }));
  }

  return summary;
};
