import { time, type TimestampStylesString } from 'discord.js';

/** Discord dynamic timestamp (`<t:unix:style>`), rendered in each viewer's timezone. */
export const discordTimestamp = (date: Date | number, style: TimestampStylesString = 'f') =>
  time(Math.floor((typeof date === 'number' ? date : date.getTime()) / 1000), style);

/**
 * Text a client typed (a device name) made safe to show in a message: one line, clipped, and in an inline
 * code span, where Discord renders no markdown, mention, timestamp or link. `null` when nothing is left.
 */
export const untrustedText = (text: string | null | undefined, max = 48): string | null => {
  const clean = (text ?? '')
    // Control, format (zero-width, bidi) and line-separator characters become a space
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, ' ')
    .replace(/[`<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return null;
  return `\`${clean.length > max ? `${clean.slice(0, max - 1)}…` : clean}\``;
};

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
