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
