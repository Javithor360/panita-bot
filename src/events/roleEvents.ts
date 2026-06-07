import { Role } from 'discord.js';
import { prisma } from '../lib/prisma';

export const roleDeleteEvent = async (role: Role) => {
  if (process.env.GUILD_ID && role.guild.id !== process.env.GUILD_ID) return;

  try {
    // We update discord_role_id to null instead of deleting the role entirely, 
    // to avoid breaking relations or losing historical data.
    await prisma.role.updateMany({
      where: { discord_role_id: role.id },
      data: { discord_role_id: null }
    });
    console.log(`Removed discord mapping for deleted role: ${role.name}`);
  } catch (error) {
    console.error(`Failed to handle deleted role ${role.id}:`, error);
  }
};
