import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { bridge } from '../../features/minecraft';
import { playerListEmbed } from '../../features/minecraft/embeds';
import { queryMinecraft } from '../../features/minecraft/queries';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('playerlist')
    .setDescription('Muestra los jugadores conectados al servidor de Minecraft.'),
  meta: {
    category: CATEGORIES.minecraft,
    description: 'Muestra quién está conectado ahora al servidor de Minecraft, con el apodo que cada jugador usa en el chat.',
    aliases: ['jugadores', 'conectados'],
  },
  async run(ctx) {
    // The server may take a few seconds to answer, longer than a slash command can wait
    await ctx.defer();
    await ctx.reply({ embeds: [playerListEmbed(await queryMinecraft(bridge, 'playerlist'))] });
  },
});
