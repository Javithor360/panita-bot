import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { COLORS } from '../../config/constants';
import { encodeCustomId } from '../../core/customId';

/** Every ticket component lives in the `ticket` command's namespace. */
export const TICKET_NAMESPACE = 'ticket';

const ticketId = (action: string, args: string[] = [], owner?: string) =>
  encodeCustomId({ namespace: TICKET_NAMESPACE, action, args, owner });

const secondaryButton = (customId: string, label: string, emoji: string) =>
  new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Secondary).setEmoji(emoji);

export const buildPanelMessage = (panel: { id: string; title: string; description: string | null }) => ({
  embeds: [
    new EmbedBuilder()
      .setTitle(panel.title)
      .setDescription(panel.description)
      .setColor(COLORS.tickets),
  ],
  components: [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      secondaryButton(ticketId('create', [panel.id]), 'Crear Ticket', '📩'),
    ),
  ],
});

export const buildWelcomeMessage = (creatorId: string, staffRoleId: string | null) => ({
  content: `¡Bienvenidos, <@${creatorId}>${staffRoleId ? ` y <@&${staffRoleId}>` : ''}!`,
  embeds: [
    new EmbedBuilder()
      .setDescription('Soporte estará contigo en breve.\nSi quieres salir, pulsa el botón de **Cerrar**.')
      .setColor(COLORS.tickets),
  ],
  components: [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      secondaryButton(ticketId('closePrompt'), 'Cerrar', '🔒'),
    ),
  ],
});

/** Confirmation shown before closing; `ownerId` restricts it to whoever asked to close. */
export const buildCloseConfirm = (ownerId?: string) => ({
  content: '¿Estás seguro de que quieres cerrar este ticket?',
  components: [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ticketId('closeConfirm', [], ownerId)).setLabel('Cerrar').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(ticketId('closeCancel', [], ownerId)).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
    ),
  ],
});

export const buildClosedControls = () => ({
  content: 'Controles de ticket para el equipo de soporte:',
  components: [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      secondaryButton(ticketId('transcript'), 'Transcripción', '📄'),
      secondaryButton(ticketId('reopen'), 'Reabrir', '🔓'),
      secondaryButton(ticketId('delete'), 'Eliminar', '⛔'),
    ),
  ],
});

export const statusEmbed = (text: string, color: number) => new EmbedBuilder().setDescription(text).setColor(color);

export const panelModalId = (targetChannelId: string) => ticketId('panelModal', [targetChannelId]);
