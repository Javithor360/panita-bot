import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type BaseMessageOptions } from 'discord.js';
import { URLS } from '../../config/constants';
import { pastel } from './palette';

/**
 * Noa's `avatar` embed: the title "Avatar de <name>" linking to the picture, a "Búscalo en Google" line and the picture
 * big. A member's server avatar is shown when they have one; a person outside the server only has the account's.
 */

export interface AvatarViewInput {
  displayName: string;
  /** The picture to show, 2048 px (animated ones as GIF). */
  imageUrl: string;
  /** The same picture in each format; `gif` only when it is animated. */
  formats: { png: string; jpg: string; webp: string; gif: string | null };
  /** Whether the picture is the one of the server and not of the account. */
  fromServer: boolean;
  /** Whether the person has a server avatar that `--global` is hiding. */
  hasServerAvatar: boolean;
  random?: () => number;
}

export const avatarMessage = (input: AvatarViewInput): BaseMessageOptions => {
  const embed = new EmbedBuilder()
    .setColor(pastel(input.random))
    .setTitle(`Avatar de ${input.displayName}`.slice(0, 256))
    .setURL(input.imageUrl)
    .setDescription(`[Búscalo en Google](${URLS.googleLens(input.imageUrl)})`)
    .setImage(input.imageUrl);

  if (input.fromServer) embed.setFooter({ text: 'Avatar del servidor · usa --global para ver el de la cuenta' });
  else if (input.hasServerAvatar) embed.setFooter({ text: 'Avatar de la cuenta' });

  const link = (label: string, url: string) => new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url);
  const buttons = [
    link('PNG', input.formats.png),
    link('JPG', input.formats.jpg),
    link('WebP', input.formats.webp),
    ...(input.formats.gif ? [link('GIF', input.formats.gif)] : []),
  ];

  return { embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] };
};

export interface PictureViewInput {
  kind: 'banner' | 'decoration';
  displayName: string;
  imageUrl: string;
  /** Links to download it in each format, when there are several. */
  formats: { png: string; jpg: string; webp: string; gif: string | null } | null;
  /** For a banner, whether it is the one of the server and not of the account. */
  fromServer?: boolean;
  random?: () => number;
}

/** The banner or the avatar decoration of a person, big, in the same style as the avatar. */
export const pictureMessage = (input: PictureViewInput): BaseMessageOptions => {
  const label = input.kind === 'banner' ? 'Banner' : 'Decoración';
  const embed = new EmbedBuilder()
    .setColor(pastel(input.random))
    .setTitle(`${label} de ${input.displayName}`.slice(0, 256))
    .setURL(input.imageUrl)
    .setImage(input.imageUrl);
  if (input.kind === 'banner') {
    embed.setFooter({ text: input.fromServer ? 'Banner del servidor · usa --global para ver el de la cuenta' : 'Banner de la cuenta' });
  }

  const link = (text: string, url: string) => new ButtonBuilder().setLabel(text).setStyle(ButtonStyle.Link).setURL(url);
  const buttons = input.formats
    ? [link('PNG', input.formats.png), link('JPG', input.formats.jpg), link('WebP', input.formats.webp), ...(input.formats.gif ? [link('GIF', input.formats.gif)] : [])]
    : [link('Abrir', input.imageUrl)];
  return { embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] };
};
