import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  type MessageMentionOptions,
} from 'discord.js';
import { encodeCustomId } from '../../core/customId';
import { PASSWORD_INPUT, PASSWORD_PLACEHOLDER, textInput } from '../../lib/registration';

/** The reset components live on `/register`: the router needs the namespace to be a command's name. */
export const RESET_NAMESPACE = 'register';
export const RESET_ACTIONS = { reset: 'reset', submit: 'resetsubmit', ignore: 'resetignore' } as const;

/** Where the request message lives: the member's DMs, or the public channel used when their DMs are closed. */
export type ResetPlace = 'dm' | 'channel';

export const RESET_MESSAGES = {
  dm:
    '🔑 **Solicitud para restablecer tu contraseña**\n' +
    'Pediste restablecer tu contraseña de Panitacraft desde la web. Vence en 10 minutos.\n' +
    'Si fuiste tú, pulsa **Restablecer**. Si no, pulsa **Ignorar** y revisa tus sesiones con `/sessions`.',
  // Public: no secret, and the buttons only answer to the member it names
  channel: (discordId: string) =>
    `🔑 <@${discordId}> pidió restablecer su contraseña de Panitacraft desde la web. Vence en 10 minutos.\n` +
    'Solo esa persona puede usar estos botones. Si no fuiste tú, pulsa **Ignorar**.',
  completed: '✅ Contraseña actualizada. Te recomendamos revisar tus sesiones con `/sessions`.',
  ignored: 'Solicitud cancelada.',
  unavailable: 'Esta solicitud venció o ya fue atendida. Si todavía la necesitas, pídela de nuevo desde la web.',
  notActivated: 'Primero activa tu cuenta con `/register`.',
  modalTitle: 'Nueva contraseña',
  // Discord does not mask text inputs, so the field says so
  modalLabel: 'Nueva contraseña (se ve al escribir)',
  // What stays in the public message once it is used: nothing that says what was chosen
  channelDone: { completed: 'Solicitud atendida.', ignored: 'Solicitud cancelada.', unavailable: 'Esta solicitud ya no está disponible.' },
} as const;

/** What a request message is edited to once it is used, with no buttons. */
export type ResetEnd = 'completed' | 'ignored' | 'unavailable';

export const endMessage = (place: ResetPlace, end: ResetEnd): string =>
  place === 'dm' ? RESET_MESSAGES[end] : RESET_MESSAGES.channelDone[end];

/** A component id of a request, usable only by the member it belongs to. */
export const resetId = (action: (typeof RESET_ACTIONS)[keyof typeof RESET_ACTIONS], requestId: string, ownerId: string): string =>
  encodeCustomId({ namespace: RESET_NAMESPACE, action, args: [requestId], owner: ownerId });

export const resetButtons = (requestId: string, ownerId: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(resetId(RESET_ACTIONS.reset, requestId, ownerId)).setLabel('Restablecer').setStyle(ButtonStyle.Primary).setEmoji('🔑'),
    new ButtonBuilder().setCustomId(resetId(RESET_ACTIONS.ignore, requestId, ownerId)).setLabel('Ignorar').setStyle(ButtonStyle.Secondary),
  );

export interface ResetMessage {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
  allowedMentions?: MessageMentionOptions;
}

export const buildDmMessage = (requestId: string, discordId: string): ResetMessage => ({
  content: RESET_MESSAGES.dm,
  components: [resetButtons(requestId, discordId)],
});

export const buildChannelMessage = (requestId: string, discordId: string): ResetMessage => ({
  content: RESET_MESSAGES.channel(discordId),
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
