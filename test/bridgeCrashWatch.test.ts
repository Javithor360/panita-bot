import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchForCrashes } from '../src/features/minecraft/crashWatch';
import type { ConnectionEvent } from '../src/features/minecraft/link';
import type { HelloFrame, ModFrame } from '../src/features/minecraft/protocol';

const hello = (startedAt: string): HelloFrame => ({
  type: 'hello',
  protocol: 1,
  modVersion: '0.0.1',
  minecraftVersion: '26.3',
  startedAt,
  maxPlayers: 20,
});
const RUN_1 = '2026-10-17T10:00:00Z';
const RUN_2 = '2026-10-17T11:00:00Z';

const setup = (options: { onCrash?: () => Promise<void> | void } = {}) => {
  const frames: Array<(frame: ModFrame) => void> = [];
  const connections: Array<(event: ConnectionEvent) => void> = [];
  const calls: string[] = [];
  const errors: unknown[] = [];
  const timers: Array<{ run: () => void; ms: number; cancelled: boolean }> = [];

  watchForCrashes({
    link: { onFrame: handler => void frames.push(handler), onConnection: handler => void connections.push(handler) },
    graceSeconds: 90,
    onStarted: () => void calls.push('started'),
    onStopping: () => void calls.push('stopping'),
    onCrash: options.onCrash ?? (() => void calls.push('crash')),
    logger: { error: (...args: unknown[]) => void errors.push(args) },
    schedule: (run, ms) => {
      const timer = { run, ms, cancelled: false };
      timers.push(timer);
      return () => void (timer.cancelled = true);
    },
  });

  const settle = () => new Promise(resolve => setImmediate(resolve));
  return {
    calls,
    errors,
    timers,
    connect: async (startedAt: string) => (connections.forEach(handler => handler({ type: 'connected', hello: hello(startedAt) })), settle()),
    lose: async () => (connections.forEach(handler => handler({ type: 'disconnected' })), settle()),
    event: async (kind: 'started' | 'stopping') => (frames.forEach(handler => handler({ type: 'event', kind })), settle()),
    /** Lets the grace time pass for the timers that are still waiting. */
    elapse: async () => {
      for (const timer of timers) if (!timer.cancelled) timer.run();
      await settle();
    },
  };
};

test('a server that is gone for longer than the grace time without saying it was stopping crashed, once', async () => {
  const { calls, timers, connect, lose, elapse } = setup();
  await connect(RUN_1);

  await lose();
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 90_000);
  assert.deepEqual(calls, []);

  await elapse();
  await elapse();
  assert.deepEqual(calls, ['crash']);
});

test('a line that comes back inside the grace time was a blip of the network, not a crash', async () => {
  const { calls, timers, connect, lose, elapse } = setup();
  await connect(RUN_1);

  await lose();
  await connect(RUN_1);
  await elapse();

  assert.equal(timers[0].cancelled, true);
  assert.deepEqual(calls, []);
});

test('a server that said it was stopping did not crash, whether or not it comes back', async () => {
  const { calls, timers, connect, lose, event, elapse } = setup();
  await connect(RUN_1);
  await event('stopping');

  await lose();
  await elapse();
  await connect(RUN_2);
  await elapse();

  assert.deepEqual(timers, []);
  assert.deepEqual(calls, ['stopping']);
});

test('a server that comes back as a new run without having said it was stopping crashed and restarted, and says it once', async () => {
  const { calls, connect, lose, elapse } = setup();
  await connect(RUN_1);

  await lose();
  await connect(RUN_2);
  await elapse();

  assert.deepEqual(calls, ['crash']);
});

test('a crash that was reported after the grace time is not reported again when the server comes back as a new run', async () => {
  const { calls, connect, lose, elapse } = setup();
  await connect(RUN_1);
  await lose();
  await elapse();

  await connect(RUN_2);

  assert.deepEqual(calls, ['crash']);
});

test('after a crash and a return, the next crash is reported too', async () => {
  const { calls, connect, lose, elapse } = setup();
  await connect(RUN_1);
  await lose();
  await elapse();
  await connect(RUN_1);

  await lose();
  await elapse();

  assert.deepEqual(calls, ['crash', 'crash']);
});

test('the first connection after the bot starts is never a crash, whatever the server did before', async () => {
  const { calls, connect, elapse } = setup();

  await connect(RUN_2);
  await elapse();

  assert.deepEqual(calls, []);
});

test('tells when the server starts and stops', async () => {
  const { calls, connect, event } = setup();
  await connect(RUN_1);

  await event('started');
  await event('stopping');

  assert.deepEqual(calls, ['started', 'stopping']);
});

test('losing the line twice does not start two timers', async () => {
  const { timers, connect, lose } = setup();
  await connect(RUN_1);

  await lose();
  await lose();

  assert.equal(timers.length, 1);
});

test('a failure while handling a crash is logged and never thrown', async () => {
  const { errors, connect, lose, elapse } = setup({ onCrash: () => Promise.reject(new Error('boom')) });
  await connect(RUN_1);
  await lose();

  await elapse();

  assert.equal(errors.length, 1);
});
