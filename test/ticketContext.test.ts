import { apiError, ok, silenceApiLogs, stubFetch } from './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { ButtonInteraction } from 'discord.js';
import { ApiError } from '../src/lib/api/errors';
import { ticketOfInteraction } from '../src/features/tickets/context';

beforeEach(() => silenceApiLogs());
afterEach(() => mock.restoreAll());

const fakeInteraction = (channelId = '790123456789012345') => ({ channelId }) as unknown as ButtonInteraction;
const ticket = { id: 't1', panel_id: 'soporte', channel_id: '790123456789012345', creator_id: 'u1', status: 'OPEN', created_at: 'x', panel: {} };

test('a guard and its handler share one lookup per interaction', async () => {
  const calls = stubFetch(ok(ticket));
  const interaction = fakeInteraction();

  const [fromGuard, fromHandler] = await Promise.all([ticketOfInteraction(interaction), ticketOfInteraction(interaction)]);
  const again = await ticketOfInteraction(interaction);

  assert.equal(calls.length, 1);
  assert.equal(fromGuard, fromHandler);
  assert.equal(again, fromGuard);
  assert.equal(calls[0].path, '/v1/tickets/by-channel/790123456789012345');
});

test('each interaction gets its own lookup', async () => {
  const calls = stubFetch(ok(ticket));

  await ticketOfInteraction(fakeInteraction());
  await ticketOfInteraction(fakeInteraction());

  assert.equal(calls.length, 2);
});

test('a channel that is not a ticket resolves to null', async () => {
  stubFetch(apiError(404, 'not_found'));

  assert.equal(await ticketOfInteraction(fakeInteraction()), null);
});

test('the lookup is one attempt with the short pre-acknowledge timeout, and its failure propagates', async () => {
  let attempts = 0;
  mock.method(globalThis, 'fetch', (_url: string, init: RequestInit) => {
    attempts++;
    return new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
  });
  // Make the 2 s pre-ack timeout fire quickly: AbortSignal.timeout is read at call time
  const realTimeout = AbortSignal.timeout.bind(AbortSignal);
  const requested: number[] = [];
  mock.method(AbortSignal, 'timeout', (ms: number) => (requested.push(ms), realTimeout(20)));
  const keepAlive = setTimeout(() => {}, 5_000);

  try {
    await assert.rejects(ticketOfInteraction(fakeInteraction()), (error: unknown) => error instanceof ApiError && error.code === 'timeout');
    assert.deepEqual(requested, [2_000]);
    assert.equal(attempts, 1, 'a retry would outlast the 3 s Discord allows');
  } finally {
    clearTimeout(keepAlive);
  }
});

test('a failing lookup is not retried either', async () => {
  const calls = stubFetch(apiError(503, 'http_503'));

  await assert.rejects(ticketOfInteraction(fakeInteraction()), ApiError);

  assert.equal(calls.length, 1);
});
