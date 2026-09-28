import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { ASSETS, CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { serverCommands } from '../../data/serverCommands';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Muestra la lista de comandos útiles en el servidor de Minecraft'),
  meta: {
    category: CATEGORIES.minecraft,
    description: 'Muestra una lista de los comandos disponibles dentro del servidor de Minecraft.',
    aliases: ['comandos', 'cmds'],
  },
  async run(ctx) {
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
  },
});
