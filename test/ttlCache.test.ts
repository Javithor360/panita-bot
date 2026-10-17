import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTtlCache } from '../src/lib/ttlCache';

test('a value lives for the ttl and is gone after it', () => {
  let now = 1_000;
  const cache = createTtlCache<string>(500, () => now);

  cache.set('a', 'one');
  now += 499;
  assert.equal(cache.get('a'), 'one');
  now += 1;
  assert.equal(cache.get('a'), undefined);
});

test('setting a key again restarts its ttl, and delete removes it', () => {
  let now = 0;
  const cache = createTtlCache<number>(100, () => now);

  cache.set('a', 1);
  now = 90;
  cache.set('a', 2);
  now = 150;
  assert.equal(cache.get('a'), 2);

  cache.delete('a');
  assert.equal(cache.get('a'), undefined);
});

test('expired entries are swept as the cache grows', () => {
  let now = 0;
  const cache = createTtlCache<number>(10, () => now);
  for (let i = 0; i < 500; i++) cache.set(`old${i}`, i);

  now = 20;
  cache.set('fresh', 1);

  assert.equal(cache.get('old0'), undefined);
  assert.equal(cache.get('fresh'), 1);
});
