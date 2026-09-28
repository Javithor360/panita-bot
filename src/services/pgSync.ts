import type { Client } from 'discord.js';
import { Client as PgClient, type Notification } from 'pg';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { isGlobalSyncLocked, withSyncLock } from '../lib/syncLock';

/**
 * Web → Discord sync. panita-web's database triggers `NOTIFY discord_sync` when a user's roles or
 * editions change; the bot applies the matching Discord role.
 * LISTEN needs a session connection, so this uses DIRECT_URL (not the transaction pooler).
 */

const CHANNEL = 'discord_sync';
const MAX_RECONNECT_DELAY_MS = 60_000;

type SyncKind = 'role' | 'edition';
type SyncAction = 'add' | 'remove';

interface SyncEvent {
  kind: SyncKind;
  action: SyncAction;
  userId: number;
  /** Role id or edition id in the database. */
  targetId: string;
}

/** Validates the trigger payload: `{ table, action, record }`. */
const parsePayload = (raw: string): SyncEvent | null => {
  const data = JSON.parse(raw);
  const action = data?.action;
  if (action !== 'add' && action !== 'remove') return null;

  if (data.table === '_RoleToUser') {
    // Prisma implicit m-n table: A = Role (string), B = User (int). Handle either order defensively.
    const { A, B } = data.record ?? {};
    const [userId, targetId] = Number.isNaN(Number(B)) ? [A, B] : [B, A];
    return toEvent('role', action, userId, targetId);
  }
  if (data.table === 'UserEdition') {
    return toEvent('edition', action, data.record?.user_id, data.record?.edition_id);
  }
  return null;
};

const toEvent = (kind: SyncKind, action: SyncAction, userId: unknown, targetId: unknown): SyncEvent | null => {
  const parsedUserId = Number(userId);
  if (!targetId || Number.isNaN(parsedUserId)) return null;
  return { kind, action, userId: parsedUserId, targetId: String(targetId) };
};

const resolveDiscordRoleId = async (kind: SyncKind, targetId: string) => {
  const record = kind === 'role'
    ? await prisma.role.findUnique({ where: { id: targetId }, select: { discord_role_id: true } })
    : await prisma.edition.findUnique({ where: { id: targetId }, select: { discord_role_id: true } });
  return record?.discord_role_id ?? null;
};

const applyEvent = async (client: Client, guildId: string, event: SyncEvent) => {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const user = await prisma.user.findUnique({ where: { id: event.userId }, select: { discord_id: true, ign: true } });
  if (!user?.discord_id) return;

  const roleId = await resolveDiscordRoleId(event.kind, event.targetId);
  if (!roleId) return;

  const member = await guild.members.fetch(user.discord_id).catch(() => null);
  if (!member) return;

  const hasRole = member.roles.cache.has(roleId);
  if ((event.action === 'add') === hasRole) return; // already in the desired state

  await withSyncLock(user.discord_id, async () => {
    if (event.action === 'add') await member.roles.add(roleId);
    else await member.roles.remove(roleId);
  });
  console.log(`[PG-Sync] ${event.action === 'add' ? 'Added' : 'Removed'} ${event.kind} role ${roleId} ${event.action === 'add' ? 'to' : 'from'} ${user.ign ?? user.discord_id}`);
};

const handleNotification = async (client: Client, guildId: string, message: Notification) => {
  if (message.channel !== CHANNEL || !message.payload) return;
  // Ignore web events during /systemsync to avoid hammering Discord's rate limits
  if (isGlobalSyncLocked()) return;

  try {
    const event = parsePayload(message.payload);
    if (!event) {
      console.warn('[PG-Sync] Ignored event with an unexpected payload.');
      return;
    }
    console.log(`[PG-Sync] Event received: ${event.kind} ${event.action}`);
    await applyEvent(client, guildId, event);
  } catch (error) {
    console.error('[PG-Sync] Error applying notification:', error);
  }
};

/** Starts listening, reconnecting with exponential backoff whenever the connection drops. */
export const startPgSync = (client: Client) => {
  const guildId = env.GUILD_ID;
  if (!guildId) {
    console.error('[PG-Sync] GUILD_ID is required for the database sync; it will not start.');
    return;
  }

  let attempt = 0;

  const connect = async () => {
    const pg = new PgClient({ connectionString: env.DIRECT_URL, keepAlive: true });
    let reconnecting = false;

    const scheduleReconnect = (reason: string) => {
      if (reconnecting) return;
      reconnecting = true;
      pg.end().catch(() => {});
      const delay = Math.min(MAX_RECONNECT_DELAY_MS, 1000 * 2 ** attempt++);
      console.error(`[PG-Sync] ${reason}. Reconnecting in ${delay / 1000}s...`);
      setTimeout(connect, delay);
    };

    pg.on('error', error => scheduleReconnect(`Connection error: ${error.message}`));
    pg.on('end', () => scheduleReconnect('Connection closed'));
    pg.on('notification', message => void handleNotification(client, guildId, message));

    try {
      await pg.connect();
      await pg.query(`LISTEN ${CHANNEL}`);
      attempt = 0;
      console.log('Connected to PostgreSQL for LISTEN/NOTIFY sync...');
    } catch (error) {
      scheduleReconnect(`Failed to connect: ${(error as Error).message}`);
    }
  };

  void connect();
};
