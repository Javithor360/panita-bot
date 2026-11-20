import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { ok } from '../../lib/voice';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Muestra la latencia del bot.'),
  meta: {
    category: CATEGORIES.utility,
    description: 'Calcula la latencia y el tiempo de respuesta del bot.',
    aliases: ['latencia'],
  },
  async run(ctx) {
    await ctx.reply('Calculando...');
    const reply = await ctx.fetchReply();
    const latency = reply.createdTimestamp - ctx.createdTimestamp;
    // The gateway ping is -1 until the first heartbeat has been answered
    const api = ctx.client.ws.ping >= 0 ? `**API**: ${ctx.client.ws.ping}ms\n` : '';
    await ctx.edit(`${ok(ctx.member, 'latencias de Panita')}\n${api}**Bot**: ${latency}ms`);
  },
});
