import { EmbedBuilder } from 'discord.js';
import { COLORS } from '../../config/constants';
import { MC_TEXT } from './messages';
import type { PlayerListData, TpsData } from './protocol';

/** Room in an embed description, with some to spare. */
const MAX_DESCRIPTION = 3900;

/** The players who are online: by the name they have in chat, with their real name beside it when it is different. */
export const playerListEmbed = ({ online, max }: PlayerListData): EmbedBuilder => {
  const embed = new EmbedBuilder().setColor(COLORS.green).setTitle(MC_TEXT.playersTitle(online.length, max));
  if (online.length === 0) return embed.setDescription(MC_TEXT.playersNone);

  const lines = online.map(player => (player.nickname ? `• **${player.nickname}** (${player.name})` : `• **${player.name}**`));
  let text = '';
  for (const [index, line] of lines.entries()) {
    if (text.length + line.length + 1 > MAX_DESCRIPTION) {
      text += `\n…y ${lines.length - index} más`;
      break;
    }
    text += (text ? '\n' : '') + line;
  }
  return embed.setDescription(text);
};

/** The color of how the server is doing: green while it keeps up, yellow when it struggles, red when it is slow. */
export const tpsColor = (tps: number) => (tps >= 19 ? COLORS.success : tps >= 15 ? COLORS.warning : COLORS.error);

export const tpsEmbed = ({ tps, mspt }: TpsData): EmbedBuilder =>
  new EmbedBuilder()
    .setColor(tpsColor(tps))
    .setTitle(MC_TEXT.tpsTitle)
    .addFields(
      { name: MC_TEXT.tpsField, value: `\`${tps.toFixed(1)}\``, inline: true },
      { name: MC_TEXT.msptField, value: `\`${mspt.toFixed(1)} ms\``, inline: true },
    );
