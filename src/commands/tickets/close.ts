import { 
  ChatInputCommandInteraction, 
  SlashCommandBuilder, 
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { prisma } from '../../lib/prisma';

export const data = new SlashCommandBuilder()
  .setName('close')
  .setDescription('Cierra forzosamente el ticket actual');

export const metadata = {
  category: 'Tickets',
  description: 'Cierra el ticket actual de forma segura.',
  usage: 'close',
  slashOnly: false,
  devOnly: false,
  staffOnly: true
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await interaction.deferReply();
  const ticket = await prisma.ticket.findUnique({
    where: { channel_id: interaction.channelId }
  });

  if (!ticket) {
    return interaction.editReply({ content: '❌ Este canal no pertenece a un ticket.' });
  }

  if (ticket.status === 'CLOSED') {
    return interaction.editReply('❌ Este ticket ya está cerrado.');
  }
  
  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('btn_ticket_close_confirm').setLabel('Cerrar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('btn_ticket_close_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
  );

  return interaction.editReply({
    content: '¿Estás seguro de que quieres cerrar este ticket?',
    components: [confirmRow]
  });
};
