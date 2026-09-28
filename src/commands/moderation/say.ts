import { ChannelType, SlashCommandBuilder, type GuildBasedChannel } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { UserError } from '../../core/errors';

const ALLOWED_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;
const CONFIRMATION_TTL_MS = 3000;

const isSendable = (channel: GuildBasedChannel | null): channel is Extract<GuildBasedChannel, { send: unknown }> =>
  !!channel && (ALLOWED_CHANNELS as readonly ChannelType[]).includes(channel.type) && channel.isTextBased();

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Envía un mensaje como el bot.')
    .addStringOption(option =>
      option.setName('mensaje')
        .setDescription('El mensaje a enviar.')
        .setRequired(true),
    )
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('El canal donde enviar el mensaje (opcional).')
        .addChannelTypes(...ALLOWED_CHANNELS)
        .setRequired(false),
    ),
  meta: {
    category: CATEGORIES.moderation,
    description: 'Permite que el bot envíe un mensaje personalizado, opcionalmente en un canal específico.',
    access: 'staff',
  },
  async run(ctx) {
    const content = ctx.options.getString('mensaje', true);
    const target = ctx.options.getChannel('canal') ?? ctx.channel;

    if (!content.trim()) throw new UserError('❌ Debes proporcionar un mensaje válido.');
    if (!isSendable(target)) throw new UserError('❌ Solo puedo enviar mensajes a canales de texto o de anuncios.');

    try {
      await target.send(content);
    } catch (error) {
      console.error('[Say] Failed to send message:', error);
      throw new UserError('❌ Hubo un error al intentar enviar el mensaje. Verifica que el bot tenga permisos en ese canal.');
    }

    // Prefix: remove the invoking message so only the bot's message remains
    if (await ctx.deleteTrigger()) return;

    await ctx.reply({ content: `✅ Mensaje enviado a ${target}.`, ephemeral: true });
    if (ctx.source === 'prefix') {
      const confirmation = await ctx.fetchReply();
      setTimeout(() => confirmation.delete().catch(() => {}), CONFIRMATION_TTL_MS);
    }
  },
});
