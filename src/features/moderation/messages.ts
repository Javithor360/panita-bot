import { EmbedBuilder, escapeMarkdown, type APIEmbedField } from 'discord.js';
import { COLORS, EMOJIS, MODERATION } from '../../config/constants';
import type { Warning } from '../../lib/api/types';
import { discordTimestamp, formatDuration } from '../../lib/format';

/**
 * The voice of the moderation commands, taken from the old Noa: short, friendly Spanish, a case embed headed
 * `[KICK] name` with the target's picture and the fields Usuario, Razón and Moderador, and a message to the member.
 */

export type CaseAction = 'kick' | 'ban' | 'unban' | 'mute' | 'unmute' | 'hide' | 'unhide' | 'warn' | 'unwarn' | 'clear';

const STYLES: Record<CaseAction, { label: string; color: number }> = {
  kick: { label: 'KICK', color: 0xffa05c },
  ban: { label: 'BAN', color: COLORS.error },
  unban: { label: 'UNBAN', color: COLORS.success },
  mute: { label: 'MUTE', color: COLORS.warning },
  unmute: { label: 'UNMUTE', color: COLORS.success },
  hide: { label: 'HIDE', color: 0xa3a0e8 },
  unhide: { label: 'UNHIDE', color: COLORS.success },
  warn: { label: 'WARN', color: COLORS.warning },
  unwarn: { label: 'UNWARN', color: COLORS.success },
  clear: { label: 'CLEAR', color: 0xabb3ed },
};

export const FIELD_MAX = 1024;
const NAME_MAX = 100;

/** Cuts a text to `max` characters, with an ellipsis when something was left out. */
export const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const NO_REASON = 'Sin razón';

export interface CaseInput {
  action: CaseAction;
  /** Who the sanction is for, shown in the header. */
  subject: { id: string; name: string; avatarUrl?: string | null };
  moderatorId: string;
  reason?: string | null;
  /** More fields, such as the duration of a mute or the channel of a hide. */
  extra?: APIEmbedField[];
  footer?: string;
  at?: Date;
}

/** The embed of a case, for the channel where the command ran and for the log channel. */
export const caseEmbed = (input: CaseInput): EmbedBuilder => {
  const { label, color } = STYLES[input.action];
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: clip(`[${label}] ${input.subject.name}`, NAME_MAX),
      ...(input.subject.avatarUrl ? { iconURL: input.subject.avatarUrl } : {}),
    })
    .addFields(
      { name: 'Usuario', value: `<@${input.subject.id}> (\`${input.subject.id}\`)`, inline: true },
      { name: 'Moderador', value: `<@${input.moderatorId}>`, inline: true },
      ...(input.extra ?? []),
      { name: 'Razón', value: clip(input.reason?.trim() || NO_REASON, FIELD_MAX) },
    )
    .setTimestamp(input.at ?? new Date());
  if (input.footer) embed.setFooter({ text: clip(input.footer, 2048) });
  return embed;
};

/** The embed of a `/clear`, which is about a channel and not about a member. */
export const clearEmbed = (input: { moderatorId: string; channelId: string; deleted: number; authorId?: string | null; at?: Date }): EmbedBuilder => {
  const embed = new EmbedBuilder()
    .setColor(STYLES.clear.color)
    .setAuthor({ name: `[${STYLES.clear.label}] ${input.deleted} mensaje${input.deleted === 1 ? '' : 's'}` })
    .addFields(
      { name: 'Canal', value: `<#${input.channelId}>`, inline: true },
      { name: 'Moderador', value: `<@${input.moderatorId}>`, inline: true },
    )
    .setTimestamp(input.at ?? new Date());
  if (input.authorId) embed.addFields({ name: 'Mensajes de', value: `<@${input.authorId}>`, inline: true });
  return embed;
};

const DM_TITLES: Partial<Record<CaseAction, string>> = {
  kick: 'Fuiste expulsado de un servidor',
  ban: 'Fuiste baneado de un servidor',
  mute: 'Fuiste silenciado en un servidor',
  warn: '¡Fuiste advertido!',
};

/** Whether the member is told by DM. Lifting a sanction, hiding a channel and clearing messages say nothing to them. */
export const dmsTheMember = (action: CaseAction): boolean => action in DM_TITLES;

export interface DmInput {
  action: CaseAction;
  guildName: string;
  guildIconUrl?: string | null;
  moderatorName: string;
  reason?: string | null;
  /** For a warning, the active count after it. */
  warnCount?: number;
  /** For a mute, how long it lasts. */
  durationMs?: number;
}

/** The message sent to the member before the sanction is applied (once they are gone it can no longer be delivered). */
export const dmEmbed = (input: DmInput): EmbedBuilder => {
  const { color } = STYLES[input.action];
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: DM_TITLES[input.action] ?? 'Aviso de moderación',
      ...(input.guildIconUrl ? { iconURL: input.guildIconUrl } : {}),
    })
    .addFields(
      { name: 'Servidor', value: clip(input.guildName, 256), inline: true },
      { name: 'Moderador', value: clip(input.moderatorName, 256), inline: true },
    )
    .setTimestamp();

  if (input.action === 'mute' && input.durationMs) {
    embed.addFields({ name: 'Duración', value: `\`${formatDuration(input.durationMs)}\``, inline: true });
  }
  embed.addFields({ name: 'Razón', value: clip(input.reason?.trim() || NO_REASON, FIELD_MAX) });

  if (input.action === 'warn') {
    embed.setDescription(
      `Recibiste una advertencia en **${escapeMarkdown(input.guildName)}**. Con ${MODERATION.warnMuteAt} advertencias serás silenciado `
      + `${formatDuration(MODERATION.warnMuteMs)} y con ${MODERATION.warnKickAt} serás expulsado, así que ten cuidado.`,
    );
    if (input.warnCount !== undefined) {
      embed.setFooter({ text: `Contador de advertencias: ${input.warnCount}/${MODERATION.warnKickAt}` });
    }
  }
  return embed;
};

const WARNING_REASON_MAX = 150;

/** One line per warning in `warns`. An active one carries the number `unwarn` takes; a revoked one is struck through. */
export const warningLine = (warning: Warning, activeNumber: number | null): string => {
  const reason = escapeMarkdown(clip(warning.reason, WARNING_REASON_MAX));
  const when = discordTimestamp(new Date(warning.created_at), 'R');
  if (activeNumber === null) return `~~${reason}~~ · <@${warning.moderator_id}> ${when} · quitada`;
  return `**${activeNumber}.** ${reason} · <@${warning.moderator_id}> ${when}`;
};

type Random = () => number;
const pick = <T>(items: readonly T[], random: Random = Math.random): T => items[Math.floor(random() * items.length)];

const CONFIRMATIONS: Record<CaseAction, { emoji: keyof typeof EMOJIS; lines: readonly string[] }> = {
  kick: { emoji: 'offline', lines: ['**{name}** fue expulsado del servidor.', 'Listo, **{name}** salió por la puerta.'] },
  ban: { emoji: 'offline', lines: ['**{name}** fue baneado del servidor.', 'Hecho: **{name}** ya no puede volver.'] },
  unban: { emoji: 'online', lines: ['**{name}** fue desbaneado, tiene otra oportunidad.', 'Listo, **{name}** puede volver al servidor.'] },
  mute: { emoji: 'idle', lines: ['**{name}** fue silenciado.', 'Shhh... **{name}** quedó en silencio.'] },
  unmute: { emoji: 'online', lines: ['**{name}** ya puede hablar de nuevo.', 'Listo, se le quitó el silencio a **{name}**.'] },
  hide: { emoji: 'idle', lines: ['**{name}** ya no puede ver el canal.', 'Hecho: el canal desapareció para **{name}**.'] },
  unhide: { emoji: 'online', lines: ['**{name}** ya puede ver el canal otra vez.', 'Listo, el canal volvió a aparecer para **{name}**.'] },
  warn: { emoji: 'idle', lines: ['**{name}** fue advertido.', 'Advertencia registrada para **{name}**.'] },
  unwarn: { emoji: 'online', lines: ['Se le quitó una advertencia a **{name}**.', 'Listo, **{name}** tiene una advertencia menos.'] },
  clear: { emoji: 'check', lines: ['{name}'] },
};

/** The line that opens the answer of a command, for example `<emoji> **Ana** fue expulsada del servidor.` */
export const confirmation = (action: CaseAction, name: string, random?: Random): string => {
  const { emoji, lines } = CONFIRMATIONS[action];
  const safeName = escapeMarkdown(clip(name, NAME_MAX));
  return `${EMOJIS[emoji]} ${pick(lines, random).replaceAll('{name}', safeName)}`;
};

export type Denial =
  | 'self' | 'bot' | 'owner' | 'staff' | 'hierarchyModerator' | 'hierarchyBot'
  | 'notInServer' | 'notBanned' | 'notMuted' | 'notHidden' | 'alreadyHidden' | 'noWarns' | 'noPermission';

const DENIALS: Record<Denial, readonly string[]> = {
  self: ['No puedes hacerte eso a ti mismo, intenta con otra persona.', 'Auto-sanción denegada, ni lo pienses.'],
  bot: ['No puedo hacerme eso a mí misma, intenta con otro.', 'Buen intento, pero yo no me sanciono.'],
  owner: ['Eso no se le hace al dueño del servidor.'],
  staff: ['No puedes sancionar a otro miembro del Staff.', 'Es parte del Staff, esa pelea no me toca.'],
  hierarchyModerator: ['Esa persona tiene un rol igual o superior al tuyo, no puedes sancionarla.'],
  hierarchyBot: ['No puedo hacerlo: es posible que no tenga el rango requerido o que esa persona sea superior a mí.'],
  notInServer: ['Esa persona no está en el servidor.'],
  notBanned: ['Esa persona no está baneada.'],
  notMuted: ['Esa persona no está silenciada.'],
  notHidden: ['Ese canal no está oculto para esa persona.'],
  alreadyHidden: ['Ese canal ya está oculto para esa persona.'],
  noWarns: ['No puedo quitar una advertencia: esa persona no tiene ninguna activa.'],
  noPermission: ['No tengo los permisos necesarios para hacer eso. Revisa mis permisos o mi rol.'],
};

/** A refusal, written as a user-facing error. */
export const denialMessage = (reason: Denial, random?: Random): string => `${EMOJIS.cross} ${pick(DENIALS[reason], random)}`;
