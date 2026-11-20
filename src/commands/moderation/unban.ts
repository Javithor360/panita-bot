import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { announce, auditReason, discordAction, refuse, subjectOf } from '../../features/moderation/actions';
import { caseEmbed, confirmation } from '../../features/moderation/messages';
import { botActions } from '../../features/moderation/recent';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Quita el baneo de un usuario.')
    .addUserOption(option => option.setName('usuario').setDescription('El usuario baneado (menciónalo o usa su ID).').setRequired(true))
    .addStringOption(option => option.setName('razon').setDescription('La razón para quitar el baneo.')),
  meta: {
    category: CATEGORIES.moderation,
    description: 'Revoca el baneo de un usuario. Funciona con una mención o con su ID.',
    access: 'staff',
  },
  async run(ctx) {
    const user = ctx.options.getUser('usuario', true);
    const reason = ctx.options.getString('razon');

    const ban = await ctx.guild.bans.fetch(user.id).catch(() => null);
    if (!ban) refuse('notBanned');

    botActions.mark('unban', user.id);
    await discordAction(() => ctx.guild.bans.remove(user.id, auditReason(ctx, reason)));

    const embed = caseEmbed({ action: 'unban', subject: subjectOf(user), moderatorId: ctx.user.id, reason });
    await announce(ctx, { text: confirmation('unban', user.username), embeds: [embed] });
  },
});
