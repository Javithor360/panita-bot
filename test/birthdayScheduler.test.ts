import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGreeting, type GreetingMessage } from '../src/features/birthdays/greeting';
import type { BirthdayMember } from '../src/lib/api/types';
import { createBirthdayScheduler, type BirthdaySchedulerDeps } from '../src/services/birthdayScheduler';

const member = (discord_id: string): BirthdayMember => ({ discord_id, ign: 'Panita', discord_name: 'panita' });

interface Harness {
  deps: BirthdaySchedulerDeps;
  /** The clock; set it to an ISO instant. */
  setNow(iso: string): void;
  asked: string[];
  posted: GreetingMessage[];
  scheduled: number[];
  errors: string[];
  logs: string[];
  /** What the next birthday lookups do; the last answer repeats. */
  list(...answers: Array<BirthdayMember[] | Error>): void;
  /** What the next channel history checks answer; the last answer repeats. */
  history(...answers: Array<boolean | Error>): void;
  /** What the next posts do (`undefined` is success); the last answer repeats. */
  postWith(...answers: Array<undefined | Error>): void;
  /** A new scheduler on the same fakes, as after a restart. */
  restart(): ReturnType<typeof createBirthdayScheduler>;
  scheduler: ReturnType<typeof createBirthdayScheduler>;
  historyChecks: string[];
}

const harness = (): Harness => {
  let now = new Date('2026-10-16T15:00:00Z');
  const asked: string[] = [];
  const posted: GreetingMessage[] = [];
  const scheduled: number[] = [];
  const errors: string[] = [];
  const logs: string[] = [];
  const historyChecks: string[] = [];
  let lists: Array<BirthdayMember[] | Error> = [[member('1')]];
  let histories: Array<boolean | Error> = [false];
  let postAnswers: Array<undefined | Error> = [undefined];
  let listed = 0;
  let checked = 0;
  let sent = 0;

  const deps: BirthdaySchedulerDeps = {
    offsetHours: -6,
    hour: 10,
    now: () => now,
    async listBirthdays(date) {
      asked.push(date);
      const answer = lists[Math.min(listed++, lists.length - 1)];
      if (answer instanceof Error) throw answer;
      return answer;
    },
    async hasGreeted(date) {
      historyChecks.push(date);
      const answer = histories[Math.min(checked++, histories.length - 1)];
      if (answer instanceof Error) throw answer;
      return answer;
    },
    async post(message) {
      const answer = postAnswers[Math.min(sent++, postAnswers.length - 1)];
      if (answer instanceof Error) throw answer;
      posted.push(message);
    },
    schedule: (_callback, delayMs) => void scheduled.push(delayMs),
    logger: { log: line => void logs.push(String(line)), error: line => void errors.push(String(line)) },
  };

  const h: Harness = {
    deps, asked, posted, scheduled, errors, logs, historyChecks,
    setNow: iso => { now = new Date(iso); },
    list: (...next) => { lists = next; listed = 0; },
    history: (...next) => { histories = next; checked = 0; },
    postWith: (...next) => { postAnswers = next; sent = 0; },
    restart: () => (h.scheduler = createBirthdayScheduler(deps)),
    scheduler: createBirthdayScheduler(deps),
  };
  return h;
};

test('nothing is asked or posted before 10:00 local (16:00 UTC)', async () => {
  const h = harness();
  h.setNow('2026-10-16T15:59:00Z');
  await h.scheduler.tick();
  assert.deepEqual(h.asked, []);
  assert.deepEqual(h.posted, []);
});

test('one greeting after 10:00, for the local day, and the next tick is scheduled', async () => {
  const h = harness();
  h.setNow('2026-10-16T16:00:00Z');
  await h.scheduler.tick();
  assert.deepEqual(h.asked, ['2026-10-16']);
  assert.deepEqual(h.posted, [buildGreeting([member('1')])]);
  assert.deepEqual(h.scheduled, [60_000]);
});

test('no second greeting the same day', async () => {
  const h = harness();
  h.setNow('2026-10-16T16:00:00Z');
  await h.scheduler.tick();
  h.setNow('2026-10-16T16:01:00Z');
  await h.scheduler.tick();
  h.setNow('2026-10-17T05:30:00Z'); // still the 16th in UTC-6
  await h.scheduler.tick();
  assert.equal(h.posted.length, 1);
  assert.equal(h.asked.length, 1);
});

test('no second greeting after a restart: the channel already holds today\'s', async () => {
  const h = harness();
  h.setNow('2026-10-16T16:00:00Z');
  await h.scheduler.tick();

  h.restart();
  h.history(true);
  h.setNow('2026-10-16T20:00:00Z');
  await h.scheduler.tick();
  assert.equal(h.posted.length, 1);
  // one read before the first greeting, one after the restart
  assert.deepEqual(h.historyChecks, ['2026-10-16', '2026-10-16']);

  // and it does not look again that day
  h.setNow('2026-10-16T20:01:00Z');
  await h.scheduler.tick();
  assert.equal(h.historyChecks.length, 2);
  assert.equal(h.posted.length, 1);
});

test('a catch-up: a bot that comes back after 10:00 greets if the channel has no greeting yet', async () => {
  const h = harness();
  h.setNow('2026-10-16T23:00:00Z');
  await h.scheduler.tick();
  assert.deepEqual(h.historyChecks, ['2026-10-16']);
  assert.equal(h.posted.length, 1);
});

test('the next local day greets again', async () => {
  const h = harness();
  h.setNow('2026-10-16T16:00:00Z');
  await h.scheduler.tick();
  h.setNow('2026-10-17T16:00:00Z');
  await h.scheduler.tick();
  assert.deepEqual(h.asked, ['2026-10-16', '2026-10-17']);
  assert.equal(h.posted.length, 2);
});

test('an empty list posts nothing and still closes the day', async () => {
  const h = harness();
  h.list([]);
  h.setNow('2026-10-16T16:00:00Z');
  await h.scheduler.tick();
  h.setNow('2026-10-16T16:01:00Z');
  await h.scheduler.tick();
  assert.deepEqual(h.posted, []);
  assert.deepEqual(h.historyChecks, []);
  assert.equal(h.asked.length, 1);
});

test('an API failure retries on the next tick, and the failure is logged once', async () => {
  const h = harness();
  h.list(new Error('api down'), new Error('api down'), [member('1')]);
  h.setNow('2026-10-16T16:00:00Z');
  await h.scheduler.tick();
  h.setNow('2026-10-16T16:01:00Z');
  await h.scheduler.tick();
  assert.deepEqual(h.posted, []);
  assert.equal(h.errors.length, 1);

  h.setNow('2026-10-16T16:02:00Z');
  await h.scheduler.tick();
  assert.equal(h.posted.length, 1);
  assert.ok(h.logs.some(line => line.includes('Recovered')));
  assert.deepEqual(h.scheduled, [60_000, 60_000, 60_000]);
});

test('a Discord failure retries on the next tick without reading the channel again', async () => {
  const h = harness();
  h.postWith(new Error('Missing Permissions'), undefined);
  h.setNow('2026-10-16T16:00:00Z');
  await h.scheduler.tick();
  assert.deepEqual(h.posted, []);
  assert.equal(h.errors.length, 1);

  h.setNow('2026-10-16T16:01:00Z');
  await h.scheduler.tick();
  assert.equal(h.posted.length, 1);
  assert.equal(h.historyChecks.length, 1);

  h.setNow('2026-10-16T16:02:00Z');
  await h.scheduler.tick();
  assert.equal(h.posted.length, 1);
});

test('a channel history that cannot be read does not post (it could be a duplicate) and retries', async () => {
  const h = harness();
  h.history(new Error('Missing Access'), false);
  h.setNow('2026-10-16T16:00:00Z');
  await h.scheduler.tick();
  assert.deepEqual(h.posted, []);

  h.setNow('2026-10-16T16:01:00Z');
  await h.scheduler.tick();
  assert.equal(h.posted.length, 1);
});

test('the greeting mentions only the listed members', async () => {
  const h = harness();
  h.list([member('1'), member('2')]);
  h.setNow('2026-10-16T16:00:00Z');
  await h.scheduler.tick();
  assert.deepEqual(h.posted[0].allowedMentions, { parse: [], users: ['1', '2'] });
  assert.match(h.posted[0].content, /<@1> y <@2>/);
});
