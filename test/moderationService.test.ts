import { apiError, ok, silenceApiLogs, stubFetch } from './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/lib/api';
import { UserError } from '../src/core/errors';
import {
  createWarning,
  listWarnings,
  revokeWarning,
  WarningAlreadyRevokedError,
  WarningNotFoundError,
} from '../src/services/moderation';

beforeEach(silenceApiLogs);
afterEach(() => mock.restoreAll());

const warning = {
  id: '5b0e7a64-2c3d-4f19-8e61-9a47d3c0b2f1',
  user_id: '812345678901234567',
  moderator_id: '790123456789012345',
  reason: 'Spam',
  created_at: '2026-11-19T18:30:00.000Z',
  revoked_at: null,
  revoked_by: null,
  revoke_reason: null,
};

test('a warning is sent with the member, the moderator and a trimmed reason, and answers with the active count', async () => {
  const calls = stubFetch(ok({ warning, active_count: 3 }, {}, 201));

  const result = await createWarning({ userId: warning.user_id, moderatorId: warning.moderator_id, reason: '  Spam  ' });

  assert.deepEqual(calls, [{
    method: 'POST',
    path: '/v1/discord/warnings',
    body: { user_id: warning.user_id, moderator_id: warning.moderator_id, reason: 'Spam' },
  }]);
  assert.equal(result.active_count, 3);
  assert.equal(result.warning.id, warning.id);
});

test('an empty or too long reason is refused before any request', async () => {
  const calls = stubFetch(ok({}));

  await assert.rejects(createWarning({ userId: '1', moderatorId: '2', reason: '   ' }), UserError);
  await assert.rejects(createWarning({ userId: '1', moderatorId: '2', reason: 'x'.repeat(513) }), UserError);
  assert.equal(calls.length, 0);
});

test('a reason of exactly 512 characters is accepted', async () => {
  const calls = stubFetch(ok({ warning, active_count: 1 }, {}, 201));
  await createWarning({ userId: '1', moderatorId: '2', reason: 'x'.repeat(512) });
  assert.equal(calls.length, 1);
});

test('the active warnings of a member are asked for with the filter, and the total comes from the meta', async () => {
  const calls = stubFetch(ok([warning], { meta: { count: 1, total: 4, limit: 100, offset: 0 } }));

  const history = await listWarnings('812345678901234567', { active: true });

  assert.deepEqual(calls, [{ method: 'GET', path: '/v1/discord/users/812345678901234567/warnings?active=true&limit=100', body: undefined }]);
  assert.equal(history.total, 4);
  assert.deepEqual(history.warnings, [warning]);
});

test('without the filter the whole history is asked for', async () => {
  const calls = stubFetch(ok([], { meta: { count: 0, total: 0, limit: 100, offset: 0 } }));
  const history = await listWarnings('1');
  assert.equal(calls[0].path, '/v1/discord/users/1/warnings?active=false&limit=100');
  assert.deepEqual(history, { warnings: [], total: 0 });
});

test('revoking sends who did it and, when given, why', async () => {
  const revoked = { ...warning, revoked_at: '2026-11-20T00:00:00.000Z', revoked_by: '790123456789012345', revoke_reason: 'Malentendido' };
  const calls = stubFetch(ok(revoked));

  const result = await revokeWarning(warning.id, '790123456789012345', ' Malentendido ');

  assert.deepEqual(calls, [{
    method: 'PATCH',
    path: `/v1/discord/warnings/${warning.id}`,
    body: { revoked_by: '790123456789012345', reason: 'Malentendido' },
  }]);
  assert.equal(result.revoked_by, '790123456789012345');
});

test('revoking without a reason sends only who did it', async () => {
  const calls = stubFetch(ok(warning));
  await revokeWarning(warning.id, '1');
  assert.deepEqual(calls[0].body, { revoked_by: '1' });
});

test('a warning that is gone or was revoked first has its own error', async () => {
  stubFetch(apiError(404, 'not_found'));
  await assert.rejects(revokeWarning(warning.id, '1'), WarningNotFoundError);

  mock.restoreAll();
  silenceApiLogs();
  stubFetch(apiError(409, 'conflict', { reason: 'already_revoked' }));
  await assert.rejects(revokeWarning(warning.id, '1'), WarningAlreadyRevokedError);
});

test('any other failure of the API is not hidden', async () => {
  stubFetch(apiError(500, 'internal_error'));
  await assert.rejects(revokeWarning(warning.id, '1'), (error: unknown) => error instanceof ApiError && error.status === 500);
});
