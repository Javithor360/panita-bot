import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { confirmationMessage, confirmCode, isLoginCode, LOGIN_MESSAGES, MAX_CODE_LENGTH } from '../../features/login/confirm';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('confirm')
    .setDescription('Confirma un inicio de sesión con el código que muestra la web o el launcher.')
    .addStringOption(option =>
      option
        .setName('code')
        .setDescription('El código de 4 dígitos de la web, o el del launcher (XXXX-YYYY-ZZZZ).')
        .setRequired(true)
        .setMinLength(4)
        .setMaxLength(MAX_CODE_LENGTH),
    ),
  meta: {
    category: CATEGORIES.general,
    description: 'Confirma el inicio de sesión que empezaste en la web (código de 4 dígitos) o en el launcher (código tipo `XXXX-YYYY-ZZZZ`). La respuesta solo la ves tú. También puedes enviarme el código por mensaje directo. Confirma solo inicios de sesión que tú mismo empezaste.',
    // Replies are only private on slash; a code must never be typed in a public prefix message
    slashOnly: true,
  },
  async run(ctx) {
    // Private from the first moment: nobody else sees the command or its answer
    await ctx.defer({ ephemeral: true });

    const code = ctx.options.getString('code', true).trim();
    if (!isLoginCode(code)) return ctx.reply({ content: LOGIN_MESSAGES.badFormat, ephemeral: true });

    const outcome = await confirmCode(ctx.user.id, code);
    // The device text is typed by the client: nothing in the answer may ping
    await ctx.reply({ content: confirmationMessage(outcome), allowedMentions: { parse: [] }, ephemeral: true });
  },
});
