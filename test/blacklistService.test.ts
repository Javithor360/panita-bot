import { apiError, ok, silenceApiLogs, stubFetch } from './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { UserError } from '../src/core/errors';
import { blacklistDenial } from '../src/features/moderation/blacklist';
import {
  addToBlacklist,
  AlreadyBlacklistedError,
  BlacklistEntryAlreadyRevokedError,
  BlacklistEntryNotFoundError,
  blacklistEntryOf,
  listBlacklist,
  removeFromBlacklist,
} from '../src/services/blacklist';

beforeEach(silenceApiLogs);
afterEach(() => mock.restoreAll());

const entry = (userId: string) => ({
  id: '5b0e7a64-2c3d-4f19-8e61-9a47d3c0b2f1',
  user_id: userId,
  moderator_id: '790123456789012345',
  reason: 'Spam',
  created_at: '2026-11-19T18:30:00.000Z',
  expires_at: null,
  revoked_at: null,
  revoked_by: null,
  revoke_reason: null,
  active: true,
});

test('an entry is sent with the user, the moderator, a trimmed reason and the expiry when there is one', async () => {
  const until = new Date('2030-01-01T00:00:00.000Z');
  const calls = stubFetch(ok(entry('811'), {}, 201));

  await addToBlacklist({ userId: '811', moderatorId: '790', reason: '  Spam  ', expiresAt: until });

  assert.deepEqual(calls, [{
    method: 'POST',
    path: '/v1/discord/blacklist',
    body: { user_id: '811', moderator_id: '790', reason: 'Spam', expires_at: '2030-01-01T00:00:00.000Z' },
  }]);
});

test('a permanent entry sends no expiry, and an empty reason is refused before any request', async () => {
  const calls = stubFetch(ok(entry('812'), {}, 201));

  await addToBlacklist({ userId: '812', moderatorId: '790', reason: 'Spam' });
  assert.deepEqual((calls[0].body as Record<string, unknown>).expires_at, undefined);

  await assert.rejects(addToBlacklist({ userId: '812', moderatorId: '790', reason: '   ' }), UserError);
  assert.equal(calls.length, 1);
});

test('a second entry for the same user is an AlreadyBlacklistedError', async () => {
  stubFetch(apiError(409, 'conflict', { reason: 'already_blacklisted' }));
  await assert.rejects(addToBlacklist({ userId: '813', moderatorId: '790', reason: 'Spam' }), AlreadyBlacklistedError);
});

test('the list asks for the active entries and reports the total', async () => {
  const calls = stubFetch(ok([entry('814')], { meta: { count: 1, total: 4, limit: 100, offset: 0 } }));

  const page = await listBlacklist({ active: true });

  assert.match(calls[0].path, /^\/v1\/discord\/blacklist\?/);
  assert.match(calls[0].path, /active=true/);
  assert.equal(page.total, 4);
  assert.equal(page.entries.length, 1);
});

test('removing sends who removed it, and maps 404 and 409 to their errors', async () => {
  const calls = stubFetch(ok({ ...entry('815'), active: false }));
  await removeFromBlacklist(entry('815'), '790', ' Se disculpó ');
  assert.deepEqual(calls[0], {
    method: 'PATCH',
    path: '/v1/discord/blacklist/5b0e7a64-2c3d-4f19-8e61-9a47d3c0b2f1',
    body: { revoked_by: '790', reason: 'Se disculpó' },
  });

  stubFetch(apiError(404, 'not_found'));
  await assert.rejects(removeFromBlacklist(entry('815'), '790'), BlacklistEntryNotFoundError);

  stubFetch(apiError(409, 'conflict', { reason: 'already_revoked' }));
  await assert.rejects(removeFromBlacklist(entry('815'), '790'), BlacklistEntryAlreadyRevokedError);
});

test('the check is cached, and adding or removing forgets the cached answer', async () => {
  const calls = stubFetch(ok({ blacklisted: false, entry: null }));

  assert.equal(await blacklistEntryOf('816'), null);
  assert.equal(await blacklistEntryOf('816'), null);
  assert.equal(calls.length, 1);

  stubFetch(ok(entry('816'), {}, 201));
  await addToBlacklist({ userId: '816', moderatorId: '790', reason: 'Spam' });

  const after = stubFetch(ok({ blacklisted: true, entry: entry('816') }));
  assert.equal((await blacklistEntryOf('816'))?.reason, 'Spam');
  assert.equal(after.length, 1);
});

test('the check fails open when the API cannot answer', async () => {
  stubFetch(new Error('network down'));
  assert.equal(await blacklistEntryOf('817'), null);
});

test('a member on the blacklist is refused with the reason, and the Staff never is', async () => {
  stubFetch(ok({ blacklisted: true, entry: { ...entry('818'), reason: 'Spam' } }));
  const member = { id: '818', displayName: 'Ana', roles: { cache: new Map() } } as any;

  const denial = await blacklistDenial(member);
  assert.match(denial ?? '', /lista negra/);
  assert.match(denial ?? '', /Spam/);

  const staff = { id: '819', displayName: 'Mod', roles: { cache: new Map([[process.env.STAFF_ROLE_ID, true]]) } } as any;
  const calls = stubFetch(ok({ blacklisted: true, entry: entry('819') }));
  assert.equal(await blacklistDenial(staff), null);
  assert.equal(calls.length, 0);
});
