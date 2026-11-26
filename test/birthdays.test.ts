import './support';
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGreeting, isGreetingOf, searchGreeting, type HistoryMessage } from '../src/features/birthdays/greeting';
import { isDue, localDate } from '../src/features/birthdays/time';
import type { BirthdayMember } from '../src/lib/api/types';
import { listBirthdays } from '../src/services/birthdays';
import { ok, silenceApiLogs, stubFetch } from './support';

const member = (discord_id: string): BirthdayMember => ({ discord_id, ign: null, discord_name: 'someone' });
const at = (iso: string) => new Date(iso);
const schedule = { offsetHours: -6, hour: 10 };

test('localDate: 05:30 UTC is still the previous day in UTC-6, 06:00 UTC is the new one', () => {
  assert.equal(localDate(at('2026-10-16T05:30:00Z'), -6), '2026-10-15');
  assert.equal(localDate(at('2026-10-16T05:59:59Z'), -6), '2026-10-15');
  assert.equal(localDate(at('2026-10-16T06:00:00Z'), -6), '2026-10-16');
  assert.equal(localDate(at('2026-01-01T03:00:00Z'), -6), '2025-12-31');
});

test('isDue: nothing before 10:00 local, due from 16:00 UTC', () => {
  assert.equal(isDue(at('2026-10-16T15:59:00Z'), null, schedule), false);
  assert.equal(isDue(at('2026-10-16T16:00:00Z'), null, schedule), true);
});

test('isDue: a bot that was down at 10:00 still greets later the same day', () => {
  assert.equal(isDue(at('2026-10-16T23:30:00Z'), '2026-10-15', schedule), true);
});

test('isDue: not twice the same local day, but again the next one', () => {
  assert.equal(isDue(at('2026-10-16T16:00:00Z'), '2026-10-16', schedule), false);
  assert.equal(isDue(at('2026-10-17T16:00:00Z'), '2026-10-16', schedule), true);
});

test('isDue: after local midnight but before the hour it is a new day that is not due yet', () => {
  // 07:00 UTC is 01:00 local on the 16th
  assert.equal(isDue(at('2026-10-16T07:00:00Z'), '2026-10-15', schedule), false);
});

test('buildGreeting: nothing to say when nobody has a birthday', () => {
  assert.equal(buildGreeting([]), null);
});

test('buildGreeting: one member, two members and several', () => {
  assert.equal(
    buildGreeting([member('1')])?.content,
    '🎂 ¡Hoy es el cumpleaños de <@1>! Pásense a dejarle sus felicitaciones. 🎉',
  );
  assert.equal(
    buildGreeting([member('1'), member('2')])?.content,
    '🎂 ¡Hoy cumplen años <@1> y <@2>! Pásense a dejarles sus felicitaciones. 🎉',
  );
  assert.equal(
    buildGreeting([member('1'), member('2'), member('3')])?.content,
    '🎂 ¡Hoy cumplen años <@1>, <@2> y <@3>! Pásense a dejarles sus felicitaciones. 🎉',
  );
});

test('buildGreeting: only the listed members can be pinged, and a repeated one once', () => {
  const greeting = buildGreeting([member('1'), member('2'), member('1')]);
  assert.deepEqual(greeting?.allowedMentions, { parse: [], users: ['1', '2'] });
});

test('buildGreeting: no digits other than the mentioned ids, so never an age', () => {
  const content = buildGreeting([member('812345678901234567'), member('912345678901234567')])?.content ?? '';
  assert.doesNotMatch(content.replace(/<@\d+>/g, ''), /\d/);
});

test('isGreetingOf: only the bot, only its greeting, only that local day', () => {
  const greeting = buildGreeting([member('1')])!.content;
  const posted = { authorId: 'bot', content: greeting, createdAt: at('2026-10-16T16:05:00Z') };
  assert.equal(isGreetingOf(posted, 'bot', '2026-10-16', -6), true);
  assert.equal(isGreetingOf({ ...posted, authorId: 'someone' }, 'bot', '2026-10-16', -6), false);
  assert.equal(isGreetingOf({ ...posted, content: 'hola' }, 'bot', '2026-10-16', -6), false);
  assert.equal(isGreetingOf({ ...posted, createdAt: at('2026-10-15T16:05:00Z') }, 'bot', '2026-10-16', -6), false);
});

/** A channel of `total` messages, newest first, one every minute back from 20:00 UTC; the greeting sits at `greetingAt` (0 = newest). */
const channel = (total: number, greetingAt: number | null, greeting = buildGreeting([member('1')])!.content) => {
  const newest = at('2026-10-16T20:00:00Z').getTime();
  const messages: HistoryMessage[] = Array.from({ length: total }, (_, index) => ({
    id: String(total - index),
    authorId: index === greetingAt ? 'bot' : 'someone',
    content: index === greetingAt ? greeting : 'hola',
    createdAt: new Date(newest - index * 60_000),
  }));
  const pages: number[] = [];
  const fetchPage = async (before: string | undefined, limit: number) => {
    const start = before === undefined ? 0 : messages.findIndex(message => message.id === before) + 1;
    pages.push(start);
    return messages.slice(start, start + limit);
  };
  return { fetchPage, pages };
};

test('searchGreeting: finds a greeting that a busy channel pushed far past the last 100 messages', async () => {
  const { fetchPage, pages } = channel(350, 240);
  assert.deepEqual(await searchGreeting(fetchPage, 'bot', '2026-10-16', -6), { greeted: true, complete: true });
  assert.deepEqual(pages, [0, 100, 200]);
});

test('searchGreeting: stops once the history is older than the day, so it is certain nobody greeted', async () => {
  // 1500 minutes of messages reach back to the previous local day
  const { fetchPage, pages } = channel(1500, null);
  assert.deepEqual(await searchGreeting(fetchPage, 'bot', '2026-10-16', -6), { greeted: false, complete: true });
  assert.ok(pages.length < 15, 'it should not read the whole channel');
});

test('searchGreeting: a short channel is read to its start', async () => {
  const { fetchPage } = channel(30, null);
  assert.deepEqual(await searchGreeting(fetchPage, 'bot', '2026-10-16', -6), { greeted: false, complete: true });
});

test('searchGreeting: gives up honestly when the page limit is reached before the start of the day', async () => {
  const { fetchPage, pages } = channel(500, null);
  assert.deepEqual(await searchGreeting(fetchPage, 'bot', '2026-10-16', -6, 3), { greeted: false, complete: false });
  assert.equal(pages.length, 3);
});

test('searchGreeting: a greeting of another day does not count', async () => {
  const { fetchPage } = channel(10, 2);
  assert.deepEqual(await searchGreeting(fetchPage, 'bot', '2026-10-17', -6), { greeted: false, complete: true });
});

test('listBirthdays: asks for the day and returns the members the API lists', async () => {
  silenceApiLogs();
  const calls = stubFetch(ok([{ discord_id: '1', ign: 'Panita', discord_name: 'panita' }], { meta: { count: 1 } }));
  const members = await listBirthdays('2026-10-16');
  assert.deepEqual(members, [{ discord_id: '1', ign: 'Panita', discord_name: 'panita' }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].path, '/v1/discord/users/birthdays?date=2026-10-16');
  mock.restoreAll();
});
