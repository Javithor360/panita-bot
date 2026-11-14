import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { COLORS, URLS } from '../../config/constants';
import { encodeCustomId } from '../../core/customId';
import { discordTimestamp } from '../../lib/format';
import { resolveEmbedImage } from '../../lib/images';
import { mcHeadUrl } from '../../lib/minecraft';
import type { GalleryPhoto } from '../../services/gallery';

/** Namespace of the gallery's buttons: they are components of the `/gallery` command, wherever the message is sent from. */
export const GALLERY_NAMESPACE = 'gallery';

export const EMPTY_GALLERY = '❌ Actualmente no hay fotos disponibles en la galería.';

const buildPhotoEmbed = (photo: GalleryPhoto, imageUrl: string) => {
  const ign = photo.user?.ign;
  const embed = new EmbedBuilder()
    .setTitle(photo.title || 'Foto de la Galería')
    .setColor(COLORS.green)
    .setImage(imageUrl)
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

/**
 * Message for a photo; its buttons only work for `ownerId`. The image is uploaded with the message
 * (see `resolveEmbedImage`) so it also shows up reliably when the message is edited by a reroll.
 */
export const buildGalleryMessage = async (photo: GalleryPhoto | null, ownerId: string) => {
  if (!photo) return { content: EMPTY_GALLERY, embeds: [], components: [], files: [] };

  const image = await resolveEmbedImage(photo.url, 'gallery');

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encodeCustomId({ namespace: GALLERY_NAMESPACE, action: 'reroll', owner: ownerId }))
      .setEmoji('🎲')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(encodeCustomId({ namespace: GALLERY_NAMESPACE, action: 'link', args: [photo.id], owner: ownerId }))
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    embeds: [buildPhotoEmbed(photo, image.url)],
    components: [row],
    files: image.file ? [image.file] : [],
  };
};
