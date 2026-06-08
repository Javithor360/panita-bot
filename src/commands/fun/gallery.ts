import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction } from 'discord.js';
import { prisma } from '../../lib/prisma';

export const data = new SlashCommandBuilder()
  .setName('gallery')
  .setDescription('Muestra una foto aleatoria de la galería del servidor.');

export const metadata = {
  aliases: ['galeria', 'foto'],
  category: 'Diversión',
  description: 'Muestra una foto aleatoria de la galería, incluyendo detalles y etiquetas.',
  usage: 'gallery',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

const getRandomPhoto = async () => {
  const count = await prisma.photo.count({ where: { enabled: true } });
  
  if (count === 0) return null;

  const randomIndex = Math.floor(Math.random() * count);
  const photo = await prisma.photo.findFirst({
    where: { enabled: true },
    skip: randomIndex,
    include: {
      user: true,
      categories: true
    }
  });

  return photo;
};

const buildGalleryMessage = (photo: any) => {
  if (!photo) {
    return {
      content: '❌ Actualmente no hay fotos disponibles en la galería.',
      embeds: [],
      components: []
    };
  }

  const authorName = photo.user?.ign || 'Anónimo';
  
  const embed = new EmbedBuilder()
    .setTitle(photo.title || 'Foto de la Galería')
    .setColor('#38a169')
    .setImage(photo.url)
    .setAuthor({ name: authorName });

  let descriptionText = '';
  
  if (photo.description) {
    descriptionText += `${photo.description}\n\n`;
  }
  
  if (photo.date_taken || photo.created_at) {
    const dateToUse = photo.date_taken || photo.created_at;
    // Format to short date in Discord (e.g. 10/12/2023) using Unix timestamp
    const unixTimestamp = Math.floor(dateToUse.getTime() / 1000);
    descriptionText += `**Fecha:** <t:${unixTimestamp}:d>\n`;
  }

  if (photo.categories && photo.categories.length > 0) {
    const tagsStr = photo.categories.map((c: any) => `\`${c.name}\``).join(', ');
    descriptionText += `**Tags:** ${tagsStr}\n`;
  }

  if (descriptionText.length > 0) {
    embed.setDescription(descriptionText.trim());
  }

  const rerollButton = new ButtonBuilder()
    .setCustomId('btn_gallery_reroll')
    .setLabel('Aleatoria')
    .setEmoji('🎲')
    .setStyle(ButtonStyle.Secondary);

  const linkButton = new ButtonBuilder()
    .setCustomId(`btn_gallery_link_${photo.id}`)
    .setLabel('Copiar Enlace')
    .setEmoji('🔗')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(rerollButton, linkButton);

  return {
    embeds: [embed],
    components: [row]
  };
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await interaction.deferReply();
  
  try {
    const photo = await getRandomPhoto();
    const messagePayload = buildGalleryMessage(photo);
    
    await interaction.editReply(messagePayload);
  } catch (error) {
    console.error('[Gallery Command Error]', error);
    await interaction.editReply({ content: 'Hubo un error al buscar la foto en la galería.' });
  }
};

export const executeButton = async (interaction: ButtonInteraction) => {
  if (interaction.customId.startsWith('btn_gallery_link_')) {
    const photoId = interaction.customId.replace('btn_gallery_link_', '');
    await interaction.reply({
      content: `Aquí tienes el enlace. Puedes copiarlo seleccionándolo:\n\`https://panita.vercel.app/gallery?photo=${photoId}\``,
      ephemeral: true
    });
    return;
  }

  await interaction.deferUpdate();
  
  try {
    const photo = await getRandomPhoto();
    const messagePayload = buildGalleryMessage(photo);
    
    // Fallback if no photos
    if (!photo) {
      await interaction.editReply({ content: '❌ Actualmente no hay fotos disponibles en la galería.', embeds: [], components: [] });
      return;
    }
    
    await interaction.editReply(messagePayload);
  } catch (error) {
    console.error('[Gallery Button Error]', error);
    await interaction.followUp({ content: 'Hubo un error al cargar otra foto.', ephemeral: true });
  }
};
