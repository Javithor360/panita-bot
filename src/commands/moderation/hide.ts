import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { announce, auditReason, discordAction, guardTarget, memberOf, refuse, subjectOf } from '../../features/moderation/actions';
import { HIDE_CHANNEL_TYPES, overwritableChannel } from '../../features/moderation/channels';
import { caseEmbed, confirmation } from '../../features/moderation/messages';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('hide')
    .setDescription('Oculta un canal a un miembro.')
    .addUserOption(option => option.setName('usuario').setDescription('El miembro que dejará de ver el canal.').setRequired(true))
    .addChannelOption(option =>
      option.setName('canal').setDescription('El canal que se oculta. Por defecto, este.').addChannelTypes(...HIDE_CHANNEL_TYPES),
    )
    .addStringOption(option => option.setName('razon').setDescription('La razón.')),
  meta: {
    category: CATEGORIES.moderation,
    description: 'Oculta un canal a un miembro: no podrá verlo ni leerlo, sin sacarlo del servidor. Se revierte con `unhide`.',
    access: 'staff',
  },
  async run(ctx) {
    const user = ctx.options.getUser('usuario', true);
    const reason = ctx.options.getString('razon');
    const channel = overwritableChannel(ctx.options.getChannel('canal') ?? ctx.channel);

    const member = await memberOf(ctx, user);
    if (!member) refuse('notInServer');
    guardTarget(ctx, user, member, 'manageable');
    if (channel.permissionOverwrites.cache.get(user.id)?.deny.has('ViewChannel')) refuse('alreadyHidden');

    await discordAction(() => channel.permissionOverwrites.edit(member, { ViewChannel: false }, { reason: auditReason(ctx, reason) }));

    const embed = caseEmbed({
      action: 'hide',
      subject: subjectOf(user),
      moderatorId: ctx.user.id,
      reason,
      extra: [{ name: 'Canal oculto', value: `<#${channel.id}>`, inline: true }],
    });
    await announce(ctx, { text: confirmation(ctx.member, 'hide', user.username), embeds: [embed] });
  },
});
