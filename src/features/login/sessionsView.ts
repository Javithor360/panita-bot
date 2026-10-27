import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type APIEmbed,
  type MessageMentionOptions,
} from 'discord.js';
import { COLORS } from '../../config/constants';
import { encodeCustomId } from '../../core/customId';
import { discordTimestamp, untrustedText } from '../../lib/format';
import type { BotSession } from '../../services/sessions';

export const SESSIONS_NAMESPACE = 'sessions';
export const CLOSE_ONE_ACTION = 'close';
export const CLOSE_ALL_ACTION = 'closeall';

export const SESSION_MESSAGES = {
  none: 'No tienes sesiones abiertas.',
  closed: (name: string) => `Cerraste la sesión ${name}.`,
  alreadyClosed: 'Esa sesión ya estaba cerrada.',
  closedAll: (count: number) => (count === 1 ? 'Cerraste 1 sesión.' : `Cerraste ${count} sesiones.`),
  noneToClose: 'No tenías sesiones abiertas.',
};

/** A plain UTC date for places that cannot render Discord timestamps (select menu options). */
const plainDate = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

/** What a session is called: its device name and system, as plain text (both are typed by the client). */
const plainName = ({ label, device_os }: BotSession) => (device_os ? `${label} · ${device_os}` : label);

/** The name of a session for a message: safe to show anywhere, never empty. */
export const sessionName = (session: BotSession): string => untrustedText(plainName(session), 64) ?? `\`${session.client}\``;

/** One line of the list: what it is, when it was opened, last used and when it ends. */
export const describeSession = (session: BotSession): string => {
  const ends = session.expires_at === null ? 'sin vencimiento' : `vence ${discordTimestamp(new Date(session.expires_at), 'R')}`;
  return `${sessionName(session)} · creada ${discordTimestamp(new Date(session.created_at), 'R')} · último uso ${discordTimestamp(new Date(session.last_used_at), 'R')} · ${ends}`;
};

export interface SessionsView {
  content: string;
  embeds: APIEmbed[];
  components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[];
  /** Nothing in the message may ping: the session names are typed by the clients. */
  allowedMentions: MessageMentionOptions;
}

/**
 * The message of `/sessions`: the list, a menu to close one and a button to close all. `note` says what
 * the last action did. Components are owned by `ownerId`, so only that member can use them.
 */
export const buildSessionsView = (sessions: BotSession[], ownerId: string, note = ''): SessionsView => {
  const allowedMentions: MessageMentionOptions = { parse: [] };

  if (sessions.length === 0) {
    return { content: note ? `${note}\n${SESSION_MESSAGES.none}` : SESSION_MESSAGES.none, embeds: [], components: [], allowedMentions };
  }

  const embed = new EmbedBuilder()
    .setTitle(`Tus sesiones abiertas (${sessions.length})`)
    .setColor(COLORS.blurple)
    .setDescription(sessions.map(describeSession).join('\n'))
    .setFooter({ text: 'Si ves alguna que no reconoces, ciérrala.' });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(encodeCustomId({ namespace: SESSIONS_NAMESPACE, action: CLOSE_ONE_ACTION, owner: ownerId }))
    .setPlaceholder('Cerrar esta sesión…')
    .addOptions(
      sessions.map((session, index) => ({
        // A menu option is plain text (no markdown to escape) of at most 100 characters
        label: `${index + 1}. ${plainName(session)}`.replace(/\s+/g, ' ').slice(0, 100),
        description: `Creada ${plainDate(session.created_at)} · último uso ${plainDate(session.last_used_at)}`,
        value: session.id,
      })),
    );

  const closeAll = new ButtonBuilder()
    .setCustomId(encodeCustomId({ namespace: SESSIONS_NAMESPACE, action: CLOSE_ALL_ACTION, owner: ownerId }))
    .setLabel('Cerrar todas')
    .setStyle(ButtonStyle.Danger);

  return {
    content: note,
    allowedMentions,
    embeds: [embed.toJSON()],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
      new ActionRowBuilder<ButtonBuilder>().addComponents(closeAll),
    ],
  };
};
