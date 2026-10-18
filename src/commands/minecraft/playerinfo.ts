import { AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { bridge, cards } from '../../features/minecraft';
import { playerInfoEmbed } from '../../features/minecraft/embeds';
import { withSilentMention } from '../../features/minecraft/mention';
import { MC_TEXT } from '../../features/minecraft/messages';
import type { PlayerInfoData } from '../../features/minecraft/protocol';
import { queryMinecraft } from '../../features/minecraft/queries';
import { isValidIgn } from '../../lib/minecraft';

type Found = Extract<PlayerInfoData, { found: true }>;

const drawCard = async (info: Found): Promise<Buffer | null> => {
  try {
    return (await (await cards())?.playerCard(info.player, info.online)) ?? null;
  } catch (error) {
    console.error('[Minecraft] Could not draw the card of a player:', error);
    return null;
  }
};

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('playerinfo')
    .setDescription('Muestra la información de un jugador del servidor de Minecraft.')
    .addStringOption(option =>
      option.setName('jugador').setDescription('El nombre de usuario (IGN) del jugador').setRequired(true),
    ),
  meta: {
    category: CATEGORIES.minecraftServer,
    description: 'Muestra el rango, el tiempo jugado y si está conectado un jugador del servidor de Minecraft, con el aspecto que tiene en el juego.',
    aliases: ['jugador', 'infojugador'],
  },
  async run(ctx) {
    const name = ctx.options.getString('jugador', true).trim();
    if (!isValidIgn(name)) return ctx.reply({ content: MC_TEXT.playerInfoInvalid, ephemeral: true });

    // The server may take a few seconds to answer, longer than a slash command can wait
    await ctx.defer();
    const info = await queryMinecraft(bridge, 'playerinfo', { player: name });
    if (!info.found) return ctx.reply({ content: MC_TEXT.playerInfoUnknown(name), ephemeral: true });

    const picture = await drawCard(info);
    await ctx.reply(
      withSilentMention(ctx.user.id, {
        embeds: [playerInfoEmbed(info, picture !== null)],
        ...(picture ? { files: [new AttachmentBuilder(picture, { name: 'playerinfo.png' })] } : {}),
      }),
    );
  },
});
