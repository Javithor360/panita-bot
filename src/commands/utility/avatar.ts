import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand, select } from '../../core/command';
import { buildAvatarReply } from '../../features/info/replies';
import { answerFor, finishPick } from '../../features/lookup/command';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Muestra la foto de perfil de un usuario en grande.')
    .addUserOption(option => option.setName('usuario').setDescription('La persona (por mención). Si no pones a nadie, eres tú.'))
    .addStringOption(option =>
      option.setName('buscar').setDescription('Un nombre, una ID o una mención, también de alguien que no está en el servidor.'),
    )
    .addBooleanOption(option => option.setName('global').setDescription('Muestra el avatar de la cuenta y no el del servidor.')),
  meta: {
    category: CATEGORIES.utility,
    description:
      'Muestra la foto de perfil de una persona en grande, con enlaces para descargarla y para buscarla en Google. Si tiene un avatar propio en este servidor se muestra ese; con `--global` ves el de su cuenta. '
      + 'Puedes escribir su nombre, mencionarla o poner su ID, incluso si no está en el servidor.',
    aliases: ['av', 'pfp', 'picture'],
  },
  async run(ctx) {
    const global = ctx.options.getBoolean('global') === true;
    await answerFor(ctx, global ? ['global'] : [], userId => buildAvatarReply(ctx.guild, userId, global));
  },
  components: {
    pick: select({
      async run(interaction, [flag]) {
        if (!interaction.inCachedGuild()) return;
        await finishPick(interaction, userId => buildAvatarReply(interaction.guild, userId, flag === 'global'));
      },
    }),
  },
});
