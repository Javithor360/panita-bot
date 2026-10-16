import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  type MessageMentionOptions,
} from 'discord.js';
import { COLORS } from '../../config/constants';
import { encodeCustomId } from '../../core/customId';
import { discordTimestamp } from '../../lib/format';
import { PASSWORD_INPUT, PASSWORD_PLACEHOLDER, textInput } from '../../lib/registration';

/** The reset components live on `/register`: the router needs the namespace to be a command's name. */
export const RESET_NAMESPACE = 'register';
export const RESET_ACTIONS = { reset: 'reset', submit: 'resetsubmit', ignore: 'resetignore' } as const;

/** Where the request message lives: the member's DMs, or the public channel used when their DMs are closed. */
export type ResetPlace = 'dm' | 'channel';

/** How long a reset request lives (the API's rule); the message shows when it ends. */
export const RESET_TTL_MS = 10 * 60_000;

/** Plain texts: the private answers, which are not embeds, and the pieces the embeds are made of. */
export const RESET_MESSAGES = {
  completed: '✅ Contraseña actualizada. Te recomendamos revisar tus sesiones con `/sessions`.',
  unavailable: 'Esta solicitud venció o ya fue atendida. Si todavía la necesitas, pídela de nuevo desde la web.',
  notActivated: 'Primero activa tu cuenta con `/register`.',
  notReady: 'Todavía estamos registrando la solicitud. Espera unos segundos y vuelve a pulsar el botón.',
  modalTitle: 'Nueva contraseña',
  // Discord does not mask text inputs, so the field says so
  modalLabel: 'Nueva contraseña (se ve al escribir)',
} as const;

const card = (color: number, title: string, description?: string) => {
  const embed = new EmbedBuilder().setColor(color).setTitle(title);
  return description ? embed.setDescription(description) : embed;
};

/** The request, as the member sees it in their DMs. */
const dmEmbed = (expiresAt: Date) =>
  card(COLORS.blurple, '🔑 Solicitud para restablecer tu contraseña', `Pediste restablecer tu contraseña de Panitacraft desde la web. **Vence ${discordTimestamp(expiresAt, 'R')}.**`).addFields(
    { name: 'Si fuiste tú', value: 'Pulsa **Restablecer** y escribe tu nueva contraseña.' },
    { name: 'Si no fuiste tú', value: 'Pulsa **Ignorar** y revisa tus sesiones abiertas con `/sessions`.' },
  );

/** The request in the public channel: no secret, and the buttons only answer to the member it names. */
const channelEmbed = (expiresAt: Date) =>
  card(COLORS.blurple, '🔑 Solicitud para restablecer una contraseña', `Se pidió restablecer la contraseña de esta cuenta de Panitacraft desde la web. **Vence ${discordTimestamp(expiresAt, 'R')}.**\nSolo la persona mencionada puede usar estos botones.`).addFields({
    name: 'Si no fuiste tú',
    value: 'Pulsa **Ignorar**.',
  });

/** What a request message is edited to once it is used, with no buttons. */
export type ResetEnd = 'completed' | 'ignored' | 'unavailable';

const DM_ENDS: Record<ResetEnd, () => EmbedBuilder> = {
  completed: () => card(COLORS.success, '✅ Contraseña actualizada', 'Te recomendamos revisar tus sesiones abiertas con `/sessions`.'),
  ignored: () => card(COLORS.dark, 'Solicitud cancelada', 'No se cambió nada. Si no fuiste tú, revisa tus sesiones abiertas con `/sessions`.'),
  unavailable: () => card(COLORS.warning, 'Solicitud no disponible', RESET_MESSAGES.unavailable),
};

// What stays in the public message: nothing that says what was chosen, and no mention
const CHANNEL_ENDS: Record<ResetEnd, () => EmbedBuilder> = {
  completed: () => card(COLORS.dark, 'Solicitud atendida'),
  ignored: () => card(COLORS.dark, 'Solicitud cancelada'),
  unavailable: () => card(COLORS.dark, 'Solicitud no disponible'),
};

/** The edit that replaces a used request message: an embed and no buttons (the empty content drops a mention). */
export const endPayload = (place: ResetPlace, end: ResetEnd) => ({
  content: '',
  embeds: [(place === 'dm' ? DM_ENDS : CHANNEL_ENDS)[end]()],
  components: [],
});

/** A component id of a request, usable only by the member it belongs to. */
export const resetId = (action: (typeof RESET_ACTIONS)[keyof typeof RESET_ACTIONS], requestId: string, ownerId: string): string =>
  encodeCustomId({ namespace: RESET_NAMESPACE, action, args: [requestId], owner: ownerId });

export const resetButtons = (requestId: string, ownerId: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(resetId(RESET_ACTIONS.reset, requestId, ownerId)).setLabel('Restablecer').setStyle(ButtonStyle.Primary).setEmoji('🔑'),
    new ButtonBuilder().setCustomId(resetId(RESET_ACTIONS.ignore, requestId, ownerId)).setLabel('Ignorar').setStyle(ButtonStyle.Secondary),
  );

export interface ResetMessage {
  content?: string;
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
  allowedMentions?: MessageMentionOptions;
}

export const buildDmMessage = (requestId: string, discordId: string, expiresAt: Date): ResetMessage => ({
  embeds: [dmEmbed(expiresAt)],
  components: [resetButtons(requestId, discordId)],
});

export const buildChannelMessage = (requestId: string, discordId: string, expiresAt: Date): ResetMessage => ({
  // The mention is in the content: one in an embed would not notify anyone
  content: `<@${discordId}>`,
  embeds: [channelEmbed(expiresAt)],
  components: [resetButtons(requestId, discordId)],
  // Only that member is pinged, whatever else the text ever contains
  allowedMentions: { users: [discordId] },
});

/** The one-field form of "Restablecer". Unlike `/register`, it has no repeat field: Discord shows both in plain text anyway. */
export const buildResetModal = (requestId: string, ownerId: string) =>
  new ModalBuilder()
    .setCustomId(resetId(RESET_ACTIONS.submit, requestId, ownerId))
    .setTitle(RESET_MESSAGES.modalTitle)
    .addComponents(textInput(PASSWORD_INPUT, RESET_MESSAGES.modalLabel, 6, 32, PASSWORD_PLACEHOLDER));
