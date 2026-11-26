import { EmbedBuilder, type APIEmbedField } from 'discord.js';
import { COLORS } from '../../config/constants';
import { discordTimestamp } from '../../lib/format';
import { clip, FIELD_MAX } from '../moderation/messages';

/** Who an entry is about. */
export interface UserRef {
  id: string;
  name: string;
  avatarUrl?: string | null;
  bot?: boolean;
}

export const RED = 0xf04747;
export const GREY = 0x99aab5;
export const ORANGE = 0xffa05c;

const NO_CONTENT = '*(sin texto)*';
const UNAVAILABLE = '*contenido no disponible: el mensaje es anterior al arranque del bot*';

/** Text inside a code block that the text itself cannot close. */
export const fenced = (text: string, max = FIELD_MAX - 10): string =>
  `\`\`\`\n${clip(text.replaceAll('```', '`​``'), max)}\n\`\`\``;

export const entry = (input: {
  label: string;
  color: number;
  user?: UserRef | null;
  fields?: APIEmbedField[];
  footer?: string;
  at?: Date;
}): EmbedBuilder => {
  const embed = new EmbedBuilder()
    .setColor(input.color)
    .setAuthor({
      name: clip(`${input.label}${input.user ? ` · ${input.user.name}` : ''}`, 256),
      ...(input.user?.avatarUrl ? { iconURL: input.user.avatarUrl } : {}),
    })
    .setTimestamp(input.at ?? new Date());
  if (input.fields?.length) embed.addFields(input.fields);
  if (input.footer) embed.setFooter({ text: clip(input.footer, 2048) });
  return embed;
};

export const person = (user: UserRef) => `<@${user.id}> (\`${user.id}\`)`;
export const who = (executorId: string | null) => (executorId ? `<@${executorId}>` : 'No se pudo saber');

export const messageDeleted = (input: {
  author: UserRef | null;
  channelId: string;
  /** `null` when the bot never saw the message. */
  content: string | null;
  attachments: string[];
  sentAt: Date | null;
}): EmbedBuilder =>
  entry({
    label: 'Mensaje borrado',
    color: RED,
    user: input.author,
    footer: input.author ? `ID del autor: ${input.author.id}` : undefined,
    fields: [
      { name: 'Autor', value: input.author ? person(input.author) : 'Desconocido', inline: true },
      { name: 'Canal', value: `<#${input.channelId}>`, inline: true },
      ...(input.sentAt ? [{ name: 'Enviado', value: discordTimestamp(input.sentAt, 'R'), inline: true }] : []),
      { name: 'Contenido', value: input.content === null ? UNAVAILABLE : input.content.trim() ? fenced(input.content) : NO_CONTENT },
      ...(input.attachments.length > 0
        ? [{ name: 'Adjuntos', value: clip(input.attachments.map(name => `\`${name}\``).join(', '), FIELD_MAX) }]
        : []),
    ],
  });

export const messageEdited = (input: {
  author: UserRef | null;
  channelId: string;
  before: string | null;
  after: string;
  url: string;
}): EmbedBuilder =>
  entry({
    label: 'Mensaje editado',
    color: COLORS.warning,
    user: input.author,
    fields: [
      { name: 'Autor', value: input.author ? person(input.author) : 'Desconocido', inline: true },
      { name: 'Canal', value: `<#${input.channelId}> · [ir al mensaje](${input.url})`, inline: true },
      { name: 'Antes', value: input.before === null ? UNAVAILABLE : input.before.trim() ? fenced(input.before, 900) : NO_CONTENT },
      { name: 'Después', value: input.after.trim() ? fenced(input.after, 900) : NO_CONTENT },
    ],
  });

export const messagesBulkDeleted = (input: { channelId: string; count: number }): EmbedBuilder =>
  entry({
    label: `${input.count} mensajes borrados`,
    color: RED,
    fields: [{ name: 'Canal', value: `<#${input.channelId}>`, inline: true }],
  });

export const memberJoined = (input: { user: UserRef; createdAt: Date; memberCount?: number }): EmbedBuilder =>
  entry({
    label: input.user.bot ? 'Bot añadido' : 'Miembro nuevo',
    color: COLORS.success,
    user: input.user,
    footer: input.memberCount ? `Ahora somos ${input.memberCount}` : undefined,
    fields: [
      { name: 'Usuario', value: person(input.user), inline: true },
      { name: 'Cuenta creada', value: discordTimestamp(input.createdAt, 'R'), inline: true },
    ],
  });

export const memberLeft = (input: { user: UserRef; joinedAt: Date | null; roleIds: string[] }): EmbedBuilder =>
  entry({
    label: 'Miembro salió',
    color: GREY,
    user: input.user,
    fields: [
      { name: 'Usuario', value: person(input.user), inline: true },
      ...(input.joinedAt ? [{ name: 'Se unió', value: discordTimestamp(input.joinedAt, 'R'), inline: true }] : []),
      ...(input.roleIds.length > 0
        ? [{ name: 'Roles', value: clip(input.roleIds.map(id => `<@&${id}>`).join(' '), FIELD_MAX) }]
        : []),
    ],
  });

/** A kick, a ban or an unban that someone did by hand in Discord (the ones the bot does are logged by its commands). */
export const sanctionApplied = (input: {
  kind: 'kick' | 'ban' | 'unban';
  user: UserRef;
  executorId: string | null;
  reason: string | null;
}): EmbedBuilder =>
  entry({
    label: { kick: 'Expulsión', ban: 'Baneo', unban: 'Baneo quitado' }[input.kind],
    color: { kick: ORANGE, ban: COLORS.error, unban: COLORS.success }[input.kind],
    user: input.user,
    fields: [
      { name: 'Usuario', value: person(input.user), inline: true },
      { name: 'Moderador', value: who(input.executorId), inline: true },
      { name: 'Razón', value: clip(input.reason?.trim() || 'Sin razón', FIELD_MAX) },
    ],
  });

/** A timeout that someone set or lifted by hand in Discord. */
export const timeoutChanged = (input: {
  user: UserRef;
  until: Date | null;
  executorId: string | null;
  reason: string | null;
}): EmbedBuilder =>
  entry({
    label: input.until ? 'Silencio' : 'Silencio quitado',
    color: input.until ? COLORS.warning : COLORS.success,
    user: input.user,
    fields: [
      { name: 'Usuario', value: person(input.user), inline: true },
      { name: 'Moderador', value: who(input.executorId), inline: true },
      ...(input.until ? [{ name: 'Termina', value: discordTimestamp(input.until, 'R'), inline: true }] : []),
      { name: 'Razón', value: clip(input.reason?.trim() || 'Sin razón', FIELD_MAX) },
    ],
  });
