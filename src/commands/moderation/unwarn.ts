import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, MODERATION } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { UserError } from '../../core/errors';
import { announce, guardTarget, memberOf, refuse, subjectOf } from '../../features/moderation/actions';
import { caseEmbed, confirmation } from '../../features/moderation/messages';
import { listWarnings, revokeWarning, WarningAlreadyRevokedError, WarningNotFoundError } from '../../services/moderation';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('unwarn')
    .setDescription('Quita una advertencia a un miembro.')
    .addUserOption(option => option.setName('usuario').setDescription('El miembro al que se le quita la advertencia.').setRequired(true))
    .addIntegerOption(option =>
      option.setName('numero').setDescription('Cuál quitar, según el orden de /warns (1 es la más reciente). Por defecto, la más reciente.').setMinValue(1),
    )
    .addStringOption(option => option.setName('razon').setDescription('La razón para quitarla.')),
  meta: {
    category: CATEGORIES.moderation,
    description:
      'Quita una advertencia activa a un miembro, la más reciente o la que indiques con el número que muestra `warns`. Queda en el historial como revocada. '
      + 'En prefijo, un número suelto antes de la razón se toma como el número de la advertencia.',
    access: 'staff',
  },
  async run(ctx) {
    const user = ctx.options.getUser('usuario', true);
    const position = ctx.options.getInteger('numero') ?? 1;
    const reason = ctx.options.getString('razon');

    guardTarget(ctx, user, await memberOf(ctx, user), 'none');

    await ctx.defer();
    const { warnings, total } = await listWarnings(user.id, { active: true });
    if (warnings.length === 0) refuse('noWarns');

    const warning = warnings[position - 1];
    if (!warning) {
      throw new UserError(`Esa persona solo tiene ${total} advertencia${total === 1 ? '' : 's'} activa${total === 1 ? '' : 's'}.`);
    }

    try {
      await revokeWarning(warning.id, ctx.user.id, reason ?? undefined);
    } catch (error) {
      if (error instanceof WarningAlreadyRevokedError || error instanceof WarningNotFoundError) {
        throw new UserError(`Esa advertencia ya había sido quitada, vuelve a revisar con \`warns\`.`);
      }
      throw error;
    }

    const embed = caseEmbed({
      action: 'unwarn',
      subject: subjectOf(user),
      moderatorId: ctx.user.id,
      reason,
      extra: [{ name: 'Advertencia quitada', value: warning.reason.slice(0, 200) }],
      footer: `Advertencias activas: ${total - 1}/${MODERATION.warnKickAt}`,
    });
    await announce(ctx, { text: confirmation(ctx.member, 'unwarn', user.username), embeds: [embed] });
  },
});
