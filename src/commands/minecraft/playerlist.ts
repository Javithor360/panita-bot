import { AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { bridge, cards } from '../../features/minecraft';
import { playerListEmbed } from '../../features/minecraft/embeds';
import type { PlayerListData } from '../../features/minecraft/protocol';
import { queryMinecraft } from '../../features/minecraft/queries';

const drawList = async (list: PlayerListData): Promise<Buffer | null> => {
  try {
    return (await (await cards())?.playerList(list.online, list.max)) ?? null;
  } catch (error) {
    console.error('[Minecraft] Could not draw the list of players:', error);
    return null;
  }
};

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('playerlist')
    .setDescription('Muestra los jugadores conectados al servidor de Minecraft.'),
  meta: {
    category: CATEGORIES.minecraftServer,
    description: 'Muestra quién está conectado ahora al servidor de Minecraft, con el apodo que cada jugador usa en el chat.',
    aliases: ['jugadores', 'conectados'],
  },
  async run(ctx) {
    // The server may take a few seconds to answer, longer than a slash command can wait
    await ctx.defer();
    const list = await queryMinecraft(bridge, 'playerlist');
    // The picture needs the game's fonts; without them, or if drawing fails, the list is text as it always was
    const picture = list.online.length > 0 ? await drawList(list) : null;
    await ctx.reply(picture ? { files: [new AttachmentBuilder(picture, { name: 'playerlist.png' })] } : { embeds: [playerListEmbed(list)] });
  },
});
