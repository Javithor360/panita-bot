import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, SERVER } from '../../config/constants';
import { defineCommand } from '../../core/command';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Muestra la dirección IP del servidor de Minecraft.')
    .addBooleanOption(option =>
      option.setName('numeric')
        .setDescription('Muestra la IP numérica en lugar del dominio')
        .setRequired(false),
    ),
  meta: {
    category: CATEGORIES.minecraft,
    description: 'Proporciona la IP del servidor de Minecraft (dominio o numérica).',
    aliases: ['server', 'jugar'],
  },
  async run(ctx) {
    const ip = ctx.options.getBoolean('numeric') ? SERVER.numericIp : SERVER.domain;
    await ctx.reply(`🌐 **IP del Servidor:** \`${ip}\``);
  },
});
