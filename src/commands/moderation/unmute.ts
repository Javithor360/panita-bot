import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { announce, auditReason, discordAction, guardTarget, memberOf, refuse, subjectOf } from '../../features/moderation/actions';
import { caseEmbed, confirmation } from '../../features/moderation/messages';
import { botActions } from '../../features/moderation/recent';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Quita el silencio a un miembro.')
    .addUserOption(option => option.setName('usuario').setDescription('El miembro al que se le quita el silencio.').setRequired(true))
    .addStringOption(option => option.setName('razon').setDescription('La razón para quitar el silencio.')),
  meta: {
    category: CATEGORIES.moderation,
    description: 'Quita el silencio (el tiempo de espera de Discord) a un miembro antes de que termine.',
    access: 'staff',
  },
  async run(ctx) {
    const user = ctx.options.getUser('usuario', true);
    const reason = ctx.options.getString('razon');

    const member = await memberOf(ctx, user);
    if (!member) refuse('notInServer');
    if (!member.isCommunicationDisabled()) refuse('notMuted');
    guardTarget(ctx, user, member, 'moderatable');

    botActions.mark('timeout', user.id);
    await discordAction(() => member.timeout(null, auditReason(ctx, reason)));

    const embed = caseEmbed({ action: 'unmute', subject: subjectOf(user), moderatorId: ctx.user.id, reason });
    await announce(ctx, { text: confirmation(ctx.member, 'unmute', user.username), embeds: [embed] });
  },
});
