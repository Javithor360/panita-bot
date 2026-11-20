import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { announce, auditReason, discordAction, guardTarget, memberOf, notifyMember, refuse, subjectOf } from '../../features/moderation/actions';
import { caseEmbed, confirmation, dmEmbed } from '../../features/moderation/messages';
import { botActions } from '../../features/moderation/recent';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa a un miembro del servidor.')
    .addUserOption(option => option.setName('usuario').setDescription('El miembro que será expulsado.').setRequired(true))
    .addStringOption(option => option.setName('razon').setDescription('La razón de la expulsión.').setRequired(true)),
  meta: {
    category: CATEGORIES.moderation,
    description: 'Expulsa a un miembro del servidor y le avisa por mensaje directo. Puede volver a entrar con una invitación.',
    access: 'staff',
  },
  async run(ctx) {
    const user = ctx.options.getUser('usuario', true);
    const reason = ctx.options.getString('razon', true);

    const member = await memberOf(ctx, user);
    if (!member) refuse('notInServer');
    guardTarget(ctx, user, member, 'kickable');

    // The message goes first: once the member is gone it can no longer be delivered
    await notifyMember(user, dmEmbed({
      action: 'kick',
      guildName: ctx.guild.name,
      guildIconUrl: ctx.guild.iconURL(),
      moderatorName: ctx.user.tag,
      reason,
    }));

    botActions.mark('kick', user.id);
    await discordAction(() => member.kick(auditReason(ctx, reason)));

    const embed = caseEmbed({ action: 'kick', subject: subjectOf(user), moderatorId: ctx.user.id, reason });
    await announce(ctx, { text: confirmation(ctx.member, 'kick', user.username), embeds: [embed] });
  },
});
