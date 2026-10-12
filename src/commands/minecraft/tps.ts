import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { bridge } from '../../features/minecraft';
import { tpsEmbed } from '../../features/minecraft/embeds';
import { queryMinecraft } from '../../features/minecraft/queries';

export default defineCommand({
  data: new SlashCommandBuilder().setName('tps').setDescription('Muestra el rendimiento del servidor de Minecraft.'),
  meta: {
    category: CATEGORIES.minecraft,
    description: 'Muestra los ticks por segundo (TPS) del servidor de Minecraft y cuánto tarda en promedio cada tick.',
    aliases: ['rendimiento'],
  },
  async run(ctx) {
    await ctx.defer();
    await ctx.reply({ embeds: [tpsEmbed(await queryMinecraft(bridge, 'tps'))] });
  },
});
