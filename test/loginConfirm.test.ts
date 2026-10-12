import { apiError, ok, silenceApiLogs, stubFetch } from './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/lib/api/errors';
import { confirmationMessage, confirmCode, isLoginCode, LOGIN_MESSAGES } from '../src/features/login/confirm';

beforeEach(() => silenceApiLogs());
afterEach(() => mock.restoreAll());

const ID = '812345678901234567';
const login = { application: 'Web' as const, username: 'Javithor360', requested_at: '2026-10-11T15:00:00.000Z' };

test('isLoginCode accepts exactly four digits, trimmed, including a leading zero', () => {
  for (const text of ['4729', '0472', ' 4729 ', '4729\n']) assert.equal(isLoginCode(text), true, text);
});

test('isLoginCode rejects everything else', () => {
  for (const text of ['', '472', '47290', 'abcd', '47 29', '4729!', '!confirm 4729', 'mi código es 4729', '４７２９']) {
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
