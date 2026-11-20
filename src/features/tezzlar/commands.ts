import { EmbedBuilder } from 'discord.js';
import { ASSETS } from '../../config/constants';
import { serverCommands } from '../../data/serverCommands';
import type { CommandContext } from '../../core/context';

export const run = async (ctx: CommandContext): Promise<void> => {
  const embed = new EmbedBuilder()
    .setTitle('📌 Comandos Útiles del Servidor')
    .setColor(0x00bfff)
    .setThumbnail(ASSETS.tezzlarHearts)
    .setDescription(
      serverCommands.length === 0
        ? 'Aún no hay comandos registrados.'
        : serverCommands.map(c => `→ \`${c.command}\` - ${c.description}`).join('\n\n'),
    );

  await ctx.send({ embeds: [embed] });
};
