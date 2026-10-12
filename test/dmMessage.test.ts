import { apiError, ok, silenceApiLogs, stubFetch } from './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Message } from 'discord.js';
import { createCooldown } from '../src/lib/cooldown';
import { createDirectMessageHandler, DM_HELP } from '../src/events/dmMessage';
import { LOGIN_MESSAGES } from '../src/features/login/confirm';
import { SERVICE_UNAVAILABLE_ERROR } from '../src/core/errors';

beforeEach(() => silenceApiLogs());
afterEach(() => mock.restoreAll());

const login = { application: 'Web', username: 'Javithor360', requested_at: '2026-10-11T15:00:00.000Z' };

const fakeMessage = (content: string, options: { bot?: boolean; guildId?: string | null; authorId?: string } = {}) => {
  const replies: string[] = [];
  const message = {
    content,
    guildId: options.guildId ?? null,
    author: { id: options.authorId ?? '812345678901234567', bot: options.bot ?? false },
    reply: async (text: string) => { replies.push(text); },
  } as unknown as Message;
  return { message, replies };
};

test('createCooldown allows one action per key per window', () => {
  let now = 1_000;
  const cooldown = createCooldown(60_000, () => now);

  assert.equal(cooldown.tryAcquire('a'), true);
  assert.equal(cooldown.tryAcquire('a'), false);
  assert.equal(cooldown.tryAcquire('b'), true);

  now += 59_999;
  assert.equal(cooldown.tryAcquire('a'), false);
  now += 1;
  assert.equal(cooldown.tryAcquire('a'), true);
});

test('createCooldown does not start a new window for a refused attempt', () => {
  let now = 0;
  const cooldown = createCooldown(1_000, () => now);

  cooldown.tryAcquire('a');
  now = 900;
  assert.equal(cooldown.tryAcquire('a'), false);
  now = 1_000;
  assert.equal(cooldown.tryAcquire('a'), true);
});

test('createCooldown drops expired keys when it grows', () => {
  let now = 0;
  const cooldown = createCooldown(1_000, () => now);
  for (let i = 0; i < 600; i++) cooldown.tryAcquire(`user${i}`);

  now = 5_000;
  assert.equal(cooldown.tryAcquire('fresh'), true);
  assert.equal(cooldown.tryAcquire('user1'), true);
});

test('a DM that is only a code confirms the sign-in and answers with the confirmation', async () => {
  const calls = stubFetch(ok(login));
  const { message, replies } = fakeMessage(' 0472 ');

  await createDirectMessageHandler()(message);

  assert.deepEqual(calls.map(c => [c.method, c.path, c.body]), [
    ['POST', '/v1/discord/login-requests/confirm', { discord_id: '812345678901234567', code: '0472' }],
  ]);
  assert.equal(replies.length, 1);
  assert.match(replies[0], /Sesión confirmada/);
  assert.doesNotMatch(replies[0], /0472/);
});

test('a wrong code and an account that is not active get their own answers', async () => {
  stubFetch(apiError(404, 'not_found', { reason: 'code_not_found' }));
  let sent = fakeMessage('4729');
  await createDirectMessageHandler()(sent.message);
  assert.deepEqual(sent.replies, [LOGIN_MESSAGES.codeNotFound]);

  mock.restoreAll();
  silenceApiLogs();
  stubFetch(apiError(409, 'conflict', { reason: 'not_activated' }));
  sent = fakeMessage('4729');
  await createDirectMessageHandler()(sent.message);
  assert.deepEqual(sent.replies, [LOGIN_MESSAGES.notActivated]);
});

test('an API outage is reported as such, not as a wrong code', async () => {
  stubFetch(apiError(503, 'http_503'));
  const { message, replies } = fakeMessage('4729');

  await createDirectMessageHandler()(message);

  assert.deepEqual(replies, [SERVICE_UNAVAILABLE_ERROR]);
});

test('any other DM gets the help once per minute and never touches the API', async () => {
  const calls = stubFetch(ok(login));
  let now = 0;
  const handler = createDirectMessageHandler(createCooldown(60_000, () => now));
  const first = fakeMessage('hola');
  const second = fakeMessage('¿hola?');
  const other = fakeMessage('hola', { authorId: '912345678901234567' });
  const later = fakeMessage('otra vez');

  await handler(first.message);
  await handler(second.message);
  await handler(other.message);
  now = 60_000;
  await handler(later.message);

  assert.deepEqual(first.replies, [DM_HELP]);
  assert.deepEqual(second.replies, []);
  assert.deepEqual(other.replies, [DM_HELP]);
  assert.deepEqual(later.replies, [DM_HELP]);
  assert.equal(calls.length, 0);
});

test('a code does not use up the help window', async () => {
  stubFetch(ok(login));
  const handler = createDirectMessageHandler(createCooldown(60_000, () => 0));

  await handler(fakeMessage('4729').message);
  const text = fakeMessage('hola');
  await handler(text.message);

  assert.deepEqual(text.replies, [DM_HELP]);
});

test('bots and guild messages are ignored', async () => {
  const calls = stubFetch(ok(login));
  const bot = fakeMessage('4729', { bot: true });
  const guild = fakeMessage('4729', { guildId: '700000000000000000' });
  const handler = createDirectMessageHandler();

  await handler(bot.message);
  await handler(guild.message);

  assert.deepEqual([...bot.replies, ...guild.replies], []);
  assert.equal(calls.length, 0);
});

test('a failed reply (DMs closed) never throws', async () => {
  stubFetch(ok(login));
  const message = { content: '4729', guildId: null, author: { id: '1', bot: false }, reply: async () => { throw new Error('Cannot send messages to this user'); } } as unknown as Message;

  await createDirectMessageHandler()(message);
});
