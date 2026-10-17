const HOUR_MS = 3_600_000;

/** When the greeting is due: the offset from UTC of the day it follows and the hour from which it is sent. */
export interface GreetingSchedule {
  offsetHours: number;
  hour: number;
}

/** The clock of the schedule, as UTC fields of a shifted date (so no timezone database is needed). */
const shifted = (now: Date, offsetHours: number): Date => new Date(now.getTime() + offsetHours * HOUR_MS);

/** The `YYYY-MM-DD` of "today" at the given UTC offset. At 05:30 UTC with an offset of -6 it is still the previous day. */
export const localDate = (now: Date, offsetHours: number): string => shifted(now, offsetHours).toISOString().slice(0, 10);

/**
 * Whether today's greeting is due: the local time is the greeting hour or later, and `lastGreeted` is not today.
 * Being `>=` rather than `==` makes a bot that was down at the hour greet when it comes back the same day.
 */
export const isDue = (now: Date, lastGreeted: string | null, { offsetHours, hour }: GreetingSchedule): boolean =>
  shifted(now, offsetHours).getUTCHours() >= hour && lastGreeted !== localDate(now, offsetHours);
