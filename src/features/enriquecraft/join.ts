import { EmbedBuilder } from 'discord.js';
import type { CommandContext } from '../../core/context';
import { join } from '../../data/enriquecraft';
import { author, COLOR, ICONS, quote, type View } from './look';

export const view = (): View => ({
  embeds: [
    new EmbedBuilder()
      .setColor(COLOR)
      .setAuthor(author('Cómo entrar'))
      .setTitle(`${ICONS.join} CÓMO ENTRAR A ENRIQUECRAFT`)
      .addFields(
        { name: 'IP 🌐', value: `\`${join.ip}\``, inline: true },
        { name: 'VERSIÓN 🧱', value: `Minecraft **${join.version}**`, inline: true },
        { name: 'PASOS 📋', value: quote(join.steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n')) },
      ),
  ],
});

export const run = async (ctx: CommandContext): Promise<void> => {
  await ctx.reply(view());
};
