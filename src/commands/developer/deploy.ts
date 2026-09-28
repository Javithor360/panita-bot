import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { getRegistry } from '../../core/registry';
import { deploySlashCommands } from '../../services/commandDeploy';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('deploy')
    .setDescription('Registra (o actualiza) los comandos Slash del bot.'),
  meta: {
    category: CATEGORIES.developer,
    description: 'Registra los comandos Slash en Discord. Los alias no se registran (son solo de prefijo).',
    aliases: ['deploycommands'],
    access: 'developer',
  },
  async run(ctx) {
    await ctx.defer({ ephemeral: true });
    try {
      const { scope, count } = await deploySlashCommands(getRegistry(), ctx.client.application.id);
      await ctx.reply(`✅ Se registraron **${count}** comandos Slash (${scope === 'guild' ? 'en el servidor' : 'globales'}).`);
    } catch (error) {
      console.error('[Deploy] Failed to register slash commands:', error);
      await ctx.reply(`❌ **Error al registrar los comandos:**\n\`\`\`\n${(error as Error).message}\n\`\`\``);
    }
  },
});
