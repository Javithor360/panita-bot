import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type BaseMessageOptions } from 'discord.js';
import { dateWithAge } from './dates';
import { pastel } from './palette';

/**
 * `sticker`: the picture big and nothing else, like `emoji`, with `--info` adding what is known about it. A Lottie sticker
 * has no picture (its file is a JSON animation), so it always shows its information and says why.
 */

export interface StickerViewInput {
  name: string;
  id: string;
  description: string | null;
  tags: string | null;
  /** `PNG`, `APNG`, `Lottie` or `GIF`. */
  format: string;
  /** The picture, or `null` for a Lottie sticker. */
  imageUrl: string | null;
  /** The server it belongs to when the bot knows it; `null` for another server. */
  serverName: string | null;
  /** A sticker of Discord's own packs, which belongs to no server. */
  standard: boolean;
  createdAt: Date;
  info: boolean;
  random?: () => number;
}

export const LOTTIE_NOTE = 'Es un sticker Lottie (una animación en JSON): Discord no da una imagen que mostrar.';

export const stickerMessage = (input: StickerViewInput): BaseMessageOptions => {
  const embed = new EmbedBuilder().setColor(pastel(input.random));
  if (input.imageUrl) embed.setImage(input.imageUrl);

  if (input.info || !input.imageUrl) {
    embed.setTitle(input.name.slice(0, 256)).addFields(
      { name: 'ID', value: `\`${input.id}\``, inline: true },
      { name: 'Formato', value: input.format, inline: true },
      { name: 'Origen', value: input.standard ? 'Paquete de Discord' : input.serverName ?? 'Otro servidor', inline: true },
      ...(input.tags ? [{ name: 'Emoji', value: input.tags.slice(0, 256) }] : []),
      ...(input.description ? [{ name: 'Descripción', value: input.description.slice(0, 1000) }] : []),
      { name: 'Creado', value: dateWithAge(input.createdAt) },
    );
  }
  if (!input.imageUrl) embed.setDescription(LOTTIE_NOTE);

  return {
    embeds: [embed],
    components: input.imageUrl
      ? [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel('Abrir imagen').setStyle(ButtonStyle.Link).setURL(input.imageUrl))]
      : [],
  };
};
