import { GuildMember, PartialGuildMember } from 'discord.js';
import { prisma } from '../lib/prisma';

export const guildMemberUpdateEvent = async (oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) => {
  if (process.env.GUILD_ID && newMember.guild.id !== process.env.GUILD_ID) return;

  const discordId = newMember.user.id;
  
  // 1. Check for avatar changes (Server avatars vs Global avatars)
  if (oldMember.avatar !== newMember.avatar) {
    const avatarUrl = newMember.displayAvatarURL({ size: 256, extension: 'png' });
    try {
      await prisma.user.updateMany({
        where: { discord_id: discordId },
        data: { avatar_url: avatarUrl },
      });
      console.log(`Updated server avatar for user ${newMember.user.tag}`);
    } catch (error) {
      console.error(`Failed to update server avatar for user ${discordId}:`, error);
    }
  }

  // 2. Check for role changes
  if (oldMember.roles.cache.size !== newMember.roles.cache.size || !oldMember.roles.cache.equals(newMember.roles.cache)) {
    const newRoles = Array.from(newMember.roles.cache.values());
    const roleIds = newRoles.map(role => role.id);

    try {
      // Find the user in our DB first
      const dbUser = await prisma.user.findUnique({
        where: { discord_id: discordId },
      });

      if (dbUser) {
        // Find which roles from Discord exist in our Database (by discord_role_id)
        const dbRoles = await prisma.role.findMany({
          where: { discord_role_id: { in: roleIds } }
        });

        // Disconnect all existing roles and connect the new ones
        await prisma.user.update({
          where: { discord_id: discordId },
          data: {
            roles: {
              set: dbRoles.map(role => ({ id: role.id }))
            }
          }
        });
        console.log(`Synced roles for user ${newMember.user.tag}`);
      }
    } catch (error) {
      console.error(`Failed to sync roles for user ${discordId}:`, error);
    }
  }
};
