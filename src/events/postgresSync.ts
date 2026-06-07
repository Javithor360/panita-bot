import { Client } from 'discord.js';
import { Client as PgClient } from 'pg';
import { PrismaClient } from '@prisma/client';
import { acquireSyncLock, releaseSyncLock } from '../utils/syncLock';

const prisma = new PrismaClient();

export function initPostgresSync(client: Client) {
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    console.error("No GUILD_ID found in .env file");
    return;
  }

  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("No DATABASE_URL found in .env file");
    return;
  }

  // LISTEN/NOTIFY requires a direct connection to Postgres, not through PgBouncer in transaction mode.
  // We automatically replace the port 6543 (pooler) with 5432 (direct) and remove pgbouncer params.
  connectionString = connectionString
    .replace(':6543', ':5432')
    .replace('?pgbouncer=true', '')
    .replace('&pgbouncer=true', '');

  const pgClient = new PgClient({
    connectionString,
  });

  pgClient.connect().then(() => {
    console.log('Connected to PostgreSQL for LISTEN/NOTIFY sync...');
    pgClient.query('LISTEN discord_sync');
  }).catch(err => {
    console.error('Failed to connect to PostgreSQL:', err);
  });

  const applyDiscordRole = async (userId: any, roleIdOrEditionId: any, type: 'role' | 'edition', action: 'add' | 'remove') => {
    try {
      if (!userId || !roleIdOrEditionId) {
        console.warn(`[PG-Sync] Ignored event due to missing IDs.`);
        return;
      }

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      const parsedUserId = Number(userId);
      if (isNaN(parsedUserId)) return;

      const user = await prisma.user.findUnique({ where: { id: parsedUserId } });
      if (!user || !user.discord_id) return;

      let discordRoleId: string | null = null;
      if (type === 'role') {
        const role = await prisma.role.findUnique({ where: { id: String(roleIdOrEditionId) } });
        discordRoleId = role?.discord_role_id || null;
      } else {
        const edition = await prisma.edition.findUnique({ where: { id: String(roleIdOrEditionId) } });
        discordRoleId = edition?.discord_role_id || null;
      }

      if (!discordRoleId) return;

      const member = await guild.members.fetch(user.discord_id).catch(() => null);
      if (!member) return;

      if (action === 'add') {
        if (!member.roles.cache.has(discordRoleId)) {
          acquireSyncLock(user.discord_id);
          try {
            await member.roles.add(discordRoleId);
            console.log(`[PG-Sync] Added ${type} role ${discordRoleId} to ${user.ign}`);
          } finally {
            // Keep the lock active for a short buffer to catch the gateway event
            setTimeout(() => releaseSyncLock(user.discord_id), 2500);
          }
        }
      } else {
        if (member.roles.cache.has(discordRoleId)) {
          acquireSyncLock(user.discord_id);
          try {
            await member.roles.remove(discordRoleId);
            console.log(`[PG-Sync] Removed ${type} role ${discordRoleId} from ${user.ign}`);
          } finally {
            setTimeout(() => releaseSyncLock(user.discord_id), 2500);
          }
        }
      }
    } catch (error) {
      console.error(`[PG-Sync] Error applying discord role:`, error);
    }
  };

  pgClient.on('notification', (msg) => {
    if (msg.channel === 'discord_sync' && msg.payload) {
      try {
        const data = JSON.parse(msg.payload);
        console.log(`[PG-Sync] Event received on ${data.table}: ${data.action}`);
        
        if (data.table === '_RoleToUser') {
          // Prisma implicit tables use A for Role (string) and B for User (int)
          const possibleUserId = Number(data.record.B);
          if (!isNaN(possibleUserId)) {
            applyDiscordRole(data.record.B, data.record.A, 'role', data.action);
          } else {
            applyDiscordRole(data.record.A, data.record.B, 'role', data.action);
          }
        } else if (data.table === 'UserEdition') {
          applyDiscordRole(data.record.user_id, data.record.edition_id, 'edition', data.action);
        }
      } catch (e) {
        console.error('[PG-Sync] Failed to parse notification payload:', e);
      }
    }
  });

  pgClient.on('error', (err) => {
    console.error('[PG-Sync] Database connection error:', err);
  });
}
