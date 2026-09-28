import { ChannelType, MessageFlags, MessageType, OverwriteType, type ButtonInteraction, type TextChannel } from 'discord.js';
import * as discordTranscripts from 'discord-html-transcripts';
import { COLORS } from '../../config/constants';
import { button, modal, type ComponentHandler } from '../../core/command';
import { UserError } from '../../core/errors';
import {
  createPanel,
  createTicket,
  findOpenTicketByCreator,
  findTicketByChannel,
  getPanel,
  nextTicketNumber,
  PANEL_ID_PATTERN,
  setTicketStatus,
  TICKET_STATUS,
} from '../../services/tickets';
import {
  buildCloseConfirm,
  buildClosedControls,
  buildWelcomeMessage,
  statusEmbed,
} from './embeds';
import { sendPanel } from './panel';
import { buildTicketOverwrites, canManageTicket, TICKET_MEMBER_OVERWRITE } from './permissions';

const CHANNEL_DELETE_DELAY_MS = 3000;
const PIN_NOTICE_CLEANUP_DELAY_MS = 1000;

const cachedGuildOf = (interaction: ButtonInteraction) => {
  if (!interaction.inCachedGuild()) throw new UserError('❌ Esta acción solo funciona dentro del servidor.');
  return interaction;
};

const ticketChannelOf = (interaction: ButtonInteraction) => {
  const channel = interaction.channel;
  if (channel?.type !== ChannelType.GuildText) throw new UserError('❌ Esta acción solo funciona en un canal de ticket.');
  return channel;
};

/** Pinning posts a "X pinned a message" notice; remove it to keep the ticket clean. */
const removePinNotice = (channel: TextChannel) =>
  setTimeout(async () => {
    const recent = await channel.messages.fetch({ limit: 5 }).catch(() => null);
    const notice = recent?.find(m => m.type === MessageType.ChannelPinnedMessage);
    await notice?.delete().catch(() => {});
  }, PIN_NOTICE_CLEANUP_DELAY_MS);

const NOT_ALLOWED_CLOSE = '❌ Solo el creador del ticket o un staff puede cerrarlo.';
const NOT_ALLOWED_STAFF = '❌ Solo el equipo de soporte puede usar estos controles.';

/** Guard: the ticket's creator or its panel staff. */
const creatorOrStaff = async (interaction: ButtonInteraction) => {
  if (!interaction.inCachedGuild()) return NOT_ALLOWED_CLOSE;
  const ticket = await findTicketByChannel(interaction.channelId);
  if (!ticket) return null; // the handler reports the invalid ticket
  const allowed = interaction.user.id === ticket.creator_id || canManageTicket(interaction.member, ticket.panel);
  return allowed ? null : NOT_ALLOWED_CLOSE;
};

/** Guard: panel staff or administrators only (closed-ticket controls). */
const staffOnly = async (interaction: ButtonInteraction) => {
  if (!interaction.inCachedGuild()) return NOT_ALLOWED_STAFF;
  const ticket = await findTicketByChannel(interaction.channelId);
  if (!ticket) return null;
  return canManageTicket(interaction.member, ticket.panel) ? null : NOT_ALLOWED_STAFF;
};

const createTicketChannel = button({
  async run(rawInteraction, [panelId]) {
    const interaction = cachedGuildOf(rawInteraction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const existing = await findOpenTicketByCreator(interaction.user.id, interaction.guildId);
    if (existing) {
      return interaction.editReply(`Parece que ya tienes un ticket abierto en <#${existing.channel_id}>, para abrir uno nuevo primero debes cerrar el ya existente.`);
    }

    const panel = await getPanel(panelId);
    if (!panel) return interaction.editReply('❌ No se encontró el panel de tickets.');

    const { ticket_counter: counter, show_panel_id_in_name: showPanelId } = await nextTicketNumber(panel.id);
    const number = counter.toString().padStart(4, '0');

    try {
      const channel = await interaction.guild.channels.create({
        name: showPanelId ? `ticket-${panel.id}-${number}` : `ticket-${number}`,
        type: ChannelType.GuildText,
        parent: panel.category_id ?? undefined,
        permissionOverwrites: buildTicketOverwrites({
          guildId: interaction.guildId,
          creatorId: interaction.user.id,
          botId: interaction.client.user.id,
          staffRoleId: panel.staff_role_id,
        }),
      });

      await createTicket({ channelId: channel.id, panelId: panel.id, creatorId: interaction.user.id });

      const welcome = await channel.send(buildWelcomeMessage(interaction.user.id, panel.staff_role_id));
      await welcome.pin();
      removePinNotice(channel);

      await interaction.editReply(`✅ Tu ticket ha sido creado: <#${channel.id}>`);
    } catch (error) {
      console.error('[Tickets] Failed to create ticket channel:', error);
      await interaction.editReply('❌ Hubo un error al crear tu canal de ticket.');
    }
  },
});

const closePrompt = button({
  guard: creatorOrStaff,
  async run(interaction) {
    const ticket = await findTicketByChannel(interaction.channelId);
    if (!ticket || ticket.status === TICKET_STATUS.closed) {
      return interaction.reply({ content: '❌ Este ticket ya está cerrado o es inválido.', flags: MessageFlags.Ephemeral });
    }
    await interaction.reply(buildCloseConfirm(interaction.user.id));
  },
});

const closeConfirm = button({
  guard: creatorOrStaff,
  async run(interaction) {
    await interaction.deferUpdate();
    const ticket = await findTicketByChannel(interaction.channelId);
    if (!ticket) return;

    await setTicketStatus(ticket.id, TICKET_STATUS.closed);

    const channel = ticketChannelOf(interaction);
    // Not awaited: channel renames are heavily rate limited by Discord
    channel.setName(channel.name.replace(/^ticket-/, 'closed-')).catch(console.error);

    // Remove the creator and any user added with /add (member overwrites), except the bot
    for (const [id, overwrite] of channel.permissionOverwrites.cache) {
      if (overwrite.type === OverwriteType.Member && id !== interaction.client.user.id) {
        channel.permissionOverwrites.delete(id).catch(() => {});
      }
    }

    await interaction.message.delete().catch(() => {});
    await channel.send({ embeds: [statusEmbed(`Ticket cerrado por <@${interaction.user.id}>`, COLORS.warning)] });
    await channel.send(buildClosedControls());
  },
});

const closeCancel = button({
  guard: creatorOrStaff,
  async run(interaction) {
    await interaction.deferUpdate();
    await interaction.message.delete().catch(() => {});
  },
});

const reopen = button({
  guard: staffOnly,
  async run(interaction) {
    await interaction.deferUpdate();
    const ticket = await findTicketByChannel(interaction.channelId);
    if (!ticket) return;

    await setTicketStatus(ticket.id, TICKET_STATUS.open);

    const channel = ticketChannelOf(interaction);
    channel.setName(channel.name.replace(/^closed-/, 'ticket-')).catch(console.error);
    await channel.permissionOverwrites.edit(ticket.creator_id, TICKET_MEMBER_OVERWRITE).catch(console.error);

    await interaction.message.delete().catch(() => {});
    await channel.send({ embeds: [statusEmbed(`Ticket reabierto por <@${interaction.user.id}>`, COLORS.success)] });
  },
});

const deleteChannel = button({
  guard: staffOnly,
  async run(interaction) {
    const channel = ticketChannelOf(interaction);
    await interaction.reply('Eliminando canal en unos segundos...');
    setTimeout(() => channel.delete().catch(() => {}), CHANNEL_DELETE_DELAY_MS);
  },
});

const transcript = button({
  guard: staffOnly,
  async run(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = ticketChannelOf(interaction);

    try {
      const attachment = await discordTranscripts.createTranscript(channel, {
        limit: -1,
        returnType: discordTranscripts.ExportReturnType.Attachment,
        filename: `${channel.name}-transcripcion.html`,
        saveImages: true,
        poweredBy: false,
      });
      await interaction.editReply({ content: 'Aquí tienes la transcripción del ticket:', files: [attachment] });
    } catch (error) {
      console.error('[Tickets] Error generating transcript:', error);
      await interaction.editReply('❌ Hubo un error al generar la transcripción.');
    }
  },
});

const panelModal = modal({
  async run(interaction, [targetChannelId]) {
    await interaction.deferReply();
    if (!interaction.inCachedGuild()) return interaction.editReply('❌ No se puede crear el panel fuera del servidor.');

    const id = interaction.fields.getTextInputValue('indole').trim().toLowerCase();
    const title = interaction.fields.getTextInputValue('title');
    const description = interaction.fields.getTextInputValue('description') || 'Para crear un ticket, pulsa el botón de abajo.';

    if (!PANEL_ID_PATTERN.test(id)) {
      return interaction.editReply('❌ El identificador solo puede contener letras minúsculas, números, `-` y `_` (máx. 32 caracteres).');
    }
    if (await getPanel(id)) {
      return interaction.editReply(`❌ Ya existe un panel con la índole/ID **${id}**. Por favor elige otro o elimínalo primero.`);
    }

    const channel = interaction.guild.channels.cache.get(targetChannelId) ?? interaction.channel;
    if (!channel?.isTextBased()) return interaction.editReply('❌ No se puede crear el panel en ese canal.');

    const message = await sendPanel(channel, { id, title, description });
    try {
      await createPanel({ id, guildId: interaction.guildId, channelId: channel.id, messageId: message.id, title, description });
    } catch (error) {
      await message.delete().catch(() => {});
      throw error;
    }

    await interaction.editReply(`✅ Panel creado con éxito! ID del panel: \`${id}\``);
  },
});

export const ticketComponents: Record<string, ComponentHandler> = {
  create: createTicketChannel,
  closePrompt,
  closeConfirm,
  closeCancel,
  reopen,
  delete: deleteChannel,
  transcript,
  panelModal,
};

/** Custom IDs used before the `ticket:<action>` scheme; ticket panels and controls posted long ago still use them. */
const LEGACY_ACTIONS: Record<string, string> = {
  btn_ticket_close_prompt: 'closePrompt',
  btn_ticket_close_confirm: 'closeConfirm',
  btn_ticket_close_cancel: 'closeCancel',
  btn_ticket_transcript: 'transcript',
  btn_ticket_reopen: 'reopen',
  btn_ticket_delete: 'delete',
};

export const legacyTicketCustomId = (customId: string) => {
  const create = customId.match(/^btn_ticket_create_(.+)$/);
  if (create) return { action: 'create', args: [create[1]] };
  const action = LEGACY_ACTIONS[customId];
  return action ? { action, args: [] } : null;
};
