import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidTimeout, parseDuration, splitTimeAndReason } from '../src/features/moderation/duration';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test('durations are read in seconds, minutes, hours, days and weeks, alone or together', () => {
  assert.equal(parseDuration('45s'), 45_000);
  assert.equal(parseDuration('30m'), 30 * MIN);
  assert.equal(parseDuration('2h'), 2 * HOUR);
  assert.equal(parseDuration('1d'), DAY);
  assert.equal(parseDuration('1w'), 7 * DAY);
  assert.equal(parseDuration('1h30m'), 90 * MIN);
  assert.equal(parseDuration(' 10M '), 10 * MIN);
});

test('anything that is not a duration is null', () => {
  for (const text of ['', 'spam', '10', '0m', '5x', '1h 30m', 'm', '-5m', '1.5h']) assert.equal(parseDuration(text), null, text);
});

test('a time followed by the reason is split, with the time first', () => {
  assert.deepEqual(splitTimeAndReason('30m', 'spam'), { durationMs: 30 * MIN, reason: 'spam' });
  assert.deepEqual(splitTimeAndReason('2h', null), { durationMs: 2 * HOUR, reason: null });
});

test('when the first word is not a time, everything is the reason and the time stays unset', () => {
  assert.deepEqual(splitTimeAndReason('spam', 'en general'), { durationMs: null, reason: 'spam en general' });
  assert.deepEqual(splitTimeAndReason('spam', null), { durationMs: null, reason: 'spam' });
  assert.deepEqual(splitTimeAndReason('  ', ' x '), { durationMs: null, reason: 'x' });
  assert.deepEqual(splitTimeAndReason(null, null), { durationMs: null, reason: null });
});

test('Discord only accepts a timeout of up to 28 days', () => {
  assert.equal(isValidTimeout(28 * DAY), true);
  assert.equal(isValidTimeout(28 * DAY + 1), false);
  assert.equal(isValidTimeout(0), false);
  assert.equal(isValidTimeout(1000), true);
});
