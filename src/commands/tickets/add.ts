import { 
  ChatInputCommandInteraction, 
  SlashCommandBuilder, 
  PermissionsBitField,
  TextChannel
} from 'discord.js';
import { prisma } from '../../lib/prisma';

export const data = new SlashCommandBuilder()
  .setName('add')
  .setDescription('Añade a un usuario al ticket actual')
  .addUserOption(opt => opt.setName('user').setDescription('Usuario a añadir').setRequired(true));

export const metadata = {
  category: 'Tickets',
  description: 'Añade a un usuario al ticket actual.',
  usage: 'add <usuario>',
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

  const channel = interaction.channel as TextChannel;
  const user = interaction.options.getUser('user');
  
  if (!user || !user.id) {
    return interaction.editReply('❌ Debes mencionar a un usuario válido. Uso correcto: `!add <@usuario>`');
  }

  const fetchedUser = await interaction.client.users.fetch(user.id).catch(() => null);
  if (!fetchedUser) {
    return interaction.editReply('❌ No se encontró ningún usuario con ese nombre o ID en Discord.');
  }

  if (fetchedUser.id === ticket.creator_id) {
    return interaction.editReply(`❌ El usuario <@${fetchedUser.id}> es el creador del ticket y ya está en él.`);
  }

  const overwrite = channel.permissionOverwrites.cache.get(fetchedUser.id);
  if (overwrite && overwrite.allow.has(PermissionsBitField.Flags.ViewChannel)) {
    return interaction.editReply(`❌ El usuario <@${fetchedUser.id}> ya está en el ticket.`);
  }
  
  await channel.permissionOverwrites.create(fetchedUser.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true
  });
  
  return interaction.editReply(`✅ Se ha añadido a <@${fetchedUser.id}> a este ticket.`);
};
