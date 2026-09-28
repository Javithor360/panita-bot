import { time, type TimestampStylesString } from 'discord.js';

/** Discord dynamic timestamp (`<t:unix:style>`), rendered in each viewer's timezone. */
export const discordTimestamp = (date: Date | number, style: TimestampStylesString = 'f') =>
  time(Math.floor((typeof date === 'number' ? date : date.getTime()) / 1000), style);

/** Compact duration such as `2d 3h 5m 10s` (zero units omitted, seconds always shown). */
export const formatDuration = (ms: number) => {
  let seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
};
