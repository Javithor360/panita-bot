import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { discordTimestamp, formatDuration } from '../../lib/format';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('Muestra el tiempo continuo que el bot lleva en línea.'),
  meta: {
    category: CATEGORIES.utility,
    description: 'Muestra el tiempo continuo que el bot lleva en línea.',
    aliases: ['tiempo', 'online'],
  },
  async run(ctx) {
    const uptimeMs = ctx.client.uptime ?? 0;

    const embed = new EmbedBuilder()
      .setColor(0x00a8ff)
      .setTitle('⏱️ Tiempo de Actividad')
      .addFields(
        { name: 'Tiempo continuo', value: `\`${formatDuration(uptimeMs)}\``, inline: true },
        { name: 'Iniciado desde', value: discordTimestamp(Date.now() - uptimeMs, 'R'), inline: true },
      )
      .setTimestamp();

    await ctx.reply({ embeds: [embed] });
  },
});
