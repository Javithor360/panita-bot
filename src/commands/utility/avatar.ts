import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand, select } from '../../core/command';
import { UserError } from '../../core/errors';
import { buildAvatarReply, buildPictureReply } from '../../features/info/replies';
import { answerFor, finishPick } from '../../features/lookup/command';

type Picture = 'avatar' | 'banner' | 'decoration';

/** In the custom id of the menu: what to show and whether `--global` was given (`-` when it was not). */
const GLOBAL = 'global';
const NOT_GLOBAL = '-';

const render = (guild: Parameters<typeof buildAvatarReply>[0], userId: string, picture: Picture, global: boolean) =>
  picture === 'avatar' ? buildAvatarReply(guild, userId, global) : buildPictureReply(guild, userId, picture, global);

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Muestra la foto de perfil de un usuario en grande.')
    .addUserOption(option => option.setName('usuario').setDescription('La persona (por mención). Si no pones a nadie, eres tú.'))
    .addStringOption(option =>
      option.setName('buscar').setDescription('Un nombre, una ID o una mención, también de alguien que no está en el servidor.'),
    )
    .addBooleanOption(option => option.setName('global').setDescription('Muestra el avatar o el banner de la cuenta y no el del servidor.'))
    .addBooleanOption(option => option.setName('banner').setDescription('Muestra su banner en lugar del avatar.'))
    .addBooleanOption(option => option.setName('decoration').setDescription('Muestra su decoración de avatar en lugar del avatar.')),
  meta: {
    category: CATEGORIES.utility,
    description:
      'Muestra la foto de perfil de una persona en grande, con enlaces para descargarla y para buscarla en Google. Si tiene un avatar propio en este servidor se muestra ese; con `--global` ves el de su cuenta. '
      + 'Con `--banner` ves su banner y con `--decoration` su decoración de avatar. '
      + 'Puedes escribir su nombre, mencionarla o poner su ID, incluso si no está en el servidor.',
    aliases: ['av', 'pfp', 'picture'],
  },
  async run(ctx) {
    const banner = ctx.options.getBoolean('banner') === true;
    const decoration = ctx.options.getBoolean('decoration') === true;
    if (banner && decoration) throw new UserError('usa una sola opción a la vez (`--banner`, `--decoration`).');

    const picture: Picture = banner ? 'banner' : decoration ? 'decoration' : 'avatar';
    const global = ctx.options.getBoolean('global') === true;
    await answerFor(ctx, [picture, global ? GLOBAL : NOT_GLOBAL], userId => render(ctx.guild, userId, picture, global));
  },
  components: {
    pick: select({
      async run(interaction, [picture, global]) {
        if (!interaction.inCachedGuild()) return;
        const chosen: Picture = picture === 'banner' || picture === 'decoration' ? picture : 'avatar';
        await finishPick(interaction, userId => render(interaction.guild, userId, chosen, global === GLOBAL));
      },
    }),
  },
});
