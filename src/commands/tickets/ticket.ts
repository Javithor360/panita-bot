import { 
  ChatInputCommandInteraction, 
  SlashCommandBuilder, 
  ButtonInteraction, 
  ModalSubmitInteraction,
  PermissionsBitField,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  TextChannel,
  AttachmentBuilder,
  OverwriteResolvable,
  Message,
  ModalActionRowComponentBuilder
} from 'discord.js';
import { prisma } from '../../lib/prisma';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Proveedor del sistema de tickets')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
  .addSubcommandGroup(group => group
    .setName('panel')
    .setDescription('Administrar paneles de tickets')
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Crea un panel de tickets')
      .addChannelOption(opt => opt.setName('canal').setDescription('Canal donde se enviará el panel').addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand(sub => sub
      .setName('resend')
      .setDescription('Reenvía un panel existente a un canal específico')
      .addStringOption(opt => opt.setName('panel_id').setDescription('ID del panel').setRequired(true))
      .addChannelOption(opt => opt.setName('canal').setDescription('Canal destino').addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('delete')
      .setDescription('Elimina un panel de tickets existente')
      .addStringOption(opt => opt.setName('panel_id').setDescription('ID del panel').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('Lista todos los paneles de tickets en este servidor')
    )
    .addSubcommand(sub => sub
      .setName('info')
      .setDescription('Muestra la información de un panel')
      .addStringOption(opt => opt.setName('panel_id').setDescription('ID del panel').setRequired(true))
    )
  )
  .addSubcommandGroup(group => group
    .setName('config')
    .setDescription('Configura un panel existente')
    .addSubcommand(sub => sub
      .setName('staff_role')
      .setDescription('Define el rol de staff para un panel')
      .addStringOption(opt => opt.setName('panel_id').setDescription('ID del panel (o channel ID)').setRequired(true))
      .addRoleOption(opt => opt.setName('role').setDescription('Rol de staff').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('category')
      .setDescription('Define la categoría donde se crearán los tickets')
      .addStringOption(opt => opt.setName('panel_id').setDescription('ID del panel').setRequired(true))
      .addChannelOption(opt => opt.setName('category').setDescription('Categoría').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('counter')
      .setDescription('Ajusta el número de contador de tickets')
      .addStringOption(opt => opt.setName('panel_id').setDescription('ID del panel').setRequired(true))
      .addIntegerOption(opt => opt.setName('number').setDescription('Número inicial').setRequired(true))
    )
  );

export const metadata = {
  category: 'Tickets',
  description: 'Sistema de tickets oficial.',
  usage: 'ticket <panel|config>',
  slashOnly: false,
  devOnly: false,
  staffOnly: true
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const subcommandGroup = interaction.options.getSubcommandGroup();
  const subcommand = interaction.options.getSubcommand();
  const args = (interaction as any).args as string[] | undefined;
  const isPrefix = !!args;

  if (isPrefix) {
    if (!subcommandGroup && !subcommand) {
      return interaction.reply('**ℹ️ Uso Correcto**\n`!ticket panel <resend|delete|list|info>`\n`!ticket config <staff_role|category|counter>`');
    }
    if (subcommandGroup === 'panel' && !subcommand) {
      return interaction.reply('**ℹ️ Uso Correcto**\n`!ticket panel <resend|delete|list|info>`');
    }
    if (subcommandGroup === 'config' && !subcommand) {
      return interaction.reply('**ℹ️ Uso Correcto**\n`!ticket config <staff_role|category|counter>`');
    }
  }

  if (subcommandGroup === 'panel') {
    if (subcommand === 'create') {
      if (isPrefix) {
        return interaction.reply('❌ Este comando abre un formulario interactivo y solo se puede ejecutar mediante **Slash Command** (ej: `/ticket panel create`).');
      }
      const indoleInput = new TextInputBuilder({
        custom_id: 'indole',
        label: 'Identificador único',
        style: TextInputStyle.Short,
        required: true,
        placeholder: 'ej. soporte, reportes, dudas'
      });

      const titleInput = new TextInputBuilder({
        custom_id: 'title',
        label: 'Título del Panel',
        style: TextInputStyle.Short,
        required: true
      });

      const descInput = new TextInputBuilder({
        custom_id: 'description',
        label: 'Descripción del Panel',
        style: TextInputStyle.Paragraph,
        required: false
      });

      const targetChannel = interaction.options.getChannel('canal') || interaction.channel;
      const targetChannelId = targetChannel?.id || 'none';

      const modal = new ModalBuilder({
        custom_id: `modal_ticket_create_${targetChannelId}`,
        title: 'Crear Panel de Tickets',
        components: [
          new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(indoleInput),
          new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(titleInput),
          new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(descInput)
        ]
      });

      await interaction.showModal(modal);
      return;
    }

    if (subcommand === 'delete') {
      const panelId = isPrefix ? args[2] : interaction.options.getString('panel_id');
      if (!panelId) return interaction.reply('❌ Debes especificar el ID del panel (ej: `!ticket panel delete soporte`).');
      
      await interaction.deferReply();
      const panel = await prisma.ticketPanel.findUnique({ where: { id: panelId } });
      if (!panel) {
        return interaction.editReply('❌ No se encontró ningún panel con ese ID.');
      }
      
      try {
        const channel = await interaction.client.channels.fetch(panel.channel_id) as TextChannel;
        if (channel) {
          const msg = await channel.messages.fetch(panel.message_id).catch(() => null);
          if (msg) await msg.delete();
        }
      } catch (e) {}

      await prisma.ticketPanel.delete({ where: { id: panel.id } });
      return interaction.editReply(`✅ Panel **${panel.id}** eliminado.`);
    }

    if (subcommand === 'resend') {
      const panelId = isPrefix ? args[2] : interaction.options.getString('panel_id');
      if (!panelId) return interaction.reply('❌ Debes especificar el ID del panel (ej: `!ticket panel resend soporte #canal`).');
      const canal = interaction.options.getChannel('canal') as TextChannel;
      if (!canal || !canal.id) return interaction.reply('❌ Debes mencionar un canal válido.');

      await interaction.deferReply();
      
      const panel = await prisma.ticketPanel.findUnique({ where: { id: panelId } });
      if (!panel) return interaction.editReply('❌ No se encontró ningún panel con ese ID/índole.');

      try {
        const oldChannel = await interaction.client.channels.fetch(panel.channel_id) as TextChannel;
        if (oldChannel) {
          const oldMsg = await oldChannel.messages.fetch(panel.message_id).catch(() => null);
          if (oldMsg) await oldMsg.delete();
        }
      } catch (e) {}

      const embed = new EmbedBuilder()
        .setTitle(panel.title)
        .setDescription(panel.description)
        .setColor('#1ec45b');

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`btn_ticket_create_${panel.id}`)
          .setLabel('Crear Ticket')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📩')
      );

      const msg = await canal.send({
        embeds: [embed],
        components: [row]
      });

      await prisma.ticketPanel.update({
        where: { id: panel.id },
        data: { channel_id: canal.id, message_id: msg.id }
      });

      return interaction.editReply(`✅ Panel reenviado a <#${canal.id}>.`);
    }

    if (subcommand === 'list') {
      await interaction.deferReply();
      const panels = await prisma.ticketPanel.findMany({
        where: { guild_id: interaction.guildId! }
      });

      if (panels.length === 0) {
        return interaction.editReply('❌ No hay ningún panel de tickets configurado en este servidor.');
      }

      const listText = panels.map(p => `- \`${p.id}\``).join('\n');
      const embed = new EmbedBuilder()
        .setTitle('Paneles de Tickets Existentes')
        .setColor('#1ec45b')
        .setDescription(listText)
        .setFooter({ text: `Total: ${panels.length} panel(es)` });
      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === 'info') {
      const panelId = isPrefix ? args[2] : interaction.options.getString('panel_id');
      if (!panelId) return interaction.reply('❌ Debes especificar el ID del panel (ej: `!ticket panel info soporte`).');

      await interaction.deferReply();
      const p = await prisma.ticketPanel.findUnique({ where: { id: panelId } });
      if (!p) return interaction.editReply('❌ No se encontró ningún panel con ese ID.');
      
      const roleStr = p.staff_role_id ? `<@&${p.staff_role_id}>` : 'Sin configurar';
      let catStr = 'Sin configurar';
      if (p.category_id) {
        const cat = interaction.client.channels.cache.get(p.category_id) || await interaction.client.channels.fetch(p.category_id).catch(() => null);
        catStr = cat && 'name' in cat ? `\`${cat.name}\`` : `\`${p.category_id}\``;
      }
      const channelStr = `<#${p.channel_id}>`;

      const embed = new EmbedBuilder()
        .setTitle('Información de Panel')
        .setColor('#1ec45b')
        .addFields(
          { name: 'ID', value: `\`${p.id}\``, inline: false },
          { name: 'Título', value: p.title, inline: false },
          { name: 'Descripción', value: p.description || 'Sin configurar', inline: false },
          { name: 'Rol Staff', value: roleStr, inline: true },
          { name: 'Canal del Panel', value: channelStr, inline: true },
          { name: 'Categoría', value: catStr, inline: true }
        )
        .setFooter({ text: `Se han creado ${p.ticket_counter} tickets en este panel` });
        
      return interaction.editReply({ embeds: [embed] });
    }
  }

  if (subcommandGroup === 'config') {
    const panelQueryId = isPrefix ? args[2] : interaction.options.getString('panel_id');
    if (!panelQueryId) return interaction.reply('❌ Debes especificar el ID del panel (ej: `!ticket config staff_role soporte @Staff`).');

    if (subcommand === 'staff_role') {
      const role = interaction.options.getRole('role');
      if (!role || !role.id) return interaction.reply('❌ Debes mencionar un rol válido.');

      await interaction.deferReply();
      let panel = await prisma.ticketPanel.findFirst({ where: { id: panelQueryId } });
      if (!panel) return interaction.editReply('❌ No se encontró ningún panel con ese ID.');

      await prisma.ticketPanel.update({
        where: { id: panel.id },
        data: { staff_role_id: role.id }
      });
      return interaction.editReply({
        content: `✅ El rol de staff para el panel **${panel.id}** ha sido configurado a <@&${role.id}>.`,
        allowedMentions: { roles: [] }
      });
    }

    if (subcommand === 'category') {
      const category = interaction.options.getChannel('category');
      if (!category || !category.id) return interaction.reply('❌ Debes mencionar una categoría válida.');

      await interaction.deferReply();
      let panel = await prisma.ticketPanel.findFirst({ where: { id: panelQueryId } });
      if (!panel) return interaction.editReply('❌ No se encontró ningún panel con ese ID.');

      await prisma.ticketPanel.update({
        where: { id: panel.id },
        data: { category_id: category.id }
      });
      return interaction.editReply(`✅ Los tickets para el panel **${panel.id}** se crearán en la categoría \`${(category as any).name || category.id}\`.`);
    }

    if (subcommand === 'counter') {
      const number = interaction.options.getInteger('number');
      if (number === null) return interaction.reply('❌ Debes especificar un número válido.');

      await interaction.deferReply();
      let panel = await prisma.ticketPanel.findFirst({ where: { id: panelQueryId } });
      if (!panel) return interaction.editReply('❌ No se encontró ningún panel con ese ID.');

      await prisma.ticketPanel.update({
        where: { id: panel.id },
        data: { ticket_counter: number }
      });
      return interaction.editReply(`✅ El contador del panel **${panel.id}** ha sido seteado a ${number}.`);
    }
  }
};

export const executeModal = async (interaction: ModalSubmitInteraction) => {
  if (interaction.customId.startsWith('modal_ticket_create_')) {
    await interaction.deferReply();

    const targetChannelId = interaction.customId.replace('modal_ticket_create_', '');
    const channelId = targetChannelId === 'none' ? interaction.channelId : targetChannelId;

    const title = interaction.fields.getTextInputValue('title');
    let description = 'Para crear un ticket, pulsa el botón de abajo.';
    let indole = interaction.fields.getTextInputValue('indole');
    try { description = interaction.fields.getTextInputValue('description') || description; } catch (e) {}

    if (!channelId || !interaction.guildId) {
      return interaction.editReply('❌ No se puede crear el panel en ese canal.');
    }

    const existingPanel = await prisma.ticketPanel.findUnique({ where: { id: indole } });
    if (existingPanel) {
      return interaction.editReply(`❌ Ya existe un panel con la índole/ID **${indole}**. Por favor elige otro o elimínalo primero.`);
    }

    const panel = await prisma.ticketPanel.create({
      data: {
        id: indole,
        guild_id: interaction.guildId!,
        channel_id: channelId,
        message_id: 'temp',
        title,
        description
      }
    });

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor('#1ec45b');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_ticket_create_${panel.id}`)
        .setLabel('Crear Ticket')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📩')
    );

    const channel = await interaction.client.channels.fetch(channelId) as TextChannel;
    const msg = await channel.send({
      embeds: [embed],
      components: [row]
    });

    await prisma.ticketPanel.update({
      where: { id: panel.id },
      data: { message_id: msg.id }
    });

    await interaction.editReply(`✅ Panel creado con éxito! ID del panel: \`${panel.id}\``);
  }
};

export const executeButton = async (interaction: ButtonInteraction) => {
  if (interaction.customId.startsWith('btn_ticket_create_')) {
    await interaction.deferReply({ ephemeral: true });
    
    const existingTicket = await prisma.ticket.findFirst({
      where: { 
        creator_id: interaction.user.id,
        status: 'OPEN',
        panel: {
          guild_id: interaction.guildId!
        }
      }
    });

    if (existingTicket) {
      return interaction.editReply(`Parece que ya tienes un ticket abierto en <#${existingTicket.channel_id}>, para abrir uno nuevo primero debes cerrar el ya existente.`);
    }

    const panelId = interaction.customId.replace('btn_ticket_create_', '');
    const panel = await prisma.ticketPanel.findUnique({ where: { id: panelId } });

    if (!panel) {
      return interaction.editReply('❌ No se encontró el panel de tickets.');
    }

    const updatedPanel = await prisma.ticketPanel.update({
      where: { id: panel.id },
      data: { ticket_counter: { increment: 1 } }
    });

    const ticketNumber = updatedPanel.ticket_counter.toString().padStart(4, '0');
    let channelName = `ticket-${panel.id}-${ticketNumber}`;

    const permissionOverwrites: OverwriteResolvable[] = [
      {
        id: interaction.guildId!,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
      },
      {
        id: interaction.client.user!.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels],
      }
    ];

    if (panel.staff_role_id) {
      permissionOverwrites.push({
        id: panel.staff_role_id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
      });
    }

    try {
      const ticketChannel = await interaction.guild!.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: panel.category_id || undefined,
        permissionOverwrites
      });

      const dbTicket = await prisma.ticket.create({
        data: {
          channel_id: ticketChannel.id,
          panel_id: panel.id,
          creator_id: interaction.user.id
        }
      });

      const welcomeEmbed = new EmbedBuilder()
        .setDescription(`Soporte estará contigo en breve.\nSi quieres salir, pulsa el botón de **Cerrar**.`)
        .setColor('#1ec45b');

      const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_ticket_close_prompt')
          .setLabel('Cerrar')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔒')
      );

      const staffPing = panel.staff_role_id ? `<@&${panel.staff_role_id}>` : '';
      const anchorMessage = await ticketChannel.send({
        content: `¡Bienvenidos, <@${interaction.user.id}>${staffPing ? ` y ${staffPing}` : ''}!`,
        embeds: [welcomeEmbed],
        components: [closeRow]
      });
      
      await anchorMessage.pin();
      
      // Borrar el mensaje de sistema de anclaje
      setTimeout(async () => {
        try {
          const sysMsgs = await ticketChannel.messages.fetch({ limit: 5 });
          const pinMsg = sysMsgs.find(m => m.type === 6); // 6 is ChannelPinnedMessage
          if (pinMsg) await pinMsg.delete();
        } catch (e) {}
      }, 1000);

      await interaction.editReply(`✅ Tu ticket ha sido creado: <#${ticketChannel.id}>`);

    } catch (error) {
      console.error(error);
      await interaction.editReply('❌ Hubo un error al crear tu canal de ticket.');
    }
  }

  else if (interaction.customId === 'btn_ticket_close_prompt') {
    const ticket = await prisma.ticket.findUnique({
      where: { channel_id: interaction.channelId }
    });

    if (!ticket || ticket.status === 'CLOSED') {
      return interaction.reply({ content: '❌ Este ticket ya está cerrado o es inválido.', ephemeral: true });
    }

    const panel = await prisma.ticketPanel.findUnique({ where: { id: ticket.panel_id } });
    const isStaff = panel?.staff_role_id ? (interaction.member?.roles as any).cache.has(panel.staff_role_id) : false;
    const isCreator = interaction.user.id === ticket.creator_id;
    const isAdmin = (interaction.member?.permissions as Readonly<PermissionsBitField>).has(PermissionsBitField.Flags.Administrator);

    if (!isStaff && !isCreator && !isAdmin) {
      return interaction.reply({ content: '❌ Solo el creador del ticket o un staff puede cerrarlo.', ephemeral: true });
    }

    const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('btn_ticket_close_confirm').setLabel('Cerrar').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('btn_ticket_close_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: '¿Estás seguro de que quieres cerrar este ticket?',
      components: [confirmRow]
    });
  }

  else if (interaction.customId === 'btn_ticket_close_confirm') {
    await interaction.deferUpdate();
    
    const ticket = await prisma.ticket.findUnique({
      where: { channel_id: interaction.channelId }
    });

    if (!ticket) return;

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'CLOSED' }
    });

    const channel = interaction.channel as TextChannel;
    
    await channel.permissionOverwrites.edit(ticket.creator_id, {
      ViewChannel: false
    }).catch(console.error);

    await interaction.message.delete().catch(() => {});

    const closedEmbed = new EmbedBuilder()
      .setDescription(`Ticket cerrado por <@${interaction.user.id}>`)
      .setColor('#fee75c');

    await channel.send({ embeds: [closedEmbed] });

    const controlsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('btn_ticket_transcript').setLabel('Historial').setStyle(ButtonStyle.Secondary).setEmoji('📄'),
      new ButtonBuilder().setCustomId('btn_ticket_reopen').setLabel('Abrir').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
      new ButtonBuilder().setCustomId('btn_ticket_delete').setLabel('Eliminar').setStyle(ButtonStyle.Secondary).setEmoji('⛔')
    );

    await channel.send({
      content: 'Controles de ticket para el equipo de soporte:',
      components: [controlsRow]
    });
  }

  else if (interaction.customId === 'btn_ticket_close_cancel') {
    await interaction.message.delete().catch(() => {});
  }

  else if (interaction.customId === 'btn_ticket_reopen') {
    await interaction.deferUpdate();

    const ticket = await prisma.ticket.findUnique({
      where: { channel_id: interaction.channelId }
    });

    if (!ticket) return;

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'OPEN' }
    });

    const channel = interaction.channel as TextChannel;
    await channel.permissionOverwrites.edit(ticket.creator_id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    }).catch(console.error);

    await interaction.message.delete().catch(() => {});

    const openedEmbed = new EmbedBuilder()
      .setDescription(`Ticket reabierto por <@${interaction.user.id}>`)
      .setColor('#57F287');

    await channel.send({ embeds: [openedEmbed] });
  }

  else if (interaction.customId === 'btn_ticket_delete') {
    const channel = interaction.channel as TextChannel;
    await interaction.reply('Eliminando canal en unos segundos...');
    setTimeout(async () => {
      await channel.delete().catch(() => {});
    }, 3000);
  }

  else if (interaction.customId === 'btn_ticket_transcript') {
    await interaction.deferReply({ ephemeral: true });
    
    const channel = interaction.channel as TextChannel;
    let messages: Message[] = [];
    let lastId: string | undefined;

    while (true) {
      const fetched = await channel.messages.fetch({ limit: 100, before: lastId });
      if (fetched.size === 0) break;
      
      messages = messages.concat(Array.from(fetched.values()));
      lastId = fetched.last()?.id;
    }

    messages.reverse();

    let transcriptData = `Historial para ${channel.name}\n\n`;
    for (const msg of messages) {
      transcriptData += `[${msg.createdAt.toLocaleString()}] ${msg.author.tag}: ${msg.content || '[Embed/Attachment]'}\n`;
    }

    const buffer = Buffer.from(transcriptData, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `${channel.name}-historial.txt` });

    await interaction.editReply({ content: 'Aquí tienes el historial de mensajes:', files: [attachment] });
  }
};
