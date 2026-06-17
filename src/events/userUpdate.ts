import { User, PartialUser } from 'discord.js';
import { prisma } from '../lib/prisma';

export const userUpdateEvent = async (oldUser: User | PartialUser, newUser: User) => {
  if (process.env.GUILD_ID) {
    const guild = newUser.client.guilds.cache.get(process.env.GUILD_ID);
    // If the guild is not found or the user is not in the guild, ignore the update
    if (!guild || !guild.members.cache.has(newUser.id)) return;
  }

  const avatarChanged = oldUser.avatar !== newUser.avatar;
  const usernameChanged = oldUser.username !== newUser.username;

  if (avatarChanged || usernameChanged) {
    const discordId = newUser.id;
    const newAvatarUrl = newUser.displayAvatarURL({ size: 256, extension: 'png' });
    const newUsername = newUser.username;

    const dataToUpdate: any = {};
    if (avatarChanged) dataToUpdate.avatar_url = newAvatarUrl;
    if (usernameChanged) dataToUpdate.discord_name = newUsername;

    try {
      // We use updateMany to avoid crashing if the user doesn't exist in our DB
      await prisma.user.updateMany({
        where: { discord_id: discordId },
        data: dataToUpdate,
      });
      console.log(`Updated user data for ${newUser.tag} (Avatar: ${avatarChanged}, Username: ${usernameChanged})`);
    } catch (error) {
      console.error(`Failed to update user data for ${discordId}:`, error);
    }
  }
};
