import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand, select } from '../../core/command';
import { UserError } from '../../core/errors';
import { buildUserReply } from '../../features/info/replies';
import type { UserView } from '../../features/info/userView';
import { answerFor, finishPick } from '../../features/lookup/command';

/** The flags of `user`, each showing something else instead of the profile. */
const FLAGS = [
  { flag: 'badges', help: 'Muestra las insignias de Discord en lugar del perfil.' },
  { flag: 'cosmetics', help: 'Muestra la decoración, la placa de nombre y la etiqueta de servidor.' },
  { flag: 'permissions', help: 'Muestra lo que puede hacer en este canal.' },
] as const satisfies ReadonlyArray<{ flag: Exclude<UserView, 'profile'>; help: string }>;

const isView = (value: string | undefined): value is Exclude<UserView, 'profile'> => FLAGS.some(({ flag }) => flag === value);

const builder = new SlashCommandBuilder()
  .setName('user')
  .setDescription('Muestra la información de un usuario.')
  .addUserOption(option => option.setName('usuario').setDescription('La persona (por mención). Si no pones a nadie, eres tú.'))
  .addStringOption(option =>
    option.setName('buscar').setDescription('Un nombre, una ID o una mención, también de alguien que no está en el servidor.'),
  );
for (const { flag, help } of FLAGS) builder.addBooleanOption(option => option.setName(flag).setDescription(help));

export default defineCommand({
  data: builder,
  meta: {
    category: CATEGORIES.utility,
    description:
      'Muestra la información de una persona: su cuenta, cuándo entró y en qué puesto, sus roles, sus permisos clave, su estado y su canal de voz si está en uno. Puedes escribir su nombre, mencionarla o poner su ID, '
      + 'incluso si ya no está en el servidor (entonces solo se muestra lo de la cuenta). Si varias personas coinciden con el nombre, te pregunto cuál. '
      + 'Con `--badges` ves sus insignias, con `--cosmetics` su decoración, placa de nombre y etiqueta de servidor, y con `--permissions` lo que puede hacer en este canal. Usa una opción a la vez.',
    aliases: ['userinfo', 'whois', 'u'],
  },
  async run(ctx) {
    const chosen = FLAGS.filter(({ flag }) => ctx.options.getBoolean(flag) === true);
    if (chosen.length > 1) throw new UserError(`usa una sola opción a la vez (${chosen.map(({ flag }) => `\`--${flag}\``).join(', ')}).`);

    const view: UserView = chosen[0]?.flag ?? 'profile';
    await answerFor(ctx, chosen.length > 0 ? [view] : [], userId => buildUserReply(ctx.guild, userId, view, ctx.channel));
  },
  components: {
    pick: select({
      async run(interaction, [flag]) {
        if (!interaction.inCachedGuild()) return;
        const view: UserView = isView(flag) ? flag : 'profile';
        await finishPick(interaction, userId => buildUserReply(interaction.guild, userId, view, interaction.channel));
      },
    }),
  },
});
