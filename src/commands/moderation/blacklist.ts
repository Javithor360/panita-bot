import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, COLORS, EMOJIS } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { UserError } from '../../core/errors';
import { announce, guardTarget, memberOf, refuse, subjectOf } from '../../features/moderation/actions';
import { blacklistLine } from '../../features/moderation/blacklist';
import { splitTimeAndReason } from '../../features/moderation/duration';
import { caseEmbed, confirmation } from '../../features/moderation/messages';
import { discordTimestamp } from '../../lib/format';
import {
  addToBlacklist,
  AlreadyBlacklistedError,
  BlacklistEntryAlreadyRevokedError,
  BlacklistEntryNotFoundError,
  findActiveEntry,
  listBlacklist,
  removeFromBlacklist,
} from '../../services/blacklist';

const SHOWN = 15;

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Lista negra del bot.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Impide que un usuario use el bot.')
        .addUserOption(option => option.setName('usuario').setDescription('El usuario que no podrá usar el bot.').setRequired(true))
        .addStringOption(option => option.setName('tiempo').setDescription('Cuánto dura: 30m, 2h, 7d, 1w (sin tiempo es permanente).'))
        .addStringOption(option => option.setName('razon').setDescription('La razón (obligatoria).')),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Quita a un usuario de la lista negra.')
        .addUserOption(option => option.setName('usuario').setDescription('El usuario que vuelve a poder usar el bot.').setRequired(true))
        .addStringOption(option => option.setName('razon').setDescription('La razón para quitarlo.')),
    )
    .addSubcommand(subcommand => subcommand.setName('list').setDescription('Muestra a quienes están en la lista negra.')),
  meta: {
    category: CATEGORIES.moderation,
    description:
      'Lista negra del bot: quien está en ella no puede usar comandos, tickets ni tags, pero sigue en el servidor y conserva su cuenta de la web. '
      + 'Sin tiempo, la entrada es permanente. Quitarla la deja en el historial. El Staff nunca queda bloqueado. '
      + 'En prefijo, si la primera palabra después del usuario no es un tiempo, todo es la razón.',
    aliases: ['bl'],
    access: 'staff',
  },
  async run(ctx) {
    const subcommand = ctx.options.getSubcommand();

    if (subcommand === 'list') {
      await ctx.defer({ ephemeral: true });
      const { entries, total } = await listBlacklist({ active: true });
      const hidden = total - Math.min(entries.length, SHOWN);
      const embed = new EmbedBuilder()
        .setColor(COLORS.blurple)
        .setAuthor({ name: 'Lista negra del bot' })
        .setDescription(
          entries.length > 0
            ? `${entries.slice(0, SHOWN).map(blacklistLine).join('\n')}${hidden > 0 ? `\n… y ${hidden} más antiguas.` : ''}`
            : 'No hay nadie en la lista negra.',
        )
        .setFooter({ text: `Activas: ${total}` });
      return ctx.reply({ content: `${EMOJIS.stats} Lista negra`, embeds: [embed], allowedMentions: { parse: [] }, ephemeral: true });
    }

    const user = ctx.options.getUser('usuario', true);

    if (subcommand === 'add') {
      const { durationMs, reason } = splitTimeAndReason(ctx.options.getString('tiempo'), ctx.options.getString('razon'));
      if (!reason) throw new UserError('Debes indicar una razón.');

      guardTarget(ctx, user, await memberOf(ctx, user), 'none');

      await ctx.defer();
      const expiresAt = durationMs === null ? undefined : new Date(Date.now() + durationMs);
      try {
        await addToBlacklist({ userId: user.id, moderatorId: ctx.user.id, reason, expiresAt });
      } catch (error) {
        if (error instanceof AlreadyBlacklistedError) throw new UserError('Esa persona ya está en la lista negra.');
        throw error;
      }

      const embed = caseEmbed({
        action: 'blacklist',
        subject: subjectOf(user),
        moderatorId: ctx.user.id,
        reason,
        extra: [{ name: 'Termina', value: expiresAt ? discordTimestamp(expiresAt, 'R') : 'Nunca', inline: true }],
      });
      return announce(ctx, { text: confirmation(ctx.member, 'blacklist', user.username), embeds: [embed] });
    }

    // remove
    await ctx.defer();
    const entry = await findActiveEntry(user.id);
    if (!entry) refuse('notBlacklisted');

    const reason = ctx.options.getString('razon');
    try {
      await removeFromBlacklist(entry, ctx.user.id, reason ?? undefined);
    } catch (error) {
      if (error instanceof BlacklistEntryAlreadyRevokedError || error instanceof BlacklistEntryNotFoundError) {
        throw new UserError('Esa entrada ya había sido quitada, vuelve a revisar con `blacklist list`.');
      }
      throw error;
    }

    const embed = caseEmbed({
      action: 'unblacklist',
      subject: subjectOf(user),
      moderatorId: ctx.user.id,
      reason,
      extra: [{ name: 'Razón del bloqueo', value: entry.reason.slice(0, 200) }],
    });
    await announce(ctx, { text: confirmation(ctx.member, 'unblacklist', user.username), embeds: [embed] });
  },
});
