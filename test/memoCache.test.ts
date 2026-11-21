import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMemoCache } from '../src/lib/memoCache';

const HOUR = 3_600_000;
const TWO_MINUTES = 120_000;

const setup = () => {
  let clock = 1_000;
  const cache = createMemoCache<string>({ ttlMs: HOUR, missTtlMs: TWO_MINUTES, now: () => clock });
  return { cache, advance: (ms: number) => { clock += ms; } };
};

describe('memo cache', () => {
  it('loads once and serves the value until it expires', async () => {
    const { cache, advance } = setup();
    let loads = 0;
    const load = async () => `v${++loads}`;

    assert.equal(await cache.get('a', load), 'v1');
    assert.equal(await cache.get('a', load), 'v1');
    advance(HOUR - 1);
    assert.equal(await cache.get('a', load), 'v1');
    advance(1);
    assert.equal(await cache.get('a', load), 'v2');
    assert.equal(loads, 2);
  });

  it('keeps each key apart', async () => {
    const { cache } = setup();
    assert.equal(await cache.get('a', async () => 'A'), 'A');
    assert.equal(await cache.get('b', async () => 'B'), 'B');
  });

  it('remembers that a key has no value, but only for the short time', async () => {
    const { cache, advance } = setup();
    let loads = 0;
    const load = async () => (++loads === 1 ? null : 'now it exists');

    assert.equal(await cache.get('x', load), null);
    advance(TWO_MINUTES - 1);
    assert.equal(await cache.get('x', load), null);
    assert.equal(loads, 1);
    advance(1);
    assert.equal(await cache.get('x', load), 'now it exists');
  });

  it('shares one call between simultaneous questions for the same key', async () => {
    const { cache } = setup();
    let loads = 0;
    let finish!: (value: string) => void;
    const load = () => {
      loads++;
      return new Promise<string>(resolve => { finish = resolve; });
    };

    const first = cache.get('a', load);
    const second = cache.get('a', load);
    finish('shared');
    assert.deepEqual(await Promise.all([first, second]), ['shared', 'shared']);
    assert.equal(loads, 1);
  });

  it('does not remember a failure, and everyone waiting gets it', async () => {
    const { cache } = setup();
    let loads = 0;
    let fail!: (error: Error) => void;
    const failing = () => {
      loads++;
      return new Promise<string>((_, reject) => { fail = reject; });
    };

    const first = cache.get('a', failing);
    const second = cache.get('a', failing);
    fail(new Error('down'));
    await assert.rejects(first, /down/);
    await assert.rejects(second, /down/);

    assert.equal(await cache.get('a', async () => 'back'), 'back');
    assert.equal(loads, 1);
  });

  it('forgets a key on delete', async () => {
    const { cache } = setup();
    await cache.get('a', async () => 'old');
    cache.delete('a');
    assert.equal(await cache.get('a', async () => 'new'), 'new');
  });
});
