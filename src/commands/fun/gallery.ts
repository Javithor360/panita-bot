import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, COLORS, URLS } from '../../config/constants';
import { button, defineCommand } from '../../core/command';
import { encodeCustomId } from '../../core/customId';
import { discordTimestamp } from '../../lib/format';
import { embedImageUrl } from '../../lib/images';
import { mcHeadUrl } from '../../lib/minecraft';
import { getRandomPhoto, type GalleryPhoto } from '../../services/gallery';

const NAME = 'gallery';
const EMPTY_GALLERY = '❌ Actualmente no hay fotos disponibles en la galería.';

const buildPhotoEmbed = (photo: GalleryPhoto) => {
  const ign = photo.user?.ign;
  const embed = new EmbedBuilder()
    .setTitle(photo.title || 'Foto de la Galería')
    .setColor(COLORS.green)
    .setImage(embedImageUrl(photo.url))
    .setAuthor(ign ? { name: ign, iconURL: mcHeadUrl(ign) } : { name: 'Anónimo' });

  const lines: string[] = [];
  if (photo.description) lines.push(`${photo.description}\n`);
  lines.push(`**Publicación:** ${discordTimestamp(photo.date_taken ?? photo.created_at, 'd')}`);
  if (photo.categories.length > 0) {
    lines.push(`**Categorías:** ${photo.categories.map(c => `\`${c.name}\``).join(', ')}`);
  }
  embed.setDescription(lines.join('\n'));

  if (photo.edition) {
    embed.setFooter({ text: photo.edition.name, iconURL: URLS.editionIcon(photo.edition.id) });
  }
  return embed;
};

/** Message for a photo; its buttons only work for `ownerId`. */
const buildGalleryMessage = (photo: GalleryPhoto | null, ownerId: string) => {
  if (!photo) return { content: EMPTY_GALLERY, embeds: [], components: [] };

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encodeCustomId({ namespace: NAME, action: 'reroll', owner: ownerId }))
      .setEmoji('🎲')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(encodeCustomId({ namespace: NAME, action: 'link', args: [photo.id], owner: ownerId }))
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [buildPhotoEmbed(photo)], components: [row] };
};

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName(NAME)
    .setDescription('Muestra una foto aleatoria de la galería del servidor.'),
  meta: {
    category: CATEGORIES.fun,
    description: 'Muestra una foto aleatoria de la galería, incluyendo detalles y etiquetas.',
    aliases: ['galeria', 'foto'],
  },
  async run(ctx) {
    await ctx.defer();
    const photo = await getRandomPhoto();
    await ctx.reply(buildGalleryMessage(photo, ctx.user.id));
  },
  components: {
    reroll: button({
      async run(interaction) {
        await interaction.deferUpdate();
        const photo = await getRandomPhoto();
        await interaction.editReply(buildGalleryMessage(photo, interaction.user.id));
      },
    }),
    link: button({
      async run(interaction, [photoId]) {
        await interaction.reply({
          content: `Aquí tienes el enlace. Puedes copiarlo seleccionándolo:\n<${URLS.gallery(photoId)}>`,
          flags: MessageFlags.Ephemeral,
        });
      },
    }),
  },
});
