import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, EMOJIS, MODERATION } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { UserError } from '../../core/errors';
import { announce, auditReason, discordAction, guardTarget, memberOf, notifyMember, refuse, subjectOf } from '../../features/moderation/actions';
import { isValidTimeout, splitTimeAndReason } from '../../features/moderation/duration';
import { caseEmbed, confirmation, dmEmbed } from '../../features/moderation/messages';
import { botActions } from '../../features/moderation/recent';
import { discordTimestamp, formatDuration } from '../../lib/format';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silencia a un miembro por un tiempo.')
    .addUserOption(option => option.setName('usuario').setDescription('El miembro que será silenciado.').setRequired(true))
    .addStringOption(option => option.setName('tiempo').setDescription('Cuánto dura: 30m, 2h, 1d, 1h30m (máximo 28d). Por defecto, 1h.'))
    .addStringOption(option => option.setName('razon').setDescription('La razón del silencio.')),
  meta: {
    category: CATEGORIES.moderation,
    description:
      'Silencia a un miembro con el tiempo de espera de Discord: no puede escribir, reaccionar ni hablar hasta que termine. Dura 1 hora si no indicas el tiempo y hasta 28 días. '
      + 'En prefijo, si la primera palabra después del usuario no es un tiempo, todo es la razón.',
    aliases: ['silenciar'],
    access: 'staff',
  },
  async run(ctx) {
    const user = ctx.options.getUser('usuario', true);
    const { durationMs, reason } = splitTimeAndReason(ctx.options.getString('tiempo'), ctx.options.getString('razon'));
    const ms = durationMs ?? MODERATION.defaultMuteMs;
    if (!isValidTimeout(ms)) {
      throw new UserError(`${EMOJIS.cross} Un silencio puede durar como máximo ${formatDuration(MODERATION.maxTimeoutMs)}.`);
    }

    const member = await memberOf(ctx, user);
    if (!member) refuse('notInServer');
    guardTarget(ctx, user, member, 'moderatable');

    await notifyMember(user, dmEmbed({
      action: 'mute',
      guildName: ctx.guild.name,
      guildIconUrl: ctx.guild.iconURL(),
      moderatorName: ctx.user.tag,
      reason,
      durationMs: ms,
    }));

    botActions.mark('timeout', user.id);
    await discordAction(() => member.timeout(ms, auditReason(ctx, reason)));

    const embed = caseEmbed({
      action: 'mute',
      subject: subjectOf(user),
      moderatorId: ctx.user.id,
      reason,
      extra: [
        { name: 'Duración', value: `\`${formatDuration(ms)}\``, inline: true },
        { name: 'Termina', value: discordTimestamp(Date.now() + ms, 'R'), inline: true },
      ],
    });
    await announce(ctx, { text: confirmation('mute', user.username), embeds: [embed] });
  },
});
