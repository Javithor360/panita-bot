import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { announce, auditReason, discordAction, refuse, subjectOf } from '../../features/moderation/actions';
import { HIDE_CHANNEL_TYPES, overwritableChannel } from '../../features/moderation/channels';
import { caseEmbed, confirmation } from '../../features/moderation/messages';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('unhide')
    .setDescription('Vuelve a mostrar un canal a un miembro.')
    .addUserOption(option => option.setName('usuario').setDescription('El miembro que vuelve a ver el canal.').setRequired(true))
    .addChannelOption(option =>
      option.setName('canal').setDescription('El canal que se muestra. Por defecto, este.').addChannelTypes(...HIDE_CHANNEL_TYPES),
    )
    .addStringOption(option => option.setName('razon').setDescription('La razón.')),
  meta: {
    category: CATEGORIES.moderation,
    description: 'Revierte `hide`: el miembro vuelve a ver el canal.',
    access: 'staff',
  },
  async run(ctx) {
    const user = ctx.options.getUser('usuario', true);
    const reason = ctx.options.getString('razon');
    const channel = overwritableChannel(ctx.options.getChannel('canal') ?? ctx.channel);

    if (!channel.permissionOverwrites.cache.get(user.id)?.deny.has('ViewChannel')) refuse('notHidden');

    await discordAction(async () => {
      await channel.permissionOverwrites.edit(user.id, { ViewChannel: null }, { reason: auditReason(ctx, reason) });
      // An overwrite left with nothing in it is only clutter
      const left = channel.permissionOverwrites.cache.get(user.id);
      if (left && left.allow.bitfield === 0n && left.deny.bitfield === 0n) await left.delete();
    });

    const embed = caseEmbed({
      action: 'unhide',
      subject: subjectOf(user),
      moderatorId: ctx.user.id,
      reason,
      extra: [{ name: 'Canal mostrado', value: `<#${channel.id}>`, inline: true }],
    });
    await announce(ctx, { text: confirmation(ctx.member, 'unhide', user.username), embeds: [embed] });
  },
});
