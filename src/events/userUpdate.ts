import { User, PartialUser } from 'discord.js';
import { prisma } from '../lib/prisma';

export const userUpdateEvent = async (oldUser: User | PartialUser, newUser: User) => {
  if (process.env.GUILD_ID) {
    const guild = newUser.client.guilds.cache.get(process.env.GUILD_ID);
    // If the guild is not found or the user is not in the guild, ignore the update
    if (!guild || !guild.members.cache.has(newUser.id)) return;
  }

  // Check if avatar has changed
  if (oldUser.avatar !== newUser.avatar) {
    const discordId = newUser.id;
    const newAvatarUrl = newUser.displayAvatarURL({ size: 256, extension: 'png' });

    try {
      // We use updateMany to avoid crashing if the user doesn't exist in our DB
      await prisma.user.updateMany({
        where: { discord_id: discordId },
        data: { avatar_url: newAvatarUrl },
      });
      console.log(`Updated avatar for user ${newUser.tag}`);
    } catch (error) {
      console.error(`Failed to update avatar for user ${discordId}:`, error);
    }
  }
};
