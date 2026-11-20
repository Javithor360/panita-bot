import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type BaseMessageOptions } from 'discord.js';
import { dateWithAge } from './dates';
import type { EmojiImages } from './emojiParse';
import { pastel } from './palette';

/**
 * `emoji`: the picture big and nothing else, as Noa did (and NotSoBot), with `--info` adding what is known about it. A
 * custom emoji also gets links to download it; a unicode one is the Twemoji picture.
 */

export interface EmojiViewInput {
  /** The name, or the character itself for a unicode emoji. */
  name: string;
  id: string | null;
  animated: boolean;
  imageUrl: string;
  /** Links to download a custom emoji. */
  links: EmojiImages | null;
  info: boolean;
  /** The server it belongs to, when this bot knows it. */
  serverName: string | null;
  createdAt: Date | null;
  random?: () => number;
}

export const emojiMessage = (input: EmojiViewInput): BaseMessageOptions => {
  const embed = new EmbedBuilder().setColor(pastel(input.random)).setImage(input.imageUrl);

  if (input.info) {
    embed.setTitle(input.id ? `:${input.name}:` : input.name).addFields(
      { name: 'Nombre', value: input.id ? `\`:${input.name}:\`` : 'Emoji de Unicode', inline: true },
      ...(input.id ? [{ name: 'ID', value: `\`${input.id}\``, inline: true }] : []),
      { name: 'Animado', value: input.animated ? 'Sí' : 'No', inline: true },
      ...(input.createdAt ? [{ name: 'Creado', value: dateWithAge(input.createdAt) }] : []),
      ...(input.id ? [{ name: 'Servidor', value: input.serverName ?? 'Otro servidor' }] : []),
    );
  }

  const link = (label: string, url: string) => new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url);
  const buttons = input.links
    ? [link('PNG', input.links.png), link('WebP', input.links.webp), ...(input.links.gif ? [link('GIF', input.links.gif)] : [])]
    : [];

  return {
    embeds: [embed],
    components: buttons.length > 0 ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : [],
  };
};

export type EmojiChange = 'add' | 'remove' | 'rename';

const CHANGE_LABEL: Record<EmojiChange, { title: string; color: number }> = {
  add: { title: 'Emoji añadido', color: 0x57f287 },
  remove: { title: 'Emoji eliminado', color: 0xed4245 },
  rename: { title: 'Emoji renombrado', color: 0xfee75c },
};

/** The entry of the mod log for a change of the server's emojis made with the bot. */
export const emojiLogEmbed = (input: {
  change: EmojiChange;
  moderatorId: string;
  name: string;
  id: string;
  imageUrl: string;
  /** For a rename, what it was called before. */
  previousName?: string;
}): EmbedBuilder => {
  const { title, color } = CHANGE_LABEL[input.change];
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: `[EMOJI] ${title}` })
    .setThumbnail(input.imageUrl)
    .addFields(
      { name: 'Emoji', value: `\`:${input.name}:\` (\`${input.id}\`)`, inline: true },
      { name: 'Moderador', value: `<@${input.moderatorId}>`, inline: true },
      ...(input.previousName ? [{ name: 'Antes', value: `\`:${input.previousName}:\``, inline: true }] : []),
    )
    .setTimestamp();
};
