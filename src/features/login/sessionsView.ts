import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type APIEmbed,
} from 'discord.js';
import { COLORS } from '../../config/constants';
import { encodeCustomId } from '../../core/customId';
import { discordTimestamp } from '../../lib/format';
import type { BotSession } from '../../services/sessions';

export const SESSIONS_NAMESPACE = 'sessions';
export const CLOSE_ONE_ACTION = 'close';
export const CLOSE_ALL_ACTION = 'closeall';

export const SESSION_MESSAGES = {
  none: 'No tienes sesiones abiertas.',
  closed: (label: string) => `Cerraste la sesión **${label}**.`,
  alreadyClosed: 'Esa sesión ya estaba cerrada.',
  closedAll: (count: number) => (count === 1 ? 'Cerraste 1 sesión.' : `Cerraste ${count} sesiones.`),
  noneToClose: 'No tenías sesiones abiertas.',
};

/** A plain UTC date for places that cannot render Discord timestamps (select menu options). */
const plainDate = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

/** One line of the list: what it is, when it was opened, last used and when it ends. */
export const describeSession = (session: BotSession): string => {
  const ends = session.expires_at === null ? 'sin vencimiento' : `vence ${discordTimestamp(new Date(session.expires_at), 'R')}`;
  return `**${session.label}** · creada ${discordTimestamp(new Date(session.created_at), 'R')} · último uso ${discordTimestamp(new Date(session.last_used_at), 'R')} · ${ends}`;
};

export interface SessionsView {
  content: string;
  embeds: APIEmbed[];
  components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[];
}

/**
 * The message of `/sessions`: the list, a menu to close one and a button to close all. `note` says what
 * the last action did. Components are owned by `ownerId`, so only that member can use them.
 */
export const buildSessionsView = (sessions: BotSession[], ownerId: string, note = ''): SessionsView => {
  if (sessions.length === 0) {
    return { content: note ? `${note}\n${SESSION_MESSAGES.none}` : SESSION_MESSAGES.none, embeds: [], components: [] };
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
        label: `${index + 1}. ${session.label}`,
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
    embeds: [embed.toJSON()],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
      new ActionRowBuilder<ButtonBuilder>().addComponents(closeAll),
    ],
  };
};
