import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { button, defineCommand, select } from '../../core/command';
import { SESSION_MESSAGES, buildSessionsView, CLOSE_ALL_ACTION, CLOSE_ONE_ACTION } from '../../features/login/sessionsView';
import { listSessions, revokeAllSessions, revokeSession } from '../../services/sessions';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('sessions')
    .setDescription('Mira tus sesiones abiertas en la web y el launcher, y ciérralas.'),
  meta: {
    category: CATEGORIES.general,
    description: 'Lista las sesiones abiertas de tu cuenta (web y launcher) y te deja cerrar una o todas. La respuesta solo la ves tú. Si ves una que no reconoces, ciérrala.',
    // Shows personal data, and replies are only private on slash
    slashOnly: true,
  },
  async run(ctx) {
    await ctx.defer({ ephemeral: true });

    const sessions = await listSessions(ctx.user.id);
    await ctx.reply({ ...buildSessionsView(sessions, ctx.user.id), ephemeral: true });
  },
  components: {
    [CLOSE_ONE_ACTION]: select({
      async run(interaction) {
        const [sessionId] = interaction.values;
        await interaction.deferUpdate();

        // Read first to be able to say which one was closed
        const label = (await listSessions(interaction.user.id)).find(session => session.id === sessionId)?.label;
        const closed = await revokeSession(interaction.user.id, sessionId);
        const note = closed && label ? SESSION_MESSAGES.closed(label) : SESSION_MESSAGES.alreadyClosed;

        const sessions = await listSessions(interaction.user.id);
        await interaction.editReply(buildSessionsView(sessions, interaction.user.id, note));
      },
    }),
    [CLOSE_ALL_ACTION]: button({
      async run(interaction) {
        await interaction.deferUpdate();

        const count = await revokeAllSessions(interaction.user.id);
        const note = count > 0 ? SESSION_MESSAGES.closedAll(count) : SESSION_MESSAGES.noneToClose;

        const sessions = await listSessions(interaction.user.id);
        await interaction.editReply(buildSessionsView(sessions, interaction.user.id, note));
      },
    }),
  },
});
