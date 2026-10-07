import {
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type SlashCommandStringOption,
  type ModalActionRowComponentBuilder,
} from 'discord.js';
import { CATEGORIES, COLORS } from '../../config/constants';
import { defineCommand } from '../../core/command';
import type { CommandContext } from '../../core/context';
import { UserError } from '../../core/errors';
import { panelModalId, TICKET_NAMESPACE } from '../../features/tickets/embeds';
import { legacyTicketCustomId, ticketComponents } from '../../features/tickets/components';
import { deletePanelMessage, sendPanel } from '../../features/tickets/panel';
import { deletePanel, getPanel, listPanels, updatePanel, type PanelConfigUpdate } from '../../services/tickets';

const PANEL_NOT_FOUND = '❌ No se encontró ningún panel con ese ID.';
/** The API refuses larger counters. */
const COUNTER_MAX = 1_000_000_000;

const panelIdOption = (description = 'ID del panel') =>
  (option: SlashCommandStringOption) => option.setName('panel_id').setDescription(description).setRequired(true);

const input = (id: string, label: string, style: TextInputStyle, required: boolean, placeholder?: string) => {
  const field = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required);
  if (placeholder) field.setPlaceholder(placeholder);
  return new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(field);
};

const requirePanel = async (panelId: string) => {
  const panel = await getPanel(panelId);
  if (!panel) throw new UserError(PANEL_NOT_FOUND);
  return panel;
};

/** Shared flow for the `config` subcommands. */
const configurePanel = async (ctx: CommandContext, data: PanelConfigUpdate, message: (panelId: string) => string) => {
  await ctx.defer();
  const panel = await updatePanel(ctx.options.getString('panel_id', true), data);
  if (!panel) return ctx.reply(PANEL_NOT_FOUND);
  await ctx.reply({ content: message(panel.id), allowedMentions: { roles: [] } });
};

const subcommands: Record<string, (ctx: CommandContext) => Promise<unknown>> = {
  async 'panel create'(ctx) {
    const target = ctx.options.getChannel('canal') ?? ctx.channel;
    await ctx.showModal(
      new ModalBuilder()
        .setCustomId(panelModalId(target?.id ?? ctx.channel?.id ?? 'none'))
        .setTitle('Crear Panel de Tickets')
        .addComponents(
          input('indole', 'Identificador único', TextInputStyle.Short, true, 'ej. soporte, reportes, dudas'),
          input('title', 'Título del Panel', TextInputStyle.Short, true),
          input('description', 'Descripción del Panel', TextInputStyle.Paragraph, false),
        ),
    );
  },

  async 'panel delete'(ctx) {
    await ctx.defer();
    const panel = await requirePanel(ctx.options.getString('panel_id', true));
    await deletePanelMessage(ctx.client, panel);
    // It may have been deleted since the lookup above
    if (!(await deletePanel(panel.id))) throw new UserError(PANEL_NOT_FOUND);
    await ctx.reply(`✅ Panel **${panel.id}** eliminado.`);
  },

  async 'panel resend'(ctx) {
    const channel = ctx.options.getChannel('canal', true);
    if (channel.type !== ChannelType.GuildText) throw new UserError('❌ Debes mencionar un canal de texto válido.');

    await ctx.defer();
    const panel = await requirePanel(ctx.options.getString('panel_id', true));
    await deletePanelMessage(ctx.client, panel);
    const message = await sendPanel(channel, panel);
    await updatePanel(panel.id, { channel_id: channel.id, message_id: message.id });
    await ctx.reply(`✅ Panel reenviado a <#${channel.id}>.`);
  },

  async 'panel list'(ctx) {
    await ctx.defer();
    const panels = await listPanels(ctx.guild.id);
    if (panels.length === 0) return ctx.reply('❌ No hay ningún panel de tickets configurado en este servidor.');

    const embed = new EmbedBuilder()
      .setTitle('Paneles de Tickets Existentes')
      .setColor(COLORS.tickets)
      .setDescription(panels.map(p => `- \`${p.id}\``).join('\n'))
      .setFooter({ text: `Total: ${panels.length} panel(es)` });
    await ctx.reply({ embeds: [embed] });
  },

  async 'panel info'(ctx) {
    await ctx.defer();
    const panel = await requirePanel(ctx.options.getString('panel_id', true));

    let category = 'Sin configurar';
    if (panel.category_id) {
      const channel = ctx.guild.channels.cache.get(panel.category_id)
        ?? await ctx.guild.channels.fetch(panel.category_id).catch(() => null);
      category = `\`${channel?.name ?? panel.category_id}\``;
    }

    const embed = new EmbedBuilder()
      .setTitle('Información de Panel')
      .setColor(COLORS.tickets)
      .addFields(
        { name: 'ID', value: `\`${panel.id}\`` },
        { name: 'Título', value: panel.title },
        { name: 'Descripción', value: panel.description || 'Sin configurar' },
        { name: 'Rol Staff', value: panel.staff_role_id ? `<@&${panel.staff_role_id}>` : 'Sin configurar', inline: true },
        { name: 'Canal del Panel', value: `<#${panel.channel_id}>`, inline: true },
        { name: 'Categoría', value: category, inline: true },
      )
      .setFooter({ text: `Se han creado ${panel.ticket_counter} tickets en este panel` });
    await ctx.reply({ embeds: [embed] });
  },

  'config staff_role'(ctx) {
    const role = ctx.options.getRole('role', true);
    return configurePanel(ctx, { staff_role_id: role.id },
      id => `✅ El rol de staff para el panel **${id}** ha sido configurado a <@&${role.id}>.`);
  },

  'config category'(ctx) {
    const category = ctx.options.getChannel('category', true);
    if (category.type !== ChannelType.GuildCategory) throw new UserError('❌ Debes indicar una categoría válida.');
    return configurePanel(ctx, { category_id: category.id },
      id => `✅ Los tickets para el panel **${id}** se crearán en la categoría \`${category.name}\`.`);
  },

  'config counter'(ctx) {
    const number = ctx.options.getInteger('number', true);
    return configurePanel(ctx, { ticket_counter: number },
      id => `✅ El contador del panel **${id}** ha sido seteado a ${number}.`);
  },

  'config show_id_in_name'(ctx) {
    const show = ctx.options.getBoolean('show', true);
    return configurePanel(ctx, { show_panel_id_in_name: show },
      id => `✅ Mostrar ID en el nombre del canal para el panel **${id}** ha sido seteado a \`${show}\`.`);
  },
};

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName(TICKET_NAMESPACE)
    .setDescription('Proveedor del sistema de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommandGroup(group => group
      .setName('panel')
      .setDescription('Administrar paneles de tickets')
      .addSubcommand(sub => sub
        .setName('create')
        .setDescription('Crea un panel de tickets')
        .addChannelOption(opt => opt.setName('canal').setDescription('Canal donde se enviará el panel').addChannelTypes(ChannelType.GuildText)))
      .addSubcommand(sub => sub
        .setName('resend')
        .setDescription('Reenvía un panel existente a un canal específico')
        .addStringOption(panelIdOption())
        .addChannelOption(opt => opt.setName('canal').setDescription('Canal destino').addChannelTypes(ChannelType.GuildText).setRequired(true)))
      .addSubcommand(sub => sub
        .setName('delete')
        .setDescription('Elimina un panel de tickets existente')
        .addStringOption(panelIdOption()))
      .addSubcommand(sub => sub
        .setName('list')
        .setDescription('Lista todos los paneles de tickets en este servidor'))
      .addSubcommand(sub => sub
        .setName('info')
        .setDescription('Muestra la información de un panel')
        .addStringOption(panelIdOption())))
    .addSubcommandGroup(group => group
      .setName('config')
      .setDescription('Configura un panel existente')
      .addSubcommand(sub => sub
        .setName('staff_role')
        .setDescription('Define el rol de staff para un panel')
        .addStringOption(panelIdOption())
        .addRoleOption(opt => opt.setName('role').setDescription('Rol de staff').setRequired(true)))
      .addSubcommand(sub => sub
        .setName('category')
        .setDescription('Define la categoría donde se crearán los tickets')
        .addStringOption(panelIdOption())
        .addChannelOption(opt => opt.setName('category').setDescription('Categoría').addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
      .addSubcommand(sub => sub
        .setName('counter')
        .setDescription('Ajusta el número de contador de tickets')
        .addStringOption(panelIdOption())
        .addIntegerOption(opt => opt.setName('number').setDescription('Número inicial').setMinValue(0).setMaxValue(COUNTER_MAX).setRequired(true)))
      .addSubcommand(sub => sub
        .setName('show_id_in_name')
        .setDescription('Alternar si se muestra el ID del panel en el nombre del ticket')
        .addStringOption(panelIdOption())
        .addBooleanOption(opt => opt.setName('show').setDescription('Mostrar u ocultar (true/false)').setRequired(true)))),
  meta: {
    category: CATEGORIES.tickets,
    description: 'Sistema de tickets oficial: paneles y su configuración.',
    access: 'staff',
  },
  async run(ctx) {
    const handler = subcommands[`${ctx.options.getSubcommandGroup()} ${ctx.options.getSubcommand()}`];
    if (!handler) throw new UserError('❌ Subcomando inválido.');
    await handler(ctx);
  },
  components: ticketComponents,
  legacyCustomId: legacyTicketCustomId,
});
