import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand, select } from '../../core/command';
import { buildUserReply } from '../../features/info/replies';
import { answerFor, finishPick } from '../../features/lookup/command';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('Muestra la información de un usuario.')
    .addUserOption(option => option.setName('usuario').setDescription('La persona (por mención). Si no pones a nadie, eres tú.'))
    .addStringOption(option =>
      option.setName('buscar').setDescription('Un nombre, una ID o una mención, también de alguien que no está en el servidor.'),
    )
    .addBooleanOption(option => option.setName('badges').setDescription('Muestra las insignias de Discord en lugar del perfil.')),
  meta: {
    category: CATEGORIES.utility,
    description:
      'Muestra la información de una persona: su cuenta, cuándo entró, sus roles, sus permisos clave y su estado. Puedes escribir su nombre, mencionarla o poner su ID, incluso si ya no está en el servidor '
      + '(entonces solo se muestra lo de la cuenta). Si varias personas coinciden con el nombre, te pregunto cuál. Con `--badges` muestra las insignias de Discord.',
    aliases: ['userinfo', 'whois', 'u'],
  },
  async run(ctx) {
    const badges = ctx.options.getBoolean('badges') === true;
    await answerFor(ctx, badges ? ['badges'] : [], userId => buildUserReply(ctx.guild, userId, badges));
  },
  components: {
    pick: select({
      async run(interaction, [flag]) {
        if (!interaction.inCachedGuild()) return;
        await finishPick(interaction, userId => buildUserReply(interaction.guild, userId, flag === 'badges'));
      },
    }),
  },
});
