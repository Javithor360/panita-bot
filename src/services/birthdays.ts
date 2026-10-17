import { api } from '../lib/api';
import type { BirthdayMember } from '../lib/api/types';

export type { BirthdayMember };

/**
 * The enabled members whose birthday is on `date` (`YYYY-MM-DD`, the day as the bot sees it). The API compares month and
 * day only and decides the February 29 rule; it never returns a year or an age. A GET, so a failed call may be repeated.
 */
export const listBirthdays = (date: string): Promise<BirthdayMember[]> =>
  api.get<BirthdayMember[]>('/v1/discord/users/birthdays', { query: { date } });
