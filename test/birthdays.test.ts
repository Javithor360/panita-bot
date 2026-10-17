import './support';
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGreeting, isGreetingOf } from '../src/features/birthdays/greeting';
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
