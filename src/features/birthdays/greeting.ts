import type { BirthdayMember } from '../../lib/api/types';
import { localDate } from './time';

/** Every greeting starts with this, which is how the bot recognises its own after a restart. */
const GREETING_PREFIX = '🎂 ¡Hoy ';

/** A message to the channel: the text and the only users it may ping. */
export interface GreetingMessage {
  content: string;
  allowedMentions: { parse: []; users: string[] };
}

/** "<@a>", "<@a> y <@b>" or "<@a>, <@b> y <@c>". */
const joinMentions = (mentions: string[]): string =>
  mentions.length < 2 ? (mentions[0] ?? '') : `${mentions.slice(0, -1).join(', ')} y ${mentions[mentions.length - 1]}`;

/**
 * The greeting for the members who have a birthday today, or `null` when there is none. It never says an age: the
 * API does not return one and the message does not need it. Only the listed members can be pinged.
 */
export const buildGreeting = (members: BirthdayMember[]): GreetingMessage | null => {
  if (members.length === 0) return null;
  const ids = [...new Set(members.map(member => member.discord_id))];
  const mentions = ids.map(id => `<@${id}>`);
  const content =
    ids.length === 1
      ? `${GREETING_PREFIX}es el cumpleaños de ${mentions[0]}! Pásense a dejarle sus felicitaciones. 🎉`
      : `${GREETING_PREFIX}cumplen años ${joinMentions(mentions)}! Pásense a dejarles sus felicitaciones. 🎉`;
  return { content, allowedMentions: { parse: [], users: ids } };
};

/** The part of a channel message needed to tell whether it is the bot's greeting of a day. */
export interface PostedMessage {
  authorId: string;
  content: string;
  createdAt: Date;
}

/** Whether `message` is a greeting the bot itself posted on the local day `day`. */
export const isGreetingOf = (message: PostedMessage, botId: string, day: string, offsetHours: number): boolean =>
  message.authorId === botId &&
  message.content.startsWith(GREETING_PREFIX) &&
  localDate(message.createdAt, offsetHours) === day;

/** Messages per request, which is the most Discord returns. */
const PAGE_SIZE = 100;
/** How far back a restart looks for its own greeting: 3000 messages, so a busy general channel cannot hide it. */
const MAX_PAGES = 30;

/** A message of the channel with its id, to ask for the page before it. */
export interface HistoryMessage extends PostedMessage {
  id: string;
}

/** What a search of the channel history found. */
export interface HistorySearch {
  /** The greeting of the day was seen. */
  greeted: boolean;
  /** The search reached the start of the day (or the start of the channel), so `greeted: false` is certain. */
  complete: boolean;
}

/**
 * Looks for the bot's greeting of the local day `day` in the channel, newest messages first, page by page until the
 * history goes back past the start of that day. Reading only the last page is not enough: in a busy channel the
 * greeting scrolls out of it, and a restart would greet again.
 */
export const searchGreeting = async (
  fetchPage: (before: string | undefined, limit: number) => Promise<HistoryMessage[]>,
  botId: string,
  day: string,
  offsetHours: number,
  maxPages: number = MAX_PAGES,
): Promise<HistorySearch> => {
  let before: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const messages = await fetchPage(before, PAGE_SIZE);
    if (messages.some(message => isGreetingOf(message, botId, day, offsetHours))) return { greeted: true, complete: true };

    const oldest = messages[messages.length - 1];
    // An empty or short page is the start of the channel; an older message than the day is past its start
    if (!oldest || messages.length < PAGE_SIZE || localDate(oldest.createdAt, offsetHours) < day) {
      return { greeted: false, complete: true };
    }
    before = oldest.id;
  }
  return { greeted: false, complete: false };
};
