import type { PartialUser, User } from 'discord.js';
import { env } from '../config/env';
import { avatarUrlOf } from '../lib/discord';
import { syncProfile } from '../services/users';

export const userUpdateEvent = async (oldUser: User | PartialUser, newUser: User) => {
  if (env.GUILD_ID) {
    const guild = newUser.client.guilds.cache.get(env.GUILD_ID);
    // Ignore users that aren't part of the home guild
    if (!guild || !guild.members.cache.has(newUser.id)) return;
  }

  const avatarChanged = oldUser.avatar !== newUser.avatar;
  const usernameChanged = oldUser.username !== newUser.username;
  if (!avatarChanged && !usernameChanged) return;

  try {
    await syncProfile(newUser.id, {
      avatarUrl: avatarChanged ? avatarUrlOf(newUser) : undefined,
      username: usernameChanged ? newUser.username : undefined,
    });
    console.log(`Updated user data for ${newUser.tag} (Avatar: ${avatarChanged}, Username: ${usernameChanged})`);
  } catch (error) {
    console.error(`Failed to update user data for ${newUser.id}:`, error);
  }
};
