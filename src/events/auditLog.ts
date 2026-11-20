import { Events, type Client, type Guild } from 'discord.js';
import { env } from '../config/env';
import { createAuditLog, type AuditAction, type AuditLogDeps } from '../features/auditLog/handlers';
import { modlogOf } from '../features/moderation/modlog';
import { botActions } from '../features/moderation/recent';
import { isHomeGuild } from '../lib/discord';

/** Entries older than this are about something else that happened to the same member. */
const RECENT_MS = 10_000;

/** What Discord's audit log says about something that just happened to `targetId`, or `null` (nothing there, or no permission to read it). */
const findAction: AuditLogDeps['findAction'] = async (guild: Guild, type, targetId): Promise<AuditAction | null> => {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 5 });
    const entry = logs.entries.find(candidate => candidate.targetId === targetId && Date.now() - candidate.createdTimestamp < RECENT_MS);
    return entry ? { executorId: entry.executorId, reason: entry.reason } : null;
  } catch {
    return null;
  }
};

/**
 * Writes the audit log: what happens in the server and is not a command of the bot (messages deleted or edited,
 * joins, leaves, kicks, bans and timeouts done by hand). Each listener is separate from the ones that sync accounts
 * and roles, so a failure here can never get in their way.
 */
export const registerAuditLog = (client: Client): void => {
  const modlog = modlogOf(client);
  if (!modlog.enabled) {
    console.log('[AuditLog] MODLOG_CHANNEL_ID is not set; the audit log is off.');
    return;
  }

  const auditLog = createAuditLog({
    post: entry => modlog.post(entry),
    modlogChannelId: env.MODLOG_CHANNEL_ID,
    isHomeGuild,
    botActions,
    findAction,
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    now: Date.now,
  });

  /** A failure in one entry is logged and never breaks the listener or the others. */
  const safely = <A extends unknown[]>(name: string, handler: (...args: A) => Promise<void>) =>
    async (...args: A) => {
      try {
        await handler(...args);
      } catch (error) {
        console.error(`[AuditLog] ${name} failed:`, error);
      }
    };

  client.on(Events.MessageDelete, safely('messageDelete', auditLog.messageDelete));
  client.on(Events.MessageUpdate, safely('messageUpdate', auditLog.messageUpdate));
  client.on(Events.MessageBulkDelete, safely('messageDeleteBulk', auditLog.messageDeleteBulk));
  client.on(Events.GuildMemberAdd, safely('memberAdd', auditLog.memberAdd));
  client.on(Events.GuildMemberRemove, safely('memberRemove', auditLog.memberRemove));
  client.on(Events.GuildMemberUpdate, safely('memberUpdate', auditLog.memberUpdate));
  client.on(Events.GuildBanAdd, safely('banAdd', auditLog.banAdd));
  client.on(Events.GuildBanRemove, safely('banRemove', auditLog.banRemove));
};
