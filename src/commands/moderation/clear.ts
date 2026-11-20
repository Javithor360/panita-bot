import { SlashCommandBuilder, type GuildTextBasedChannel, type Message } from 'discord.js';
import { CATEGORIES, EMOJIS, MODERATION } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { UserError } from '../../core/errors';
import { discordAction } from '../../features/moderation/actions';
import { clearEmbed } from '../../features/moderation/messages';
import { modlogOf } from '../../features/moderation/modlog';
import { botActions } from '../../features/moderation/recent';

type Clearable = GuildTextBasedChannel & { bulkDelete: (messages: readonly Message[], filterOld?: boolean) => Promise<{ size: number }> };

const isClearable = (channel: GuildTextBasedChannel | null): channel is Clearable => !!channel && 'bulkDelete' in channel;

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Borra varios mensajes de este canal.')
    .addIntegerOption(option =>
      option.setName('cantidad')
        .setDescription(`Cuántos mensajes borrar (${MODERATION.clearMin} a ${MODERATION.clearMax}).`)
        .setMinValue(MODERATION.clearMin)
        .setMaxValue(MODERATION.clearMax)
        .setRequired(true),
    )
    .addUserOption(option => option.setName('usuario').setDescription('Borra solo los mensajes de esta persona.')),
  meta: {
    category: CATEGORIES.moderation,
    description:
      `Borra entre ${MODERATION.clearMin} y ${MODERATION.clearMax} mensajes del canal, o solo los de una persona. Discord no deja borrar en bloque mensajes de más de 14 días.`,
    aliases: ['purge', 'prune'],
    access: 'staff',
  },
  async run(ctx) {
    const requested = ctx.options.getInteger('cantidad', true);
    const author = ctx.options.getUser('usuario');
    const channel = ctx.channel;
    if (!isClearable(channel)) throw new UserError(`${EMOJIS.cross} No puedo borrar mensajes en este tipo de canal.`);

    await ctx.defer({ ephemeral: true });
    // The command that asked for it is the first message to go, so it does not count
    await ctx.deleteTrigger();

    // To keep `requested` messages of one person the latest ones are looked through, not only the last `requested`
    const recent = [...(await channel.messages.fetch({ limit: author ? MODERATION.clearMax : requested })).values()];
    const messages = (author ? recent.filter(message => message.author.id === author.id) : recent).slice(0, requested);

    botActions.mark('clear', channel.id);
    const deleted = messages.length > 0 ? (await discordAction(() => channel.bulkDelete(messages, true))).size : 0;

    if (deleted === 0) {
      throw new UserError(`${EMOJIS.cross} No encontré mensajes que pueda borrar (los de más de 14 días no se pueden borrar en bloque).`);
    }

    const people = author ? ` de **${author.username}**` : '';
    await ctx.reply({
      content: `${EMOJIS.check} Se borraron ${deleted} mensaje${deleted === 1 ? '' : 's'}${people} correctamente.`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    if (ctx.source === 'prefix') {
      const confirmation = await ctx.fetchReply();
      setTimeout(() => confirmation.delete().catch(() => {}), MODERATION.clearConfirmationMs);
    }

    await modlogOf(ctx.client).post({
      embeds: [clearEmbed({ moderatorId: ctx.user.id, channelId: channel.id, deleted, authorId: author?.id })],
    });
  },
});
