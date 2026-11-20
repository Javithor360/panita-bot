import { MODERATION } from '../../config/constants';

const UNIT_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
} as const;

const DURATION = /^(?:\d{1,6}[smhdw])+$/i;
const PART = /(\d{1,6})([smhdw])/gi;

/** `30m`, `2h`, `1d`, `1h30m`: the milliseconds, or `null` when the text is not a duration (or is zero). */
export const parseDuration = (text: string): number | null => {
  const clean = text.trim();
  if (!DURATION.test(clean)) return null;
  let total = 0;
  for (const [, amount, unit] of clean.matchAll(PART)) {
    total += Number(amount) * UNIT_MS[unit.toLowerCase() as keyof typeof UNIT_MS];
  }
  return total > 0 ? total : null;
};

export interface TimeAndReason {
  /** The time given, or `null` when there was none and the command falls back to its default. */
  durationMs: number | null;
  reason: string | null;
}

/**
 * The prefix parser fills the text options in order, so in `!mute @ana spam en general` the word `spam` lands in
 * the time option. When what is there is not a duration it is part of the reason, and the time stays unset.
 */
export const splitTimeAndReason = (time: string | null, reason: string | null): TimeAndReason => {
  const text = time?.trim() || null;
  const rest = reason?.trim() || null;
  if (text) {
    const durationMs = parseDuration(text);
    if (durationMs !== null) return { durationMs, reason: rest };
  }
  return { durationMs: null, reason: [text, rest].filter(Boolean).join(' ') || null };
};

/** Whether Discord accepts a timeout this long. */
export const isValidTimeout = (ms: number): boolean => ms > 0 && ms <= MODERATION.maxTimeoutMs;
