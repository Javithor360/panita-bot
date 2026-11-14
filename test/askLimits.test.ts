import './support';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAskLimits } from '../src/features/ask/limits';

const DAY = 86_400_000;

const make = (overrides: Partial<Parameters<typeof createAskLimits>[0]> = {}) => {
  let clock = 10 * DAY + 1000;
  const limits = createAskLimits(
    { cooldownMs: 20_000, dailyPerUser: 3, dailyGlobal: 5, maxInFlight: 2, ...overrides },
    () => clock,
  );
  return { limits, advance: (ms: number) => { clock += ms; } };
};

describe('/ask limits', () => {
  it('lets a member ask, then makes them wait', () => {
    const { limits, advance } = make();
    assert.equal(limits.tryAcquire('a'), 'ok');
    limits.release();
    assert.equal(limits.tryAcquire('a'), 'cooldown');
    assert.equal(limits.tryAcquire('b'), 'ok', 'another member is not affected');
    limits.release();
    advance(20_000);
    assert.equal(limits.tryAcquire('a'), 'ok');
  });

  it('caps the questions of a member per day and resets on the next day', () => {
    const { limits, advance } = make({ cooldownMs: 0, dailyGlobal: 100 });
    for (let i = 0; i < 3; i++) {
      assert.equal(limits.tryAcquire('a'), 'ok');
      limits.release();
    }
    assert.equal(limits.tryAcquire('a'), 'daily');
    assert.equal(limits.tryAcquire('b'), 'ok');
    limits.release();
    advance(DAY);
    assert.equal(limits.tryAcquire('a'), 'ok');
  });

  it('caps the questions of everybody per day', () => {
    const { limits } = make({ cooldownMs: 0, dailyPerUser: 100, maxInFlight: 100 });
    for (let i = 0; i < 5; i++) assert.equal(limits.tryAcquire(`user${i}`), 'ok');
    assert.equal(limits.tryAcquire('someone-else'), 'global');
  });

  it('limits the answers in progress, and frees a place when one finishes', () => {
    const { limits } = make({ cooldownMs: 0 });
    assert.equal(limits.tryAcquire('a'), 'ok');
    assert.equal(limits.tryAcquire('b'), 'ok');
    assert.equal(limits.tryAcquire('c'), 'busy');
    limits.release();
    assert.equal(limits.tryAcquire('c'), 'ok');
  });

  it('does not count a question that a limit stopped', () => {
    const { limits } = make({ dailyPerUser: 1 });
    assert.equal(limits.tryAcquire('a'), 'ok');
    limits.release();
    assert.equal(limits.tryAcquire('a'), 'daily');
    assert.equal(limits.tryAcquire('b'), 'ok');
    limits.release();
    // Only two questions were ever counted: the three left of the global cap are all free
    for (const id of ['c', 'd', 'e']) {
      assert.equal(limits.tryAcquire(id), 'ok');
      limits.release();
    }
    assert.equal(limits.tryAcquire('f'), 'global');
  });

  it('gives back the daily count of a question that was never answered', () => {
    const { limits } = make({ cooldownMs: 0, dailyPerUser: 1 });
    assert.equal(limits.tryAcquire('a'), 'ok');
    limits.refund('a');
    limits.release();
    assert.equal(limits.tryAcquire('a'), 'ok');
  });

  it('never goes below zero when released or refunded too often', () => {
    const { limits } = make({ cooldownMs: 0, maxInFlight: 1 });
    limits.release();
    limits.refund('nobody');
    assert.equal(limits.tryAcquire('a'), 'ok');
    assert.equal(limits.tryAcquire('b'), 'busy');
  });
});
