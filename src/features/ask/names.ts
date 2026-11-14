import { stripInvisible } from './guard';

export const MAX_NAME_CHARS = 32;
export const MAX_NAMES_RESOLVED = 5;

const USER_MENTION = /<@!?(\d+)>/g;

/** The ids of the members mentioned in a text, without repeats and in order, up to the number worth looking up. */
export const mentionedIds = (text: string): string[] =>
  [...new Set([...text.matchAll(USER_MENTION)].map(match => match[1]))].slice(0, MAX_NAMES_RESOLVED);

/** A display name safe to put in a question: no invisible characters, markup or mentions, one line, short. */
export const cleanName = (raw: string): string =>
  stripInvisible(raw)
    .replace(/[@<>`*_~|\\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_CHARS)
    .trim();

/**
 * Writes the mentions of a question as names, so the assistant can talk about the person. A member it cannot name
 * becomes "alguien". The name is the member's own text, so it is treated like the rest of the question.
 */
export const nameMentions = (text: string, nameOf: (id: string) => string | null | undefined): string =>
  text.replace(USER_MENTION, (_mention, id: string) => cleanName(nameOf(id) ?? '') || 'alguien');
