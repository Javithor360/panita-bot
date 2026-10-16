import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/lib/api/errors';
import type { PendingReset, ReportedDelivery } from '../src/lib/api/types';
import { createPasswordResetSync, type PasswordResetSyncDeps } from '../src/services/passwordResetSync';

const request = (id: string, delivery: PendingReset['delivery'] = 'dm'): PendingReset => ({ id, discord_id: '812345678901234567', delivery });

interface Harness {
  deps: PasswordResetSyncDeps;
  delivered: string[];
  reports: string[];
  scheduled: number[];
  errors: string[];
  poller: ReturnType<typeof createPasswordResetSync>;
  /** What the next polls list; the last answer repeats. */
  list(...answers: Array<PendingReset[] | Error>): void;
  /** What delivering does for the next requests; the last answer repeats. */
  deliverWith(...answers: Array<ReportedDelivery | Error>): void;
  reportWith(...answers: Array<undefined | Error>): void;
}

const harness = (): Harness => {
  const delivered: string[] = [];
  const reports: string[] = [];
  const scheduled: number[] = [];
  const errors: string[] = [];
  let lists: Array<PendingReset[] | Error> = [[]];
  let deliveries: Array<ReportedDelivery | Error> = ['delivered'];
  let reportAnswers: Array<undefined | Error> = [undefined];
  let polls = 0;
  let attempts = 0;
  let reported = 0;

  const deps: PasswordResetSyncDeps = {
    async fetchPending() {
      const answer = lists[Math.min(polls++, lists.length - 1)];
      if (answer instanceof Error) throw answer;
      return answer;
    },
    async deliver(item) {
      delivered.push(`${item.id}:${item.delivery}`);
      const answer = deliveries[Math.min(attempts++, deliveries.length - 1)];
      if (answer instanceof Error) throw answer;
      return answer;
    },
    async reportDelivery(id, status) {
      reports.push(`${id}:${status}`);
      const answer = reportAnswers[Math.min(reported++, reportAnswers.length - 1)];
      if (answer instanceof Error) throw answer;
    },
    schedule: (_callback, delayMs) => void scheduled.push(delayMs),
    logger: { log: () => {}, error: line => void errors.push(String(line)) },
  };

  return {
    deps, delivered, reports, scheduled, errors,
    poller: createPasswordResetSync(deps),
    list: (...next) => { lists = next; polls = 0; },
    deliverWith: (...next) => { deliveries = next; attempts = 0; },
    reportWith: (...next) => { reportAnswers = next; reported = 0; },
  };
};

test('a pending request is delivered and reported once, however often the API lists it', async () => {
  const h = harness();
  h.list([request('a')]);

  await h.poller.poll();
  await h.poller.poll();
  await h.poller.poll();

  assert.deepEqual(h.delivered, ['a:dm']);
  assert.deepEqual(h.reports, ['a:delivered']);
});

test('an empty poll still schedules the next one (it is the heartbeat)', async () => {
  const h = harness();

  await h.poller.poll();

  assert.deepEqual(h.scheduled, [5_000]);
  assert.deepEqual(h.delivered, []);
});

test('the next poll is scheduled before delivering, so a slow send cannot starve the heartbeat', async () => {
  const h = harness();
  h.list([request('a')]);
  const order: string[] = [];
  h.deps.schedule = () => void order.push('schedule');
  h.deps.deliver = async () => { order.push('deliver'); return 'delivered'; };

  await createPasswordResetSync(h.deps).poll();

  assert.deepEqual(order, ['schedule', 'deliver']);
});

test('closed DMs are reported, and the channel request of the same id is delivered afterwards', async () => {
  const h = harness();
  h.deliverWith('dms_closed', 'delivered');
  h.list([request('a', 'dm')], [request('a', 'channel')]);

  await h.poller.poll();
  await h.poller.poll();

  assert.deepEqual(h.delivered, ['a:dm', 'a:channel']);
  assert.deepEqual(h.reports, ['a:dms_closed', 'a:delivered']);
});

test('a DM that fails for another reason is tried again, then reported as failed', async () => {
  const h = harness();
  h.deliverWith(new Error('boom'));
  h.list([request('a')]);

  await h.poller.poll();
  await h.poller.poll();
  assert.deepEqual(h.reports, [], 'still being tried');
  await h.poller.poll();
  await h.poller.poll();

  assert.equal(h.delivered.length, 3, 'three attempts, no more');
  assert.deepEqual(h.reports, ['a:failed']);
});

test('a failed delivery to one request does not stop the others', async () => {
  const h = harness();
  h.deliverWith(new Error('boom'), 'delivered');
  h.list([request('a'), request('b')]);

  await h.poller.poll();

  assert.deepEqual(h.reports, ['b:delivered']);
});

test('a report that did not go through is retried, without sending the DM again', async () => {
  const h = harness();
  h.reportWith(new ApiError(503, 'unavailable', 'down'), undefined);
  h.list([request('a')]);

  await h.poller.poll();
  await h.poller.poll();
  await h.poller.poll();

  assert.deepEqual(h.delivered, ['a:dm']);
  assert.deepEqual(h.reports, ['a:delivered', 'a:delivered']);
});

test('a report the API refuses as final is not retried', async () => {
  const h = harness();
  h.reportWith(new ApiError(410, 'gone', 'expired'));
  h.list([request('a')]);

  await h.poller.poll();
  await h.poller.poll();

  assert.deepEqual(h.reports, ['a:delivered']);
});

test('requests being worked on are not started twice by an overlapping poll', async () => {
  const h = harness();
  let release: () => void = () => {};
  h.deps.deliver = async item => {
    h.delivered.push(item.id);
    await new Promise<void>(resolve => (release = resolve));
    return 'delivered';
  };
  h.list([request('a')]);
  const poller = createPasswordResetSync(h.deps);

  const first = poller.poll();
  await poller.poll(); // the slow send is still in flight
  release();
  await first;

  assert.deepEqual(h.delivered, ['a']);
});

test('a failing API backs off, logs once, and recovers', async () => {
  const h = harness();
  h.list(new Error('down'), new Error('down'), new Error('down'), []);

  await h.poller.poll();
  await h.poller.poll();
  await h.poller.poll();
  await h.poller.poll();

  assert.deepEqual(h.scheduled, [1_000, 2_000, 4_000, 5_000]);
  assert.equal(h.errors.length, 1, 'only the first failure is logged');
});

test('the backoff is capped', async () => {
  const h = harness();
  h.list(new Error('down'));

  for (let i = 0; i < 10; i++) await h.poller.poll();

  assert.equal(Math.max(...h.scheduled), 60_000);
});
