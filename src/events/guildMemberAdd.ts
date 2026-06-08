import { GuildMember } from 'discord.js';
import { prisma } from '../lib/prisma';

export const guildMemberAddEvent = async (member: GuildMember) => {
  if (process.env.GUILD_ID && member.guild.id !== process.env.GUILD_ID) return;

  if (member.user.bot) return;

  const discordId = member.user.id;
  const avatarUrl = member.user.displayAvatarURL({ size: 256, extension: 'png' });

  try {
    const existingUser = await prisma.user.findUnique({
      where: { discord_id: discordId }
    });

    if (existingUser) {
      // If the user already exists in the DB, ensure their avatar is up to date when they join
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { avatar_url: avatarUrl },
      });
      console.log(`Synced avatar for newly joined member ${member.user.tag}`);
    } else {
      // Find the Guest role in the database by its specific ID 'default'
      const guestRole = await prisma.role.findUnique({
        where: { id: 'default' }
      });

      const rolesToConnect = guestRole ? [{ id: guestRole.id }] : [];

      // Create disabled account
      await prisma.user.create({
        data: {
          discord_id: discordId,
          discord_name: member.user.username,
          ign: null,
          enabled: false,
          password: null,
          trusted_author: false,
          joined_at: member.joinedAt || new Date(),
          avatar_url: avatarUrl,
          roles: {
            connect: rolesToConnect
          }
        }
      });
      console.log(`Created disabled account for new member ${member.user.tag}. Guest role assigned: ${!!guestRole}`);
    }
  } catch (error) {
    console.error(`Failed to process member join for ${discordId}:`, error);
  }
};
