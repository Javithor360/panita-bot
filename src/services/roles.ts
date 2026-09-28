import { prisma } from '../lib/prisma';

/**
 * Removes the Discord mapping of a deleted Discord role. The web role itself is kept so relations
 * and historical data aren't lost.
 */
export const unmapDiscordRole = async (discordRoleId: string) => {
  const { count } = await prisma.role.updateMany({
    where: { discord_role_id: discordRoleId },
    data: { discord_role_id: null },
  });
  return count;
};
