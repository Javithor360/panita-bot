import {
  AuditLogEvent,
  GuildDefaultMessageNotifications,
  GuildExplicitContentFilter,
  GuildMFALevel,
  GuildVerificationLevel,
  type Guild,
  type GuildEmoji,
  type GuildSoundboardSound,
  type PartialSoundboardSound,
  type Role,
  type Sticker,
  type User,
  type VoiceState,
} from 'discord.js';
import type { AuditAction, AuditLogDeps } from './handlers';
import type { UserRef } from './embeds';
import {
  change,
  expressionChanged,
  guildUpdated,
  roleCreated,
  roleDeleted,
  roleUpdated,
  voiceDisconnected,
  voiceFlagChanged,
  voiceJoined,
  voiceLeft,
  voiceMoved,
  voiceStream,
  type Change,
} from './serverEmbeds';

export interface ServerLogDeps extends AuditLogDeps {
  /**
   * The latest audit-log entry of a move or a disconnect from the last few seconds. Discord does not say who was moved
   * (these entries have no target), so a move is matched by the channel it ended in; it is a best guess.
   */
  findVoiceAction(guild: Guild, type: AuditLogEvent.MemberMove | AuditLogEvent.MemberDisconnect, channelId?: string): Promise<AuditAction | null>;
}

/** Time Discord needs to write the audit-log entry of something that just happened. */
const AUDIT_LAG_MS = 1500;

const userRef = (user: User): UserRef => ({ id: user.id, name: user.username, avatarUrl: user.displayAvatarURL(), bot: user.bot });

const list = (items: string[]) => (items.length > 0 ? items.map(item => `\`${item}\``).join(', ') : 'ninguno');
const channelOf = (id: string | null) => (id ? `<#${id}>` : 'ninguno');
const onOff = (value: boolean) => (value ? 'sí' : 'no');

const VERIFICATION: Record<GuildVerificationLevel, string> = {
  [GuildVerificationLevel.None]: 'Ninguno',
  [GuildVerificationLevel.Low]: 'Bajo',
  [GuildVerificationLevel.Medium]: 'Medio',
  [GuildVerificationLevel.High]: 'Alto',
  [GuildVerificationLevel.VeryHigh]: 'Muy alto',
};
const CONTENT_FILTER: Record<GuildExplicitContentFilter, string> = {
  [GuildExplicitContentFilter.Disabled]: 'Desactivado',
  [GuildExplicitContentFilter.MembersWithoutRoles]: 'Miembros sin rol',
  [GuildExplicitContentFilter.AllMembers]: 'Todos los miembros',
};
const NOTIFICATIONS: Record<GuildDefaultMessageNotifications, string> = {
  [GuildDefaultMessageNotifications.AllMessages]: 'Todos los mensajes',
  [GuildDefaultMessageNotifications.OnlyMentions]: 'Solo menciones',
};

/** What changed in a role, as text. Order and position are left out: moving one role moves many. */
export const roleChanges = (before: Role, after: Role): Change[] => {
  const was = new Set(before.permissions.toArray());
  const is = new Set(after.permissions.toArray());
  const added = [...is].filter(permission => !was.has(permission));
  const removed = [...was].filter(permission => !is.has(permission));

  return [
    change('Nombre', before.name, after.name),
    change('Color', before.hexColor, after.hexColor),
    change('Se muestra aparte', onOff(before.hoist), onOff(after.hoist)),
    change('Mencionable', onOff(before.mentionable), onOff(after.mentionable)),
    added.length > 0 ? { label: 'Permisos añadidos', value: list(added) } : null,
    removed.length > 0 ? { label: 'Permisos quitados', value: list(removed) } : null,
  ].filter((item): item is Change => item !== null);
};

/** What changed in the server, as text. */
export const guildChanges = (before: Guild, after: Guild): Change[] =>
  [
    change('Nombre', before.name, after.name),
    change('Descripción', before.description ?? '', after.description ?? ''),
    before.icon !== after.icon ? { label: 'Icono', value: 'cambió' } : null,
    before.banner !== after.banner ? { label: 'Banner', value: 'cambió' } : null,
    before.splash !== after.splash ? { label: 'Fondo de invitaciones', value: 'cambió' } : null,
    change('Nivel de verificación', VERIFICATION[before.verificationLevel], VERIFICATION[after.verificationLevel]),
    change('Filtro de contenido', CONTENT_FILTER[before.explicitContentFilter], CONTENT_FILTER[after.explicitContentFilter]),
    change('Notificaciones por defecto', NOTIFICATIONS[before.defaultMessageNotifications], NOTIFICATIONS[after.defaultMessageNotifications]),
    change('Verificación en dos pasos', before.mfaLevel === GuildMFALevel.Elevated ? 'requerida' : 'no requerida', after.mfaLevel === GuildMFALevel.Elevated ? 'requerida' : 'no requerida'),
    change('Canal de mensajes del sistema', channelOf(before.systemChannelId), channelOf(after.systemChannelId)),
    change('Canal de reglas', channelOf(before.rulesChannelId), channelOf(after.rulesChannelId)),
    change('Canal de avisos de Discord', channelOf(before.publicUpdatesChannelId), channelOf(after.publicUpdatesChannelId)),
    change('Canal AFK', channelOf(before.afkChannelId), channelOf(after.afkChannelId)),
    change('Tiempo AFK', `${before.afkTimeout} s`, `${after.afkTimeout} s`),
    change('Idioma', before.preferredLocale, after.preferredLocale),
    change('URL personalizada', before.vanityURLCode ?? 'ninguna', after.vanityURLCode ?? 'ninguna'),
    change('Dueño', before.ownerId ? `<@${before.ownerId}>` : 'ninguno', after.ownerId ? `<@${after.ownerId}>` : 'ninguno'),
  ].filter((item): item is Change => item !== null);

/**
 * The log of what changes in the server itself and in voice: roles, the server's settings, emojis, stickers, sounds and
 * who joins, leaves, is moved, muted or streams in a voice channel. Like `createAuditLog`, it is fed by thin listeners
 * and a failure in one handler never reaches another.
 */
export const createServerLog = (deps: ServerLogDeps) => {
  const relevant = (guild: Guild | null | undefined): guild is Guild => !!guild && deps.isHomeGuild(guild);

  /** Who did it according to Discord's audit log (best effort, after the time Discord needs to write it). */
  const executorOf = async (guild: Guild, type: AuditLogEvent, targetId: string): Promise<string | null> => {
    await deps.sleep(AUDIT_LAG_MS);
    return (await deps.findAction(guild, type, targetId))?.executorId ?? null;
  };

  return {
    async voiceStateUpdate(before: VoiceState, after: VoiceState) {
      const member = after.member ?? before.member;
      if (!member || member.user.bot || !relevant(after.guild)) return;

      const user = userRef(member.user);
      const at = new Date(deps.now());
      const from = before.channelId;
      const to = after.channelId;

      if (from !== to) {
        if (to === null && from !== null) {
          await deps.sleep(AUDIT_LAG_MS);
          const kicked = await deps.findVoiceAction(after.guild, AuditLogEvent.MemberDisconnect);
          await deps.post({
            embeds: [kicked ? voiceDisconnected({ user, channelId: from, executorId: kicked.executorId, at }) : voiceLeft({ user, channelId: from, at })],
          });
        } else if (from === null && to !== null) {
          await deps.post({ embeds: [voiceJoined({ user, channelId: to, at })] });
        } else if (from !== null && to !== null) {
          await deps.sleep(AUDIT_LAG_MS);
          const moved = await deps.findVoiceAction(after.guild, AuditLogEvent.MemberMove, to);
          await deps.post({ embeds: [voiceMoved({ user, fromId: from, toId: to, at, moved: moved ? { executorId: moved.executorId } : undefined })] });
        }
        // The mute, deafen and stream flags that come with a change of channel are not changes of their own
        return;
      }
      if (to === null) return;

      // Only what someone else did: a member who mutes or deafens themselves is not worth an entry
      for (const [kind, was, is] of [
        ['mute', before.serverMute, after.serverMute],
        ['deafen', before.serverDeaf, after.serverDeaf],
      ] as const) {
        if (Boolean(was) === Boolean(is)) continue;
        const executorId = await executorOf(after.guild, AuditLogEvent.MemberUpdate, member.id);
        await deps.post({ embeds: [voiceFlagChanged({ user, kind, on: Boolean(is), channelId: to, executorId, at })] });
      }

      if (Boolean(before.streaming) !== Boolean(after.streaming)) {
        await deps.post({ embeds: [voiceStream({ user, channelId: to, on: Boolean(after.streaming), at })] });
      }
    },

    async roleCreate(role: Role) {
      if (!relevant(role.guild)) return;
      const executorId = await executorOf(role.guild, AuditLogEvent.RoleCreate, role.id);
      await deps.post({ embeds: [roleCreated({ id: role.id, name: role.name, executorId })] });
    },

    async roleDelete(role: Role) {
      if (!relevant(role.guild)) return;
      const executorId = await executorOf(role.guild, AuditLogEvent.RoleDelete, role.id);
      await deps.post({ embeds: [roleDeleted({ id: role.id, name: role.name, executorId })] });
    },

    async roleUpdate(before: Role, after: Role) {
      if (!relevant(after.guild)) return;
      const changes = roleChanges(before, after);
      if (changes.length === 0) return;
      const executorId = await executorOf(after.guild, AuditLogEvent.RoleUpdate, after.id);
      await deps.post({ embeds: [roleUpdated({ id: after.id, name: after.name, changes, executorId })] });
    },

    async guildUpdate(before: Guild, after: Guild) {
      if (!relevant(after)) return;
      const changes = guildChanges(before, after);
      if (changes.length === 0) return;
      const executorId = await executorOf(after, AuditLogEvent.GuildUpdate, after.id);
      await deps.post({
        embeds: [guildUpdated({ changes, executorId, iconUrl: before.icon !== after.icon ? after.iconURL() : null })],
      });
    },

    async emojiCreate(emoji: GuildEmoji) {
      if (!relevant(emoji.guild)) return;
      const executorId = await executorOf(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
      await deps.post({
        embeds: [expressionChanged({ kind: 'emoji', action: 'created', name: emoji.name ?? emoji.id, id: emoji.id, executorId, imageUrl: emoji.imageURL() })],
      });
    },

    async emojiUpdate(before: GuildEmoji, after: GuildEmoji) {
      if (!relevant(after.guild)) return;
      const roles = (emoji: GuildEmoji) => [...emoji.roles.cache.keys()].sort().map(id => `<@&${id}>`).join(' ') || 'todos';
      const changes = [change('Nombre', before.name ?? '', after.name ?? ''), change('Roles que lo pueden usar', roles(before), roles(after))].filter(
        (item): item is Change => item !== null,
      );
      if (changes.length === 0) return;
      const executorId = await executorOf(after.guild, AuditLogEvent.EmojiUpdate, after.id);
      await deps.post({
        embeds: [expressionChanged({ kind: 'emoji', action: 'updated', name: after.name ?? after.id, id: after.id, executorId, changes, imageUrl: after.imageURL() })],
      });
    },

    async emojiDelete(emoji: GuildEmoji) {
      if (!relevant(emoji.guild)) return;
      const executorId = await executorOf(emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);
      await deps.post({ embeds: [expressionChanged({ kind: 'emoji', action: 'deleted', name: emoji.name ?? emoji.id, id: emoji.id, executorId })] });
    },

    async stickerCreate(sticker: Sticker) {
      if (!relevant(sticker.guild)) return;
      const executorId = await executorOf(sticker.guild, AuditLogEvent.StickerCreate, sticker.id);
      await deps.post({ embeds: [expressionChanged({ kind: 'sticker', action: 'created', name: sticker.name, id: sticker.id, executorId, imageUrl: sticker.url })] });
    },

    async stickerUpdate(before: Sticker, after: Sticker) {
      if (!relevant(after.guild)) return;
      const changes = [
        change('Nombre', before.name, after.name),
        change('Descripción', before.description ?? '', after.description ?? ''),
        change('Emoji', before.tags ?? '', after.tags ?? ''),
      ].filter((item): item is Change => item !== null);
      if (changes.length === 0) return;
      const executorId = await executorOf(after.guild, AuditLogEvent.StickerUpdate, after.id);
      await deps.post({ embeds: [expressionChanged({ kind: 'sticker', action: 'updated', name: after.name, id: after.id, executorId, changes, imageUrl: after.url })] });
    },

    async stickerDelete(sticker: Sticker) {
      if (!relevant(sticker.guild)) return;
      const executorId = await executorOf(sticker.guild, AuditLogEvent.StickerDelete, sticker.id);
      await deps.post({ embeds: [expressionChanged({ kind: 'sticker', action: 'deleted', name: sticker.name, id: sticker.id, executorId })] });
    },

    async soundCreate(sound: GuildSoundboardSound) {
      if (!relevant(sound.guild)) return;
      const executorId = (await executorOf(sound.guild, AuditLogEvent.SoundboardSoundCreate, sound.soundId)) ?? sound.user?.id ?? null;
      await deps.post({ embeds: [expressionChanged({ kind: 'sound', action: 'created', name: sound.name, id: sound.soundId, executorId })] });
    },

    async soundUpdate(before: GuildSoundboardSound | null, after: GuildSoundboardSound) {
      // Without the previous version there is nothing to compare
      if (!relevant(after.guild) || !before) return;
      const changes = [
        change('Nombre', before.name, after.name),
        change('Volumen', `${Math.round(before.volume * 100)} %`, `${Math.round(after.volume * 100)} %`),
        change('Emoji', before.emoji?.name ?? '', after.emoji?.name ?? ''),
      ].filter((item): item is Change => item !== null);
      if (changes.length === 0) return;
      const executorId = await executorOf(after.guild, AuditLogEvent.SoundboardSoundUpdate, after.soundId);
      await deps.post({ embeds: [expressionChanged({ kind: 'sound', action: 'updated', name: after.name, id: after.soundId, executorId, changes })] });
    },

    async soundDelete(sound: GuildSoundboardSound | PartialSoundboardSound) {
      if (!relevant(sound.guild)) return;
      const executorId = await executorOf(sound.guild, AuditLogEvent.SoundboardSoundDelete, sound.soundId);
      await deps.post({ embeds: [expressionChanged({ kind: 'sound', action: 'deleted', name: sound.name ?? sound.soundId, id: sound.soundId, executorId })] });
    },
  };
};

export type ServerLog = ReturnType<typeof createServerLog>;
