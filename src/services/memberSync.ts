import { prisma } from '../lib/prisma';

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
