import {
  AuditLogEvent,
  type Guild,
  type GuildBan,
  type GuildMember,
  type Message,
  type PartialGuildMember,
  type PartialMessage,
  type ReadonlyCollection,
  type Snowflake,
  type User,
  type PartialUser,
} from 'discord.js';
import { PREFIX } from '../../config/constants';
import type { BotActions } from '../moderation/recent';
import type { ModlogEntry } from '../moderation/modlog';
import { memberJoined, memberLeft, messageDeleted, messageEdited, messagesBulkDeleted, sanctionApplied, timeoutChanged, type UserRef } from './embeds';

/** Who did something according to Discord's own audit log, and why. */
export interface AuditAction {
  executorId: string | null;
  reason: string | null;
}

export interface AuditLogDeps {
  post(entry: ModlogEntry): Promise<void>;
  /** The log channel, whose own messages are never logged (it would feed on itself). */
  modlogChannelId: string | undefined;
  isHomeGuild(guild: Guild): boolean;
  botActions: BotActions;
  /** The latest audit-log entry of that type about that target from the last few seconds, if Discord shows one. */
  findAction(guild: Guild, type: AuditLogEvent, targetId: string): Promise<AuditAction | null>;
  sleep(ms: number): Promise<void>;
  now(): number;
}

/** An edit counts as new when Discord stamped it this recently (link previews update a message without editing it). */
const FRESH_EDIT_MS = 5000;
/** Time Discord needs to write the audit-log entry of something that just happened. */
const AUDIT_LAG_MS = 1500;

const userRef = (user: User | PartialUser | null | undefined): UserRef | null =>
  user
    ? {
        id: user.id,
        name: user.username ?? user.id,
        avatarUrl: 'displayAvatarURL' in user ? user.displayAvatarURL() : null,
        bot: user.bot ?? false,
      }
    : null;

/** Whether a message is a command for the bot, which is deleted by the bot itself and is not worth an entry. */
const isCommand = (content: string | null) => !!content && content.startsWith(PREFIX);

export const createAuditLog = (deps: AuditLogDeps) => {
  const relevant = (guild: Guild | null, channelId?: string): guild is Guild =>
    !!guild && deps.isHomeGuild(guild) && (channelId === undefined || channelId !== deps.modlogChannelId);

  return {
    async messageDelete(message: Message | PartialMessage) {
      if (!relevant(message.guild, message.channelId)) return;
      if (message.author?.bot || message.webhookId) return;
      if (isCommand(message.content)) return;

      await deps.post({
        embeds: [messageDeleted({
          author: userRef(message.author),
          channelId: message.channelId,
          content: message.content,
          attachments: message.attachments?.map(attachment => attachment.name) ?? [],
          sentAt: message.createdAt ?? null,
        })],
      });
    },

    async messageUpdate(before: Message | PartialMessage, after: Message | PartialMessage) {
      if (!relevant(after.guild, after.channelId)) return;
      if (after.author?.bot || after.webhookId) return;
      if (after.content === null || before.content === after.content) return;
      // An old message the bot never saw has no "before": only a fresh edit is told apart from a preview
      if (before.content === null && !(after.editedTimestamp !== null && deps.now() - after.editedTimestamp < FRESH_EDIT_MS)) return;

      await deps.post({
        embeds: [messageEdited({
          author: userRef(after.author),
          channelId: after.channelId,
          before: before.content,
          after: after.content,
          url: after.url,
        })],
      });
    },

    async messageDeleteBulk(messages: ReadonlyCollection<Snowflake, Message | PartialMessage>, channel: { id: string; guild: Guild }) {
      if (!relevant(channel.guild, channel.id)) return;
      // `/clear` writes its own entry, with who asked for it
      if (deps.botActions.has('clear', channel.id)) return;
      await deps.post({ embeds: [messagesBulkDeleted({ channelId: channel.id, count: messages.size })] });
    },

    async memberAdd(member: GuildMember) {
      if (!relevant(member.guild)) return;
      await deps.post({
        embeds: [memberJoined({ user: userRef(member.user)!, createdAt: member.user.createdAt, memberCount: member.guild.memberCount })],
      });
    },

    async memberRemove(member: GuildMember | PartialGuildMember) {
      if (!relevant(member.guild) || !member.user) return;
      // The commands of the bot already logged a kick or a ban
      if (deps.botActions.has('kick', member.id) || deps.botActions.has('ban', member.id)) return;

      await deps.sleep(AUDIT_LAG_MS);
      const kick = await deps.findAction(member.guild, AuditLogEvent.MemberKick, member.id);
      // A ban removes the member too, and the ban has its own entry
      if (!kick && (await deps.findAction(member.guild, AuditLogEvent.MemberBanAdd, member.id))) return;

      const user = userRef(member.user)!;
      if (kick) {
        await deps.post({ embeds: [sanctionApplied({ kind: 'kick', user, executorId: kick.executorId, reason: kick.reason })] });
        return;
      }
      await deps.post({
        embeds: [memberLeft({
          user,
          joinedAt: member.joinedAt,
          roleIds: member.roles.cache.filter(role => role.id !== member.guild.id).map(role => role.id),
        })],
      });
    },

    async banAdd(ban: GuildBan) {
      if (!relevant(ban.guild) || deps.botActions.has('ban', ban.user.id)) return;
      await deps.sleep(AUDIT_LAG_MS);
      const action = await deps.findAction(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
      await deps.post({
        embeds: [sanctionApplied({
          kind: 'ban',
          user: userRef(ban.user)!,
          executorId: action?.executorId ?? null,
          reason: ban.reason ?? action?.reason ?? null,
        })],
      });
    },

    async banRemove(ban: GuildBan) {
      if (!relevant(ban.guild) || deps.botActions.has('unban', ban.user.id)) return;
      await deps.sleep(AUDIT_LAG_MS);
      const action = await deps.findAction(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
      await deps.post({
        embeds: [sanctionApplied({
          kind: 'unban',
          user: userRef(ban.user)!,
          executorId: action?.executorId ?? null,
          reason: action?.reason ?? null,
        })],
      });
    },

    async memberUpdate(before: GuildMember | PartialGuildMember, after: GuildMember) {
      if (!relevant(after.guild) || after.user.bot || before.partial) return;
      const was = before.communicationDisabledUntilTimestamp;
      const is = after.communicationDisabledUntilTimestamp;
      if (was === is) return;
      // Only a timeout that is on, or that was cut short; its natural end sends no event
      const until = is !== null && is > deps.now() ? new Date(is) : null;
      if (until === null && (was === null || was <= deps.now())) return;
      if (deps.botActions.has('timeout', after.id)) return;

      await deps.sleep(AUDIT_LAG_MS);
      const action = await deps.findAction(after.guild, AuditLogEvent.MemberUpdate, after.id);
      await deps.post({
        embeds: [timeoutChanged({ user: userRef(after.user)!, until, executorId: action?.executorId ?? null, reason: action?.reason ?? null })],
      });
    },
  };
};

export type AuditLog = ReturnType<typeof createAuditLog>;
