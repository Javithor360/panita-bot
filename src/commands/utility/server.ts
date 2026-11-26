import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { button, defineCommand, select } from '../../core/command';
import { encodeCustomId } from '../../core/customId';
import { UserError } from '../../core/errors';
import { collectExtra, collectServerData } from '../../features/info/serverData';
import { SERVER_FLAGS, SERVER_VIEWS, serverMessage, type ServerView } from '../../features/info/serverView';

const builder = new SlashCommandBuilder().setName('server').setDescription('Muestra la información del servidor.');
for (const { flag, help } of SERVER_FLAGS) builder.addBooleanOption(option => option.setName(flag).setDescription(help));

const isView = (value: string | undefined): value is ServerView => !!value && (SERVER_VIEWS as readonly string[]).includes(value);

/** The custom id of the menu and of the buttons of whoever ran the command, which only they can press. */
const menuIdOf = (userId: string) => encodeCustomId({ namespace: 'server', action: 'view', owner: userId });
const pageIdOf = (userId: string) => (target: ServerView, page: number, slot: string) =>
  encodeCustomId({ namespace: 'server', action: 'page', args: [target, String(page), slot], owner: userId });

export default defineCommand({
  data: builder,
  meta: {
    category: CATEGORIES.utility,
    description:
      'Muestra la información del servidor: miembros, canales, extras y mejoras. Con una opción ves otra cosa: `--roles` los roles, `--emojis` los emojis, '
      + '`--channels` los canales que tú puedes ver, `--activity` la actividad (voz, hilos, miembros nuevos y antiguos), `--community` la configuración de comunidad, `--stickers` los stickers, `--events` los eventos, `--sounds` los sonidos, `--boost` las mejoras (con la etiqueta y los impulsores), `--icon` el ícono y `--banner` el banner. Usa una opción a la vez.',
    aliases: ['serverinfo', 'sinfo', 'guild'],
  },
  async run(ctx) {
    const chosen = SERVER_FLAGS.filter(({ flag }) => ctx.options.getBoolean(flag) === true);
    if (chosen.length > 1) {
      throw new UserError(`usa una sola opción a la vez (${chosen.map(({ flag }) => `\`--${flag}\``).join(', ')}).`);
    }
    const view = chosen[0]?.flag ?? 'info';

    await ctx.defer();
    const data = await collectServerData(ctx.guild, ctx.member);
    const extra = await collectExtra(ctx.guild, view);
    await ctx.reply(serverMessage(view, data, 0, pageIdOf(ctx.user.id), undefined, extra, menuIdOf(ctx.user.id)));
  },
  components: {
    // The page is in the custom id, and the list is read again from the live server for whoever pressed
    page: button({
      async run(interaction, [view, page]) {
        if (!interaction.inCachedGuild()) return;
        if (!isView(view)) throw new UserError('esta vista ya no existe.');

        await interaction.deferUpdate();
        const data = await collectServerData(interaction.guild, interaction.member);
        const extra = await collectExtra(interaction.guild, view);
        await interaction.editReply(serverMessage(view, data, Number(page), pageIdOf(interaction.user.id), undefined, extra, menuIdOf(interaction.user.id)));
      },
    }),
    // The menu: another view of the same server, from its first page
    view: select({
      async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const view = interaction.values[0];
        if (!isView(view)) throw new UserError('esta vista ya no existe.');

        await interaction.deferUpdate();
        const data = await collectServerData(interaction.guild, interaction.member);
        const extra = await collectExtra(interaction.guild, view);
        await interaction.editReply(serverMessage(view, data, 0, pageIdOf(interaction.user.id), undefined, extra, menuIdOf(interaction.user.id)));
      },
    }),
  },
});
