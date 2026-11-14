import { findBlockedTerm } from './knowledge';

export const MAX_QUESTION_CHARS = 500;
/** Discord rejects messages above 2000 characters. */
export const MAX_ANSWER_CHARS = 1900;

/** Breaks `@everyone` so it no longer pings, and shows as nothing. Written as a code point to stay visible in the source. */
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);

/** Control characters and the invisible or direction-changing ones (zero width, bidi marks and overrides), by code point. */
const INVISIBLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x7f],
  [0x200b, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069],
];

const stripInvisible = (text: string): string =>
  Array.from(text)
    .filter(char => {
      const code = char.codePointAt(0)!;
      return !INVISIBLE_RANGES.some(([from, to]) => code >= from && code <= to);
    })
    .join('');

export type QuestionCheck =
  | { ok: true; question: string }
  | { ok: false; reason: 'empty' | 'too_long' };

/** The question as the model should see it: mentions and control characters out, spaces collapsed. */
export const checkQuestion = (raw: string): QuestionCheck => {
  const question = stripInvisible(raw)
    .replace(/<@[!&]?\d+>|<#\d+>/g, '')
    .replace(/@(everyone|here)/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (!question) return { ok: false, reason: 'empty' };
  if (question.length > MAX_QUESTION_CHARS) return { ok: false, reason: 'too_long' };
  return { ok: true, question };
};

const URL_PATTERN = /https?:\/\/[^\s<>()\[\]]+/gi;
const OMITTED_LINK = '[enlace omitido]';

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/** A link is kept when it is of the website, or when the knowledge file contains it as it is written there. */
const isAllowedLink = (url: string, knowledge: string): boolean => {
  const host = hostOf(url);
  if (!host) return false;
  if (host === 'panitacraft.com' || host.endsWith('.panitacraft.com')) return true;
  return knowledge.includes(url.replace(/[.,;:!?'"]+$/, ''));
};

export interface AnswerRules {
  knowledge: string;
  blockedTerms: readonly string[];
}

/**
 * The answer as it may be posted, or null when it must be replaced. Whatever the model says, nobody gets pinged,
 * no unknown link goes out and a blocked term never reaches the channel.
 */
export const cleanAnswer = (raw: string, { knowledge, blockedTerms }: AnswerRules): string | null => {
  let text = raw
    .replace(/<@[!&]?\d+>|<#\d+>/g, '')
    .replace(/@(everyone|here)/gi, `@${ZERO_WIDTH_SPACE}$1`)
    .replace(URL_PATTERN, url => (isAllowedLink(url, knowledge) ? url : OMITTED_LINK))
    .trim();

  if (!text || findBlockedTerm(text, blockedTerms)) return null;
  if (text.length > MAX_ANSWER_CHARS) text = `${text.slice(0, MAX_ANSWER_CHARS - 1).trimEnd()}…`;
  return text;
};
