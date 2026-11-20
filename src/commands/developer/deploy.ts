import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { getRegistry } from '../../core/registry';
import { deploySlashCommands } from '../../services/commandDeploy';
import { fail, ok } from '../../lib/voice';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('deploy')
    .setDescription('Registra (o actualiza) los comandos Slash del bot.')
    .addBooleanOption(option =>
      option.setName('guild')
        .setDescription('Registrar solo en este servidor (instantáneo, para pruebas) en lugar de globalmente.')
        .setRequired(false),
    ),
  meta: {
    category: CATEGORIES.developer,
    description: 'Registra los comandos Slash en Discord (globalmente por defecto; `--guild` para solo este servidor). Los alias no se registran.',
    aliases: ['deploycommands'],
    access: 'developer',
  },
  async run(ctx) {
    await ctx.defer({ ephemeral: true });
    const scope = ctx.options.getBoolean('guild') ? 'guild' : 'global';
    try {
      const { count } = await deploySlashCommands(getRegistry(), { scope, applicationId: ctx.client.application.id });
      await ctx.reply(ok(ctx.member, `se registraron **${count}** comandos Slash (${scope === 'guild' ? 'solo en este servidor' : 'globales'}).`));
    } catch (error) {
      console.error('[Deploy] Failed to register slash commands:', error);
      await ctx.reply(`${fail(ctx.member, 'error al registrar los comandos:')}\n\`\`\`\n${(error as Error).message}\n\`\`\``);
    }
  },
});
