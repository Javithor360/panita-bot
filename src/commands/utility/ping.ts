import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';

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
    const gateway = ctx.client.ws.ping >= 0 ? ` · Gateway: \`${ctx.client.ws.ping}ms\`` : '';
    await ctx.edit(`Pong! Latencia: \`${latency}ms\`${gateway}`);
  },
});
