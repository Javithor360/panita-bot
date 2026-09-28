import type { Role } from 'discord.js';
import { isHomeGuild } from '../lib/discord';
import { unmapDiscordRole } from '../services/roles';

export const roleDeleteEvent = async (role: Role) => {
  if (!isHomeGuild(role.guild)) return;

  try {
    const count = await unmapDiscordRole(role.id);
    if (count > 0) console.log(`Removed discord mapping for deleted role: ${role.name}`);
  } catch (error) {
    console.error(`Failed to handle deleted role ${role.id}:`, error);
  }
};
