import { EmbedBuilder, type BaseMessageOptions } from 'discord.js';
import { COLORS } from '../../config/constants';

/** The embed description holds up to 4096 characters; the code fence takes a few. */
const MAX_TEXT = 3800;

/** Text that could close the code block early is broken with an invisible character. */
const fenceSafe = (text: string) => text.replace(/```/g, '`​``');

export const ocrMessage = (text: string): BaseMessageOptions => {
  const truncated = text.length > MAX_TEXT;
  const shown = truncated ? `${text.slice(0, MAX_TEXT).trimEnd()}…` : text;
  const embed = new EmbedBuilder()
    .setColor(COLORS.blurple)
    .setTitle('Texto reconocido')
    .setDescription(`\`\`\`\n${fenceSafe(shown)}\n\`\`\``)
    .setFooter({ text: truncated ? 'Reconocimiento óptico de caracteres · el texto se cortó por ser muy largo' : 'Reconocimiento óptico de caracteres' });
  // Text inside an image must never ping anyone
  return { embeds: [embed], allowedMentions: { parse: [] } };
};
