import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { confirmationMessage, confirmCode, isLoginCode, LOGIN_MESSAGES } from '../../features/login/confirm';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('confirm')
    .setDescription('Confirma un inicio de sesión con el código de 4 dígitos que muestra la app.')
    .addStringOption(option =>
      option
        .setName('code')
        .setDescription('El código de 4 dígitos que ves en la web o en el launcher.')
        .setRequired(true)
        .setMinLength(4)
        .setMaxLength(4),
    ),
  meta: {
    category: CATEGORIES.general,
    description: 'Confirma el inicio de sesión que empezaste en la web o en el launcher con el código de 4 dígitos que te muestran. La respuesta solo la ves tú. También puedes enviarme el código por mensaje directo. Confirma solo inicios de sesión que tú mismo empezaste.',
    // Replies are only private on slash; a code must never be typed in a public prefix message
    slashOnly: true,
  },
  async run(ctx) {
    // Private from the first moment: nobody else sees the command or its answer
    await ctx.defer({ ephemeral: true });

    const code = ctx.options.getString('code', true).trim();
    if (!isLoginCode(code)) return ctx.reply({ content: LOGIN_MESSAGES.badFormat, ephemeral: true });

    const outcome = await confirmCode(ctx.user.id, code);
    await ctx.reply({ content: confirmationMessage(outcome), ephemeral: true });
  },
});
