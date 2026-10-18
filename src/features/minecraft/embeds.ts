import { EmbedBuilder } from 'discord.js';
import { COLORS } from '../../config/constants';
import { MC_TEXT } from './messages';
import type { PlayerInfoData, PlayerListData, TpsData } from './protocol';
import { runsOf } from './render/cards';

/** Room in an embed description, with some to spare. */
const MAX_DESCRIPTION = 3900;

/** The players who are online: by the name they have in chat, with their real name beside it when it is different. */
/** The list as the picture: the title with the count, and the picture the command attaches as `playerlist.png`. */
export const playerListPictureEmbed = ({ online, max }: PlayerListData): EmbedBuilder =>
  new EmbedBuilder().setColor(COLORS.green).setTitle(MC_TEXT.playersTitle(online.length, max)).setImage('attachment://playerlist.png');

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

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** A time played as the weeks, days, hours, minutes and seconds that are not zero: `1w 16h 38m 48s`. */
export const formatPlaytime = (totalSeconds: number): string => {
  let rest = Math.max(0, Math.floor(totalSeconds));
  const parts: string[] = [];
  for (const [unit, size] of [['w', WEEK], ['d', DAY], ['h', HOUR], ['m', MINUTE]] as const) {
    const amount = Math.floor(rest / size);
    rest -= amount * size;
    if (amount > 0) parts.push(`${amount}${unit}`);
  }
  if (rest > 0 || parts.length === 0) parts.push(`${rest}s`);
  return parts.join(' ');
};

/** The card of a player the server knows. The picture, when there is one, is attached by the command as `playerinfo.png`. */
export const playerInfoEmbed = (info: Extract<PlayerInfoData, { found: true }>, withPicture: boolean): EmbedBuilder => {
  const name = info.player.nickname ?? info.player.name;
  const playtime = info.playtimeSeconds === null ? MC_TEXT.playtimeNone : formatPlaytime(info.playtimeSeconds);
  const embed = new EmbedBuilder()
    .setColor(info.online ? COLORS.green : COLORS.dark)
    .setTitle(MC_TEXT.playerInfoTitle(name))
    .setDescription(`**${MC_TEXT.playtime}:** ${playtime}`);
  if (withPicture) return embed.setImage('attachment://playerinfo.png');
  // Without the picture the same facts go as text, with the name the server shows for them
  const line = runsOf(info.player).map(run => run.text).join('');
  return embed.addFields({ name: line, value: `${MC_TEXT.statusLabel}: ${info.online ? MC_TEXT.online : MC_TEXT.offline}` });
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
