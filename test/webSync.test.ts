import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWebSync, type SyncMember, type WebSyncDeps } from '../src/services/webSync';
import type { SyncEvent } from '../src/lib/api/types';

let nextId = 1;
const event = (overrides: Partial<SyncEvent> = {}): SyncEvent => ({
  id: nextId++,
  kind: 'role',
  action: 'add',
  user_id: 1,
  discord_id: 'u1',
  discord_role_id: 'r1',
  origin: 'web',
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

/** A fake guild member who holds the given roles and records every change. */
const fakeMember = (held: string[] = []) => {
  const roles = new Set(held);
  const changes: string[] = [];
  const member: SyncMember = {
    roles: {
      cache: { has: id => roles.has(id) },
      add: async id => (roles.add(id), changes.push(`add:${id}`)),
      remove: async id => (roles.delete(id), changes.push(`remove:${id}`)),
    },
  };
  return { member, changes, roles };
};

interface Harness {
  deps: WebSyncDeps;
  requests: Array<{ after: number | 'latest'; limit: number }>;
  scheduled: number[];
  logs: string[];
  errors: string[];
  locks: string[];
  members: Map<string, ReturnType<typeof fakeMember>>;
  /** Events returned by the next fetches (one array per request); the last repeats. */
  respond: (...pages: Array<SyncEvent[] | Error>) => void;
  setGlobalLock(locked: boolean): void;
  poller: ReturnType<typeof createWebSync>;
}

const harness = (cursorOnStart = 10): Harness => {
  const requests: Harness['requests'] = [];
  const scheduled: number[] = [];
  const logs: string[] = [];
  const errors: string[] = [];
  const locks: string[] = [];
  const members = new Map<string, ReturnType<typeof fakeMember>>();
  let pages: Array<SyncEvent[] | Error> = [[]];
  let call = 0;
  let globalLock = false;

  const deps: WebSyncDeps = {
    async fetchEvents(after, limit) {
      requests.push({ after, limit });
      if (after === 'latest') return { events: [], cursor: cursorOnStart };
      const page = pages[Math.min(call++, pages.length - 1)];
      if (page instanceof Error) throw page;
      return { events: page, cursor: page.length ? page[page.length - 1].id : (after as number) };
    },
    fetchMember: async id => members.get(id)?.member ?? null,
    isGlobalSyncLocked: () => globalLock,
    withSyncLock: async (id, action) => (locks.push(id), action()),
    schedule: (_callback, delayMs) => void scheduled.push(delayMs),
    logger: { log: line => void logs.push(line), error: line => void errors.push(String(line)) },
  };

  return {
    deps, requests, scheduled, logs, errors, locks, members,
    respond: (...next) => { pages = next; call = 0; },
    setGlobalLock: locked => { globalLock = locked; },
    poller: createWebSync(deps),
  };
};

/** Starts the poller (asks for the latest cursor) and clears the bookkeeping. */
const started = async (cursorOnStart = 10) => {
  const h = harness(cursorOnStart);
  await h.poller.poll();
  h.requests.length = 0;
  h.scheduled.length = 0;
  h.logs.length = 0;
  return h;
};

test('starts from the latest cursor, applies nothing and schedules the next poll in 5 s', async () => {
  const h = harness(42);

  await h.poller.poll();

  assert.deepEqual(h.requests, [{ after: 'latest', limit: 1 }]);
  assert.deepEqual(h.scheduled, [5_000]);
  assert.match(h.logs[0], /cursor 42/);
});

test('applies a role the web added and removes one the web removed', async () => {
  const h = await started();
  const member = fakeMember(['r2']);
  h.members.set('u1', member);
  h.respond([event({ action: 'add', discord_role_id: 'r1' }), event({ action: 'remove', discord_role_id: 'r2' })]);

  await h.poller.poll();

  assert.deepEqual(member.changes, ['add:r1', 'remove:r2']);
  assert.deepEqual(h.locks, ['u1', 'u1']);
  assert.equal(h.logs.length, 2);
});

test('the cursor advances, and each poll asks from 20 behind it', async () => {
  const h = await started(100);
  h.members.set('u1', fakeMember());

  h.respond([event({ id: 101 }), event({ id: 105 })]);
  await h.poller.poll();
  h.respond([]);
  await h.poller.poll();

  assert.deepEqual(h.requests.map(r => r.after), [80, 85]);
  assert.ok(h.requests.every(r => r.limit === 100));
});

test('the overlap window never asks for a negative cursor', async () => {
  const h = await started(5);

  await h.poller.poll();

  assert.equal(h.requests[0].after, 0);
});

test('an event seen again in the overlap window is applied once', async () => {
  const h = await started(100);
  const member = fakeMember();
  h.members.set('u1', member);
  const e = event({ id: 101, action: 'add' });

  h.respond([e]);
  await h.poller.poll();
  h.respond([e]); // returned again because of the overlap
  await h.poller.poll();

  assert.deepEqual(member.changes, ['add:r1']);
  assert.equal(h.locks.length, 1);
});

test('an event that commits behind the cursor is still applied', async () => {
  const h = await started(100);
  const member = fakeMember();
  h.members.set('u1', member);

  h.respond([event({ id: 105, discord_role_id: 'r5' })]);
  await h.poller.poll();
  h.respond([event({ id: 102, discord_role_id: 'r2' }), event({ id: 105, discord_role_id: 'r5' })]);
  await h.poller.poll();

  assert.deepEqual(member.changes, ['add:r5', 'add:r2']);
});

test('events caused by the bot are skipped', async () => {
  const h = await started();
  const member = fakeMember();
  h.members.set('u1', member);
  h.respond([event({ origin: 'bot' })]);

  await h.poller.poll();

  assert.deepEqual(member.changes, []);
  assert.equal(h.locks.length, 0);
});

test('events seen while /systemsync runs are consumed and dropped, not applied later', async () => {
  const h = await started(100);
  const member = fakeMember();
  h.members.set('u1', member);
  const e = event({ id: 101 });

  h.setGlobalLock(true);
  h.respond([e]);
  await h.poller.poll();
  h.setGlobalLock(false);
  h.respond([e]);
  await h.poller.poll();

  assert.deepEqual(member.changes, []);
});

test('a member who left the server is ignored, and the poll goes on', async () => {
  const h = await started();
  const present = fakeMember();
  h.members.set('u2', present); // u1 is not in the guild
  h.respond([event({ discord_id: 'u1' }), event({ discord_id: 'u2' })]);

  await h.poller.poll();

  assert.deepEqual(present.changes, ['add:r1']);
  assert.deepEqual(h.errors, []);
});

test('a state that already matches changes nothing', async () => {
  const h = await started();
  const member = fakeMember(['r1']);
  h.members.set('u1', member);
  h.respond([event({ action: 'add', discord_role_id: 'r1' }), event({ action: 'remove', discord_role_id: 'r9' })]);

  await h.poller.poll();

  assert.deepEqual(member.changes, []);
  assert.equal(h.locks.length, 0);
});

test('an event that fails to apply is logged and the others still run', async () => {
  const h = await started();
  const broken = fakeMember();
  broken.member.roles.add = async () => { throw new Error('Missing Permissions'); };
  const fine = fakeMember();
  h.members.set('u1', broken);
  h.members.set('u2', fine);
  h.respond([event({ discord_id: 'u1' }), event({ discord_id: 'u2' })]);

  await h.poller.poll();

  assert.deepEqual(fine.changes, ['add:r1']);
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0], /Could not apply event/);
  assert.deepEqual(h.scheduled, [5_000]);
});

test('a full page is followed at once by another request; a short one ends the poll', async () => {
  const h = await started(0);
  h.members.set('u1', fakeMember());
  const full = Array.from({ length: 100 }, (_, i) => event({ id: i + 1, origin: 'bot' }));
  h.respond(full, [event({ id: 101, origin: 'bot' })]);

  await h.poller.poll();

  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.requests.map(r => r.after), [0, 80]);
  assert.deepEqual(h.scheduled, [5_000]);
});

test('failures back off from 1 s doubling up to 60 s, log once, then recover with a log', async () => {
  const h = await started();
  h.respond(new Error('503'));

  for (let i = 0; i < 9; i++) await h.poller.poll();

  assert.deepEqual(h.scheduled, [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000]);
  assert.equal(h.errors.length, 1, 'only the first failure is logged');

  h.respond([]);
  await h.poller.poll();
  assert.equal(h.scheduled.at(-1), 5_000);
  assert.ok(h.logs.some(line => /Recovered/.test(line)));

  // and the next failure starts from 1 s again and is logged again
  h.respond(new Error('503'));
  await h.poller.poll();
  assert.equal(h.scheduled.at(-1), 1_000);
  assert.equal(h.errors.length, 2);
});

test('a failure while asking for the first cursor is retried until it works', async () => {
  const h = harness(7);
  let attempts = 0;
  const original = h.deps.fetchEvents;
  h.deps.fetchEvents = async (after, limit) => {
    if (++attempts === 1) throw new Error('down');
    return original(after, limit);
  };
  const poller = createWebSync(h.deps);

  await poller.poll();
  await poller.poll();
  await poller.poll();

  assert.deepEqual(h.scheduled, [1_000, 5_000, 5_000]);
  assert.deepEqual(h.requests.map(r => r.after), ['latest', 0]);
});

test('the next poll is only scheduled once the current one has ended', async () => {
  const h = harness(1);
  let running = false;
  h.deps.fetchEvents = async () => {
    running = true;
    await new Promise(resolve => setImmediate(resolve));
    running = false;
    return { events: [], cursor: 1 };
  };
  h.deps.schedule = (_callback, delayMs) => {
    assert.equal(running, false, 'scheduled while a request was still in flight');
    h.scheduled.push(delayMs);
  };

  await createWebSync(h.deps).poll();

  assert.deepEqual(h.scheduled, [5_000]);
});

test('remembers only the newest 500 event ids', async () => {
  const h = await started(0);
  const member = fakeMember();
  h.members.set('u1', member);
  const page = (from: number) => Array.from({ length: 100 }, (_, i) => event({ id: from + i, origin: 'bot' }));

  // 600 ids in full pages, followed by a short page that ends the poll
  h.respond(page(1), page(101), page(201), page(301), page(401), page(501), []);
  await h.poller.poll();
  assert.equal(h.requests.length, 7);

  h.respond([event({ id: 1, origin: 'web', discord_role_id: 'old' })]); // forgotten: applied
  await h.poller.poll();
  h.respond([event({ id: 600, origin: 'web', discord_role_id: 'recent' })]); // remembered: skipped
  await h.poller.poll();

  assert.deepEqual(member.changes, ['add:old']);
});
