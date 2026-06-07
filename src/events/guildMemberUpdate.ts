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

        // Sync Editions
        const dbEditionsWithDiscordRoles = await prisma.edition.findMany({
          where: { discord_role_id: { not: null } }
        });

        const assignedDiscordEditionIds = dbEditionsWithDiscordRoles
          .filter(e => roleIds.includes(e.discord_role_id!))
          .map(e => e.id);
          
        const managedEditionIds = dbEditionsWithDiscordRoles.map(e => e.id);

        const existingUserEditions = await prisma.userEdition.findMany({
          where: { 
            user_id: dbUser.id,
            edition_id: { in: managedEditionIds } 
          }
        });
        
        const existingEditionIds = existingUserEditions.map(ue => ue.edition_id);
        
        const toAdd = assignedDiscordEditionIds.filter(id => !existingEditionIds.includes(id));
        const toRemove = existingEditionIds.filter(id => !assignedDiscordEditionIds.includes(id));
        
        if (toRemove.length > 0) {
          await prisma.userEdition.deleteMany({
            where: {
              user_id: dbUser.id,
              edition_id: { in: toRemove }
            }
          });
        }
        
        if (toAdd.length > 0) {
          await prisma.userEdition.createMany({
            data: toAdd.map(editionId => ({
              user_id: dbUser.id,
              edition_id: editionId,
              joined_at: new Date()
            }))
          });
        }

        console.log(`Synced roles and editions for user ${newMember.user.tag}`);
      }
    } catch (error) {
      console.error(`Failed to sync roles for user ${discordId}:`, error);
    }
  }
};
