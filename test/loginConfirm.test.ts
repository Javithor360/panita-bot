import { apiError, ok, silenceApiLogs, stubFetch } from './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/lib/api/errors';
import { confirmationMessage, confirmCode, isLoginCode, LOGIN_MESSAGES } from '../src/features/login/confirm';

beforeEach(() => silenceApiLogs());
afterEach(() => mock.restoreAll());

const ID = '812345678901234567';
const login = { application: 'Web' as const, username: 'Javithor360', requested_at: '2026-10-11T15:00:00.000Z', device_name: null, device_os: null };

test('isLoginCode accepts exactly four digits, trimmed, including a leading zero', () => {
  for (const text of ['4729', '0472', ' 4729 ', '4729\n']) assert.equal(isLoginCode(text), true, text);
});

test('isLoginCode accepts a launcher serial in any case, with dashes, spaces or neither', () => {
  for (const text of ['K7M2-X9QD-4HNP', 'k7m2-x9qd-4hnp', ' K7M2 X9QD 4HNP ', 'K7M2X9QD4HNP', 'K7M2-X9QD 4HNP', 'LLLL-2222-ZZZZ']) {
    assert.equal(isLoginCode(text), true, text);
  }
});

test('isLoginCode rejects everything else', () => {
  for (const text of [
    '', '472', '47290', 'abcd', '47 29', '4729!', '!confirm 4729', 'mi código es 4729', '４７２９',
    'K7M2-X9QD-4HN', 'K7M2-X9QD-4HNPP', 'K7M2--X9QD-4HNP', 'K7M2_X9QD_4HNP', 'código K7M2-X9QD-4HNP', 'K7M2-X9QD-4HNP\nhola',
    // 0, 1, I and O are not in the serial alphabet
    'K7M2-X9QD-4HN1', 'K7M2-X9QD-4HN0', 'K7M2-X9QD-4HNO', 'K7M2-X9QI-4HNP',
  ]) {
    assert.equal(isLoginCode(text), false, text);
  }
});

test('the confirmation names who, where and when, and warns', () => {
  const message = confirmationMessage({ kind: 'confirmed', login });

  assert.match(message, /\*\*Javithor360\*\*/);
  assert.match(message, /\*\*Web\*\*/);
  assert.match(message, /<t:1791730800:R>/);
  assert.match(message, /Confirma solo inicios de sesión que tú mismo empezaste/);
  assert.match(message, /`\/sessions`/);
  assert.doesNotMatch(message, /token|OTP/i);
});

test('the launcher is named as such', () => {
  assert.match(confirmationMessage({ kind: 'confirmed', login: { ...login, application: 'Launcher' } }), /\*\*Launcher\*\*/);
});

test('the confirmation shows the device, and skips what is null', () => {
  const launcher = { ...login, application: 'Launcher' as const };
  const show = (device_name: string | null, device_os: string | null) =>
    confirmationMessage({ kind: 'confirmed', login: { ...launcher, device_name, device_os } });

  assert.match(show('DESKTOP-ABC', 'Windows 11'), /\*\*Launcher\*\* desde `DESKTOP-ABC` · `Windows 11` \(<t:1791730800:R>\)/);
  assert.match(show('DESKTOP-ABC', null), /\*\*Launcher\*\* desde `DESKTOP-ABC` \(<t:/);
  assert.match(show(null, 'Windows 11'), /\*\*Launcher\*\* desde `Windows 11` \(<t:/);
  assert.match(show(null, null), /\*\*Launcher\*\* \(<t:/);
  assert.doesNotMatch(show('  ', '``'), /desde/);
});

test('a device name typed by the client cannot render as markdown, a mention, a timestamp or a link', () => {
  const message = confirmationMessage({
    kind: 'confirmed',
    login: {
      ...login,
      application: 'Launcher',
      device_name: '<@123456789012345678> <t:1:R> **gratis** [x](https://evil.test)\n@everyone ```',
      device_os: 'x'.repeat(200),
    },
  });
  const lines = message.split('\n');

  assert.equal(lines.length, 3);
  assert.doesNotMatch(lines[0], /<@|<t:1:R>/);
  // Everything the client typed sits inside code spans, on one line, clipped
  assert.match(lines[0], /desde `[^`<>]*` · `x{40,}…` \(<t:/);
});

test('the other outcomes have their own short texts', () => {
  assert.equal(confirmationMessage({ kind: 'code_not_found' }), LOGIN_MESSAGES.codeNotFound);
  assert.equal(confirmationMessage({ kind: 'not_activated' }), LOGIN_MESSAGES.notActivated);
  assert.match(LOGIN_MESSAGES.notActivated, /\/register/);
});

test('confirmCode returns the login the API confirmed', async () => {
  const calls = stubFetch(ok(login));

  assert.deepEqual(await confirmCode(ID, '4729'), { kind: 'confirmed', login });
  assert.deepEqual(calls[0].body, { discord_id: ID, code: '4729' });
});

test('confirmCode turns the expected rejections into outcomes', async () => {
  stubFetch(apiError(404, 'not_found', { reason: 'code_not_found' }));
  assert.deepEqual(await confirmCode(ID, '4729'), { kind: 'code_not_found' });

  mock.restoreAll();
  silenceApiLogs();
  stubFetch(apiError(409, 'conflict', { reason: 'not_activated' }));
  assert.deepEqual(await confirmCode(ID, '4729'), { kind: 'not_activated' });
});

test('confirmCode throws when the API is down, so the caller can say so', async () => {
  stubFetch(apiError(503, 'http_503'));

  await assert.rejects(confirmCode(ID, '4729'), (error: unknown) => error instanceof ApiError && error.transient);
});
