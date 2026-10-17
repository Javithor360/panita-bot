import type { Client } from 'discord.js';
import { env } from '../config/env';
import { buildGreeting, isGreetingOf, type GreetingMessage, type PostedMessage } from '../features/birthdays/greeting';
import { isDue, localDate, type GreetingSchedule } from '../features/birthdays/time';
import type { BirthdayMember } from '../lib/api/types';
import { listBirthdays } from './birthdays';

/**
 * Daily birthday greeting. Once a day, from the configured hour, it asks the API who has a birthday that day and posts
 * one message in the general channel that mentions them. The bot owns the schedule, the timezone and the channel; the API
 * only answers "who has a birthday on this date".
 *
 * The day is closed only after the greeting was posted, or when nobody has a birthday. A failure of the API or of
 * Discord leaves it open, so the next tick tries again. The bot keeps no state of its own: the last greeted day lives in
 * memory, and after a restart the channel's recent messages tell whether today's greeting was already posted.
 */

const TICK_INTERVAL_MS = 60_000;

export interface BirthdaySchedulerDeps extends GreetingSchedule {
  now(): Date;
  listBirthdays(date: string): Promise<BirthdayMember[]>;
  /** Whether the bot already posted its greeting of the local day `date` (read from the channel). */
  hasGreeted(date: string): Promise<boolean>;
  post(message: GreetingMessage): Promise<void>;
  schedule(callback: () => void, delayMs: number): unknown;
  logger: Pick<Console, 'log' | 'error'>;
}

export interface BirthdayScheduler {
  /** Begins ticking. */
  start(): void;
  /** One tick. Never throws; schedules the next one. */
  tick(): Promise<void>;
}

export const createBirthdayScheduler = (deps: BirthdaySchedulerDeps): BirthdayScheduler => {
  const { logger } = deps;
  /** The last local day that is done (greeted, or nothing to send). */
  let lastGreeted: string | null = null;
  /** The day whose channel history was already read, so a retry does not read it again. */
  let checkedDay: string | null = null;
  let failing = false;

  /** Greets today's birthdays if it is time. Throws when the API or Discord fails. */
  const greetIfDue = async () => {
    const now = deps.now();
    if (!isDue(now, lastGreeted, deps)) return;

    const day = localDate(now, deps.offsetHours);
    const greeting = buildGreeting(await deps.listBirthdays(day));
    if (!greeting) {
      lastGreeted = day;
      logger.log(`[Birthdays] Nobody has a birthday on ${day}.`);
      return;
    }

    if (checkedDay !== day) {
      // A restart forgot the memory of today's greeting; the channel remembers it
      if (await deps.hasGreeted(day)) {
        lastGreeted = day;
        logger.log(`[Birthdays] The greeting of ${day} was already posted.`);
        return;
      }
      checkedDay = day;
    }

    await deps.post(greeting);
    lastGreeted = day;
    logger.log(`[Birthdays] Greeted ${greeting.allowedMentions.users.length} member(s) for ${day}.`);
  };

  const tick = async () => {
    try {
      await greetIfDue();
      if (failing) logger.log('[Birthdays] Recovered; greeting normally.');
      failing = false;
    } catch (error) {
      // Once per streak: a missing permission would otherwise fill the log every minute
      if (!failing) logger.error('[Birthdays] Could not greet; trying again every minute:', error);
      failing = true;
    }
    deps.schedule(() => void tick(), TICK_INTERVAL_MS);
  };

  return { start: () => void tick(), tick };
};

/** Starts the daily greeting. Without `BIRTHDAY_CHANNEL_ID` there is none. */
export const startBirthdayScheduler = (client: Client) => {
  const channelId = env.BIRTHDAY_CHANNEL_ID;
  if (!channelId) {
    console.log('[Birthdays] BIRTHDAY_CHANNEL_ID is not set; the birthday greeting is off.');
    return;
  }

  const fetchChannel = async () => {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || !('send' in channel)) throw new Error(`Channel ${channelId} cannot receive messages`);
    return channel;
  };

  createBirthdayScheduler({
    offsetHours: env.BIRTHDAY_UTC_OFFSET_HOURS,
    hour: env.BIRTHDAY_HOUR,
    now: () => new Date(),
    listBirthdays,
    async hasGreeted(date) {
      const botId = client.user?.id;
      if (!botId) throw new Error('The bot user is not ready');
      const channel = await fetchChannel();
      const recent = await channel.messages.fetch({ limit: 100 });
      return recent.some(message => {
        const posted: PostedMessage = { authorId: message.author.id, content: message.content, createdAt: message.createdAt };
        return isGreetingOf(posted, botId, date, env.BIRTHDAY_UTC_OFFSET_HOURS);
      });
    },
    async post(message) {
      await (await fetchChannel()).send(message);
    },
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    logger: console,
  }).start();
};
