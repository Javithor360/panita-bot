import { GuildMember } from 'discord.js';
import { prisma } from '../lib/prisma';

export const guildMemberAddEvent = async (member: GuildMember) => {
  if (process.env.GUILD_ID && member.guild.id !== process.env.GUILD_ID) return;

  const discordId = member.user.id;
  const avatarUrl = member.user.displayAvatarURL({ size: 256, extension: 'png' });

  try {
    // If the user already exists in the DB, ensure their avatar is up to date when they join
    await prisma.user.updateMany({
      where: { discord_id: discordId },
      data: { avatar_url: avatarUrl },
    });
    console.log(`Synced avatar for newly joined member ${member.user.tag}`);
  } catch (error) {
    console.error(`Failed to sync avatar on member join for ${discordId}:`, error);
  }
};
