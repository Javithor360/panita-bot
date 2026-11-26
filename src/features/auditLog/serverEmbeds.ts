import type { APIEmbedField, EmbedBuilder } from 'discord.js';
import { COLORS } from '../../config/constants';
import { clip, FIELD_MAX } from '../moderation/messages';
import { entry, GREY, ORANGE, person, RED, who, type UserRef } from './embeds';

/** One thing that changed, already as text: what it was and what it is now, or a list (the permissions added). */
export type Change = { label: string; before: string; after: string } | { label: string; value: string };

/** `null` when nothing changed. */
export const change = (label: string, before: string, after: string): Change | null =>
  before === after ? null : { label, before, after };

const shown = (text: string) => clip(text.trim() || '*(vacío)*', 400);

/** One field per change: `antes → después`, or the list as it is. */
export const changeFields = (changes: Change[]): APIEmbedField[] =>
  changes.slice(0, 20).map(item => ({
    name: clip(item.label, 256),
    value: 'value' in item ? clip(item.value, FIELD_MAX) : clip(`${shown(item.before)} → ${shown(item.after)}`, FIELD_MAX),
  }));

// ── Voice ────────────────────────────────────────────────────────────────────────────────────────────────────────

export const voiceJoined = (input: { user: UserRef; channelId: string; at: Date }): EmbedBuilder =>
  entry({
    label: 'Entró a voz',
    color: COLORS.success,
    user: input.user,
    at: input.at,
    fields: [
      { name: 'Usuario', value: person(input.user), inline: true },
      { name: 'Canal', value: `<#${input.channelId}>`, inline: true },
    ],
  });

export const voiceLeft = (input: { user: UserRef; channelId: string; at: Date }): EmbedBuilder =>
  entry({
    label: 'Salió de voz',
    color: GREY,
    user: input.user,
    at: input.at,
    fields: [
      { name: 'Usuario', value: person(input.user), inline: true },
      { name: 'Canal', value: `<#${input.channelId}>`, inline: true },
    ],
  });

/** A member who went from one voice channel to another, by themselves (`executorId` is `undefined`) or moved by someone. */
export const voiceMoved = (input: { user: UserRef; fromId: string; toId: string; at: Date; moved?: { executorId: string | null } }): EmbedBuilder =>
  entry({
    label: input.moved ? 'Movido de canal de voz' : 'Cambió de canal de voz',
    color: input.moved ? ORANGE : COLORS.blurple,
    user: input.user,
    at: input.at,
    fields: [
      { name: 'Usuario', value: person(input.user), inline: true },
      { name: 'De', value: `<#${input.fromId}>`, inline: true },
      { name: 'A', value: `<#${input.toId}>`, inline: true },
      ...(input.moved ? [{ name: 'Moderador', value: who(input.moved.executorId), inline: true }] : []),
    ],
  });

export const voiceDisconnected = (input: { user: UserRef; channelId: string; executorId: string | null; at: Date }): EmbedBuilder =>
  entry({
    label: 'Desconectado de voz',
    color: ORANGE,
    user: input.user,
    at: input.at,
    fields: [
      { name: 'Usuario', value: person(input.user), inline: true },
      { name: 'Canal', value: `<#${input.channelId}>`, inline: true },
      { name: 'Moderador', value: who(input.executorId), inline: true },
    ],
  });

const VOICE_FLAGS = {
  mute: { on: 'Muteo de voz', off: 'Muteo de voz quitado' },
  deafen: { on: 'Ensordecimiento', off: 'Ensordecimiento quitado' },
} as const;

/** A mute or a deafen that someone else applied to the member in voice (the ones they set on themselves are not logged). */
export const voiceFlagChanged = (input: {
  user: UserRef;
  kind: keyof typeof VOICE_FLAGS;
  on: boolean;
  channelId: string;
  executorId: string | null;
  at: Date;
}): EmbedBuilder =>
  entry({
    label: VOICE_FLAGS[input.kind][input.on ? 'on' : 'off'],
    color: input.on ? COLORS.warning : COLORS.success,
    user: input.user,
    at: input.at,
    fields: [
      { name: 'Usuario', value: person(input.user), inline: true },
      { name: 'Canal', value: `<#${input.channelId}>`, inline: true },
      { name: 'Moderador', value: who(input.executorId), inline: true },
    ],
  });

export const voiceStream = (input: { user: UserRef; channelId: string; on: boolean; at: Date }): EmbedBuilder =>
  entry({
    label: input.on ? 'Empezó una transmisión' : 'Terminó su transmisión',
    color: input.on ? COLORS.blurple : GREY,
    user: input.user,
    at: input.at,
    fields: [
      { name: 'Usuario', value: person(input.user), inline: true },
      { name: 'Canal', value: `<#${input.channelId}>`, inline: true },
    ],
  });

// ── Roles ────────────────────────────────────────────────────────────────────────────────────────────────────────

export const roleCreated = (input: { id: string; name: string; executorId: string | null }): EmbedBuilder =>
  entry({
    label: 'Rol creado',
    color: COLORS.success,
    fields: [
      { name: 'Rol', value: `<@&${input.id}> (\`${input.id}\`)`, inline: true },
      { name: 'Nombre', value: clip(input.name, 256), inline: true },
      { name: 'Creado por', value: who(input.executorId), inline: true },
    ],
  });

export const roleDeleted = (input: { id: string; name: string; executorId: string | null }): EmbedBuilder =>
  entry({
    label: 'Rol borrado',
    color: RED,
    fields: [
      { name: 'Rol', value: `\`${clip(input.name, 100)}\` (\`${input.id}\`)`, inline: true },
      { name: 'Borrado por', value: who(input.executorId), inline: true },
    ],
  });

export const roleUpdated = (input: { id: string; name: string; changes: Change[]; executorId: string | null }): EmbedBuilder =>
  entry({
    label: 'Rol editado',
    color: COLORS.warning,
    fields: [
      { name: 'Rol', value: `<@&${input.id}> (\`${input.id}\`)`, inline: true },
      { name: 'Editado por', value: who(input.executorId), inline: true },
      ...changeFields(input.changes),
    ],
  });

// ── Server ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const guildUpdated = (input: { changes: Change[]; executorId: string | null; iconUrl?: string | null }): EmbedBuilder => {
  const embed = entry({
    label: 'Servidor editado',
    color: COLORS.warning,
    fields: [{ name: 'Editado por', value: who(input.executorId), inline: true }, ...changeFields(input.changes)],
  });
  if (input.iconUrl) embed.setThumbnail(input.iconUrl);
  return embed;
};

// ── Emojis, stickers and sounds ──────────────────────────────────────────────────────────────────────────────────

const EXPRESSIONS = { emoji: 'Emoji', sticker: 'Sticker', sound: 'Sonido' } as const;
const ACTIONS = {
  created: { verb: 'creado', color: COLORS.success, by: 'Creado por' },
  updated: { verb: 'editado', color: COLORS.warning, by: 'Editado por' },
  deleted: { verb: 'borrado', color: RED, by: 'Borrado por' },
} as const;

export const expressionChanged = (input: {
  kind: keyof typeof EXPRESSIONS;
  action: keyof typeof ACTIONS;
  name: string;
  id: string;
  executorId: string | null;
  changes?: Change[];
  /** A picture of the emoji or sticker (not of a deleted one, which is gone from Discord's servers). */
  imageUrl?: string | null;
}): EmbedBuilder => {
  const action = ACTIONS[input.action];
  const embed = entry({
    label: `${EXPRESSIONS[input.kind]} ${action.verb}`,
    color: action.color,
    fields: [
      // Named after the kind, so it never collides with a change of "Nombre"
      { name: EXPRESSIONS[input.kind], value: `\`${clip(input.name, 100)}\` (\`${input.id}\`)`, inline: true },
      { name: action.by, value: who(input.executorId), inline: true },
      ...changeFields(input.changes ?? []),
    ],
  });
  if (input.imageUrl) embed.setThumbnail(input.imageUrl);
  return embed;
};
