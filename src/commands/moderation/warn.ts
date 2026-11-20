import { SlashCommandBuilder, type EmbedBuilder, type GuildMember, type User } from 'discord.js';
import { CATEGORIES, MODERATION } from '../../config/constants';
import { defineCommand } from '../../core/command';
import type { CommandContext } from '../../core/context';
import { announce, discordAction, guardTarget, memberOf, notifyMember, subjectOf } from '../../features/moderation/actions';
import { sanctionFor, type AutoSanction } from '../../features/moderation/autoSanction';
import { caseEmbed, confirmation, dmEmbed } from '../../features/moderation/messages';
import { botActions } from '../../features/moderation/recent';
import { discordTimestamp, formatDuration } from '../../lib/format';
import { fail, ok } from '../../lib/voice';
import { createWarning } from '../../services/moderation';

/**
 * The sanction the warnings earned, applied by the bot itself. Returns the case embed and the line that goes in the
 * answer, or a line saying that it could not be applied (the member has a higher role than the bot, for example).
 */
const applyAutoSanction = async (
  ctx: CommandContext,
  user: User,
  member: GuildMember,
  sanction: AutoSanction,
  count: number,
): Promise<{ line: string; embed?: EmbedBuilder }> => {
  const reason = `Acumuló ${count} advertencias`;
  const moderatorId = ctx.client.user.id;
  const dm = {
    guildName: ctx.guild.name,
    guildIconUrl: ctx.guild.iconURL(),
    moderatorName: ctx.client.user.tag,
    reason,
  };

  if (sanction.kind === 'timeout') {
    if (!member.moderatable) return { line: fail(null, `llegó a ${count} advertencias, pero no puedo silenciarlo.`) };
    await notifyMember(user, dmEmbed({ action: 'mute', durationMs: sanction.ms, ...dm }));
    botActions.mark('timeout', user.id);
    await discordAction(() => member.timeout(sanction.ms, `${reason} | Sanción automática`));
    return {
      line: ok(null, `por llegar a ${count} advertencias, **${user.username}** fue silenciado ${formatDuration(sanction.ms)}.`),
      embed: caseEmbed({
        action: 'mute',
        subject: subjectOf(user),
        moderatorId,
        reason,
        extra: [
          { name: 'Duración', value: `\`${formatDuration(sanction.ms)}\``, inline: true },
          { name: 'Termina', value: discordTimestamp(Date.now() + sanction.ms, 'R'), inline: true },
        ],
      }),
    };
  }

  if (!member.kickable) return { line: fail(null, `llegó a ${count} advertencias, pero no puedo expulsarlo.`) };
  await notifyMember(user, dmEmbed({ action: 'kick', ...dm }));
  botActions.mark('kick', user.id);
  await discordAction(() => member.kick(`${reason} | Sanción automática`));
  return {
    line: ok(null, `por llegar a ${count} advertencias, **${user.username}** fue expulsado del servidor.`),
    embed: caseEmbed({ action: 'kick', subject: subjectOf(user), moderatorId, reason }),
  };
};

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Advierte a un miembro.')
    .addUserOption(option => option.setName('usuario').setDescription('El miembro que será advertido.').setRequired(true))
    .addStringOption(option => option.setName('razon').setDescription('La razón de la advertencia.').setRequired(true)),
  meta: {
    category: CATEGORIES.moderation,
    description:
      'Registra una advertencia y le avisa al miembro por mensaje directo. '
      + `Con ${MODERATION.warnMuteAt} advertencias activas queda silenciado ${formatDuration(MODERATION.warnMuteMs)} y con ${MODERATION.warnKickAt} es expulsado.`,
    aliases: ['w'],
    access: 'staff',
  },
  async run(ctx) {
    const user = ctx.options.getUser('usuario', true);
    const reason = ctx.options.getString('razon', true);

    const member = await memberOf(ctx, user);
    guardTarget(ctx, user, member, 'none');

    await ctx.defer();
    const { active_count: count } = await createWarning({ userId: user.id, moderatorId: ctx.user.id, reason });

    if (member) {
      await notifyMember(user, dmEmbed({
        action: 'warn',
        guildName: ctx.guild.name,
        guildIconUrl: ctx.guild.iconURL(),
        moderatorName: ctx.user.tag,
        reason,
        warnCount: count,
      }));
    }

    const embeds = [caseEmbed({
      action: 'warn',
      subject: subjectOf(user),
      moderatorId: ctx.user.id,
      reason,
      footer: `Advertencias activas: ${count}/${MODERATION.warnKickAt}`,
    })];
    const lines = [confirmation(ctx.member, 'warn', user.username)];

    const sanction = sanctionFor(count);
    if (sanction && member) {
      const applied = await applyAutoSanction(ctx, user, member, sanction, count);
      lines.push(applied.line);
      if (applied.embed) embeds.push(applied.embed);
    }

    await announce(ctx, { text: lines.join('\n'), embeds });
  },
});
