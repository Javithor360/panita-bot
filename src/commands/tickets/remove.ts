import { 
  ChatInputCommandInteraction, 
  SlashCommandBuilder, 
  TextChannel,
  PermissionsBitField
} from 'discord.js';
import { prisma } from '../../lib/prisma';

export const data = new SlashCommandBuilder()
  .setName('remove')
  .setDescription('Remueve a un usuario del ticket actual')
  .addUserOption(opt => opt.setName('user').setDescription('Usuario a remover').setRequired(true));

export const metadata = {
  category: 'Tickets',
  description: 'Remueve a un usuario del ticket actual.',
  usage: 'remove <usuario>',
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
    return interaction.editReply('❌ Debes mencionar a un usuario válido. Uso correcto: `!remove <@usuario>`');
  }

  const fetchedUser = await interaction.client.users.fetch(user.id).catch(() => null);
  if (!fetchedUser) {
    return interaction.editReply('❌ No se encontró ningún usuario con ese nombre o ID en Discord.');
  }

  if (fetchedUser.id === ticket.creator_id) {
    return interaction.editReply(`❌ No puedes remover al creador del ticket.`);
  }

  const overwrite = channel.permissionOverwrites.cache.get(fetchedUser.id);
  if (!overwrite || !overwrite.allow.has(PermissionsBitField.Flags.ViewChannel)) {
    return interaction.editReply(`❌ El usuario <@${fetchedUser.id}> no se encuentra en el ticket.`);
  }
  
  await channel.permissionOverwrites.delete(fetchedUser.id);
  
  return interaction.editReply(`✅ Se ha removido a <@${fetchedUser.id}> de este ticket.`);
};
