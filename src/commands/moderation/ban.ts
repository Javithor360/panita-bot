import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, MODERATION } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { announce, auditReason, discordAction, guardTarget, memberOf, notifyMember, subjectOf } from '../../features/moderation/actions';
import { caseEmbed, confirmation, dmEmbed } from '../../features/moderation/messages';
import { botActions } from '../../features/moderation/recent';

const DAY_SECONDS = 24 * 60 * 60;

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banea a un usuario del servidor, incluso si ya no está en él.')
    .addUserOption(option => option.setName('usuario').setDescription('El usuario que será baneado (también por ID).').setRequired(true))
    .addStringOption(option => option.setName('razon').setDescription('La razón del baneo.').setRequired(true))
    .addIntegerOption(option =>
      option.setName('dias')
        .setDescription('Días de mensajes que se borran (0 a 7). Por defecto, ninguno.')
        .setMinValue(0)
        .setMaxValue(MODERATION.banDeleteDaysMax),
    ),
  meta: {
    category: CATEGORIES.moderation,
    description:
      'Banea a un usuario y le avisa por mensaje directo si está en el servidor. Funciona con una mención o una ID, así que también sirve para alguien que ya salió. '
      + 'En prefijo, un número suelto antes de la razón se toma como los días de mensajes a borrar.',
    aliases: ['banear'],
    access: 'staff',
  },
  async run(ctx) {
    const user = ctx.options.getUser('usuario', true);
    const reason = ctx.options.getString('razon', true);
    const days = ctx.options.getInteger('dias') ?? 0;

    const member = await memberOf(ctx, user);
    guardTarget(ctx, user, member, 'bannable');

    if (member) {
      await notifyMember(user, dmEmbed({
        action: 'ban',
        guildName: ctx.guild.name,
        guildIconUrl: ctx.guild.iconURL(),
        moderatorName: ctx.user.tag,
        reason,
      }));
    }

    botActions.mark('ban', user.id);
    await discordAction(() => ctx.guild.members.ban(user.id, {
      deleteMessageSeconds: days * DAY_SECONDS,
      reason: auditReason(ctx, reason),
    }));

    const embed = caseEmbed({
      action: 'ban',
      subject: subjectOf(user),
      moderatorId: ctx.user.id,
      reason,
      extra: days > 0 ? [{ name: 'Mensajes borrados', value: `Últimos ${days} día${days === 1 ? '' : 's'}`, inline: true }] : [],
    });
    await announce(ctx, { text: confirmation(ctx.member, 'ban', user.username), embeds: [embed] });
  },
});
