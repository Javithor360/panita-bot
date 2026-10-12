import { apiError, ok, silenceApiLogs, stubFetch } from './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/lib/api/errors';
import {
  CodeNotFoundError,
  confirmLogin,
  listSessions,
  revokeAllSessions,
  revokeSession,
} from '../src/services/sessions';
import { NotActivatedError } from '../src/services/users';

beforeEach(() => silenceApiLogs());
afterEach(() => mock.restoreAll());

const ID = '812345678901234567';
const SESSION_ID = '7d1f4c2a-5b3e-4a86-9c10-2f8e6b3d9a41';

test('confirmLogin posts the discord id and the code and returns what the bot may show', async () => {
  const confirmed = { application: 'Web', username: 'Javithor360', requested_at: '2026-10-11T15:00:00.000Z' };
  const calls = stubFetch(ok(confirmed));

  assert.deepEqual(await confirmLogin(ID, '0472'), confirmed);
  assert.deepEqual(calls, [{
    method: 'POST',
    path: '/v1/discord/login-requests/confirm',
    body: { discord_id: ID, code: '0472' },
  }]);
});

test('confirmLogin never retries, even after a transient failure', async () => {
  const calls = stubFetch(apiError(503, 'http_503'), ok({ application: 'Web', username: 'x', requested_at: '2026-10-11T15:00:00.000Z' }));

  await assert.rejects(confirmLogin(ID, '4729'), (error: unknown) => error instanceof ApiError && error.status === 503);
  assert.equal(calls.length, 1);

  mock.restoreAll();
  silenceApiLogs();
  const network = stubFetch(new TypeError('fetch failed'));
  await assert.rejects(confirmLogin(ID, '4729'), (error: unknown) => error instanceof ApiError && error.status === 0);
  assert.equal(network.length, 1);
});

test('confirmLogin maps an unknown code to CodeNotFoundError', async () => {
  stubFetch(apiError(404, 'not_found', { reason: 'code_not_found' }));

  await assert.rejects(confirmLogin(ID, '4729'), CodeNotFoundError);
});

test('confirmLogin maps a disabled or missing account to NotActivatedError, from the reason or the code', async () => {
  for (const response of [apiError(409, 'conflict', { reason: 'not_activated' }), apiError(409, 'not_activated')]) {
    mock.restoreAll();
    silenceApiLogs();
    stubFetch(response);
    await assert.rejects(confirmLogin(ID, '4729'), NotActivatedError);
  }
});

test('confirmLogin lets every other failure through untouched', async () => {
  const cases = [
    apiError(404, 'not_found'), // a 404 that is not about the code
    apiError(409, 'conflict', { reason: 'something_else' }),
    apiError(400, 'invalid_request'),
    apiError(401, 'unauthenticated'),
    apiError(500, 'internal_error'),
  ];

  for (const response of cases) {
    mock.restoreAll();
    silenceApiLogs();
    stubFetch(response);
    await assert.rejects(confirmLogin(ID, '4729'), (error: unknown) => error instanceof ApiError);
  }
});

test('listSessions reads the sessions of the member', async () => {
  const sessions = [{
    id: SESSION_ID,
    client: 'web',
    label: 'Web',
    created_at: '2026-10-11T15:00:00.000Z',
    last_used_at: '2026-10-11T16:20:00.000Z',
    expires_at: '2026-11-10T15:00:00.000Z',
  }];
  const calls = stubFetch(ok(sessions, { meta: { count: 1 } }));

  assert.deepEqual(await listSessions(ID), sessions);
  assert.deepEqual(calls, [{ method: 'GET', path: `/v1/discord/users/${ID}/sessions`, body: undefined }]);
});

test('listSessions treats a member with no account as having no sessions', async () => {
  stubFetch(apiError(404, 'not_found'));

  assert.deepEqual(await listSessions(ID), []);
});

test('listSessions lets other failures through', async () => {
  stubFetch(apiError(500, 'internal_error'));

  await assert.rejects(listSessions(ID), (error: unknown) => error instanceof ApiError && error.status === 500);
});

test('revokeSession deletes one session, which the API answers with an empty 204', async () => {
  const calls = stubFetch(new Response(null, { status: 204 }));

  assert.equal(await revokeSession(ID, SESSION_ID), true);
  assert.deepEqual(calls, [{ method: 'DELETE', path: `/v1/discord/users/${ID}/sessions/${SESSION_ID}`, body: undefined }]);
});

test('revokeSession treats a session that is already gone as done', async () => {
  stubFetch(apiError(404, 'not_found'));

  assert.equal(await revokeSession(ID, SESSION_ID), false);
});

test('revokeSession lets other failures through', async () => {
  stubFetch(apiError(401, 'unauthenticated'));

  await assert.rejects(revokeSession(ID, SESSION_ID), (error: unknown) => error instanceof ApiError && error.status === 401);
});

test('revokeAllSessions deletes the collection and returns how many were open', async () => {
  const calls = stubFetch(ok({ revoked: 3 }));

  assert.equal(await revokeAllSessions(ID), 3);
  assert.deepEqual(calls, [{ method: 'DELETE', path: `/v1/discord/users/${ID}/sessions`, body: undefined }]);
});

test('revokeAllSessions reports 0 for a member with no account', async () => {
  stubFetch(apiError(404, 'not_found'));

  assert.equal(await revokeAllSessions(ID), 0);
});
