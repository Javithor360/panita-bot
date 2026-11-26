import path from 'node:path';
import { AttachmentBuilder, type EmbedAuthorOptions, type EmbedBuilder } from 'discord.js';
import { PREFIX } from '../../config/constants';
import { emojiUrl } from '../../config/emojis';

/** What a subcommand answers: embeds, and the pictures of `assets/enriquecraft/` they show. */
export interface View {
  embeds: EmbedBuilder[];
  files?: AttachmentBuilder[];
}

export const COLOR = 0xe8a33d;

/** `assets/enriquecraft/`: the source and the build are both three folders below the project. */
export const IMAGES_DIR = path.resolve(__dirname, '../../../assets/enriquecraft');

/** The emojis of the titles, as the document of the server uses them. */
export const ICONS = {
  info: '⚖️',
  rules: '📜',
  pranks: '🤡',
  features: '📌',
  join: '🎮',
  bullet: '▫️',
  level: '🫟',
  warning: '⚠️',
} as const;

/** The first line of every embed. */
export const author = (section: string): EmbedAuthorOptions => ({ name: `Enriquecraft · ${section}`, iconURL: emojiUrl('llamushroom') });

/** A field value that Discord shows as a quote. */
export const quote = (text: string): string => `>>> ${text}`;

/** `➔ Title` in bold, and the text under it. */
export const arrow = (title: string, text: string): string => `**➔ ${title}**\n${text}`;

/** The name of a command as a member types it: `!enriquecraft rules`. */
export const command = (subcommand: string): string => `\`${PREFIX}enriquecraft ${subcommand}\``;

export const imageOf = (name: string): AttachmentBuilder => new AttachmentBuilder(path.join(IMAGES_DIR, name), { name });
