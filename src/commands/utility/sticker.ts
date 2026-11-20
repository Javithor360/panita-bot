import { SlashCommandBuilder, StickerType, type Sticker } from 'discord.js';
import { CATEGORIES, PREFIX } from '../../config/constants';
import { defineCommand } from '../../core/command';
import type { CommandContext } from '../../core/context';
import { snowflakeDate } from '../../features/info/dates';
import { stickerFormatName } from '../../features/info/labels';
import { findByName, hasPicture, parseStickerQuery } from '../../features/info/stickerParse';
import { stickerMessage } from '../../features/info/stickerView';
import { fail, usageLine } from '../../lib/voice';

const USAGE = [
  `${PREFIX}sticker <nombre o ID> [--info]`,
  `${PREFIX}sticker (con un sticker en el mismo mensaje)`,
  `${PREFIX}sticker (respondiendo a un mensaje con un sticker)`,
];

/** The first sticker of a message, or `null`. A sticker sent in a message arrives partial: it is completed later. */
const stickerOf = async (ctx: CommandContext, messageId: string | null): Promise<Sticker | null> => {
  if (!messageId || !ctx.channel) return null;
  const message = await ctx.channel.messages.fetch(messageId).catch(() => null);
  return message?.stickers.first() ?? null;
};

/**
 * Which sticker is meant: an ID (any sticker, those of Discord's own packs too), the name of a sticker of this server, or, when
 * nothing is written, the one sent with the command or in the message it replies to.
 */
const resolve = async (ctx: CommandContext): Promise<Sticker | null> => {
  const query = parseStickerQuery(ctx.options.getString('sticker'));
  if (query?.kind === 'id') return ctx.client.fetchSticker(query.id).catch(() => null);
  if (query?.kind === 'name') return findByName(ctx.guild.stickers.cache.values(), query.name);
  return (await stickerOf(ctx, ctx.triggerMessageId)) ?? (await stickerOf(ctx, ctx.referencedMessageId));
};

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('sticker')
    .setDescription('Muestra un sticker en grande.')
    .addStringOption(option => option.setName('sticker').setDescription('El nombre de un sticker de este servidor, o su ID.'))
    .addBooleanOption(option => option.setName('info').setDescription('Muestra también su nombre, ID, formato y fecha.')),
  meta: {
    category: CATEGORIES.utility,
    description:
      'Muestra un sticker en grande. Escribe el nombre de uno de este servidor o su ID (sirve cualquier sticker, también los de Discord), '
      + 'o envía un sticker junto con el comando, o responde con el comando a un mensaje que tenga uno. Con `--info` también muestra su nombre, ID, formato, etiquetas y fecha.',
    aliases: ['stk'],
  },
  async run(ctx) {
    await ctx.defer();
    const found = await resolve(ctx);
    if (!found) {
      return ctx.reply({ content: `${fail(ctx.member, 'sticker no encontrado.')}\n${usageLine(USAGE)}`, ephemeral: true });
    }

    const sticker = found.partial ? await found.fetch().catch(() => found) : found;
    await ctx.reply(stickerMessage({
      name: sticker.name,
      id: sticker.id,
      description: sticker.description,
      tags: sticker.tags,
      format: stickerFormatName(sticker.format),
      imageUrl: hasPicture(sticker.format) ? sticker.url : null,
      serverName: sticker.guildId ? ctx.client.guilds.cache.get(sticker.guildId)?.name ?? null : null,
      standard: sticker.type === StickerType.Standard,
      createdAt: snowflakeDate(sticker.id),
      info: ctx.options.getBoolean('info') === true,
    }));
  },
});
