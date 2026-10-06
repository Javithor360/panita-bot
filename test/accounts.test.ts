import { apiError, ok, silenceApiLogs, stubFetch } from './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { GuildMember } from 'discord.js';
import { ApiError } from '../src/lib/api/errors';
import { resyncMembers, syncMemberRoles } from '../src/services/memberSync';
import { unmapDiscordRole } from '../src/services/roles';
import {
  activateAccount,
  AlreadyActivatedError,
  deleteUsersByDiscordIds,
  ensureUser,
  IgnTakenError,
  InvalidActivationError,
  syncProfile,
  UserNotFoundError,
} from '../src/services/users';

beforeEach(() => silenceApiLogs());
afterEach(() => mock.restoreAll());

const ID = '812345678901234567';
const user = { id: 42, discord_id: ID, enabled: false, ign: null };

test('ensureUser sends the profile with PUT and returns the answer', async () => {
  const calls = stubFetch(ok({ user, created: true }, {}, 201));

  const result = await ensureUser({
    discordId: ID,
    username: 'javi',
    avatarUrl: 'https://cdn.discordapp.com/a.png',
    joinedAt: new Date('2026-03-14T18:22:05.000Z'),
  });

  assert.deepEqual(result, { user, created: true });
  assert.deepEqual(calls, [{
    method: 'PUT',
    path: `/v1/discord/users/${ID}`,
    body: { username: 'javi', avatar_url: 'https://cdn.discordapp.com/a.png', joined_at: '2026-03-14T18:22:05.000Z' },
  }]);
});

test('ensureUser sends null when the join date is unknown, and is retried after a transient failure', async () => {
  const calls = stubFetch(new TypeError('fetch failed'), ok({ user, created: false }));
  mock.method(globalThis, 'setTimeout', (fn: () => void) => { fn(); return 0 as unknown as NodeJS.Timeout; });

  await ensureUser({ discordId: ID, username: 'javi', avatarUrl: 'https://cdn.discordapp.com/a.png' });

  assert.equal(calls.length, 2);
  assert.equal((calls[0].body as { joined_at: unknown }).joined_at, null);
});

test('syncProfile sends only the fields that changed', async () => {
  const calls = stubFetch(ok({ updated: 1 }));

  assert.equal(await syncProfile(ID, { avatarUrl: 'https://cdn.discordapp.com/a.png' }), 1);
  assert.equal(await syncProfile(ID, { username: 'nuevo' }), 1);

  assert.deepEqual(calls.map(c => [c.method, c.path, c.body]), [
    ['PATCH', `/v1/discord/users/${ID}/profile`, { avatar_url: 'https://cdn.discordapp.com/a.png' }],
    ['PATCH', `/v1/discord/users/${ID}/profile`, { username: 'nuevo' }],
  ]);
});

test('syncProfile makes no request when there is nothing to update, and 0 means no account', async () => {
  let calls = stubFetch(ok({ updated: 0 }));
  assert.equal(await syncProfile(ID, {}), 0);
  assert.equal(calls.length, 0);

  assert.equal(await syncProfile(ID, { username: 'x' }), 0);
  assert.equal(calls.length, 1);
});

test('activateAccount posts the ign and the password and never retries', async () => {
  const calls = stubFetch(apiError(503, 'http_503'));

  await assert.rejects(activateAccount(ID, 'Steve', 'Panita#2026'), (error: unknown) => error instanceof ApiError && error.status === 503);

  assert.deepEqual(calls, [{ method: 'POST', path: `/v1/discord/users/${ID}/activate`, body: { ign: 'Steve', password: 'Panita#2026' } }]);
});

test('activateAccount succeeds on 200', async () => {
  stubFetch(ok({ activated: true }));

  await activateAccount(ID, 'Steve', 'Panita#2026');
});

test('activateAccount maps each rejection to a typed error', async () => {
  const cases: Array<[Response, (error: unknown) => boolean]> = [
    [apiError(400, 'invalid_request', { reason: 'ign_format' }), e => e instanceof InvalidActivationError && e.reason === 'ign_format'],
    [apiError(400, 'invalid_request', { reason: 'special' }), e => e instanceof InvalidActivationError && e.reason === 'special'],
    [apiError(400, 'invalid_request', { reason: 'length' }), e => e instanceof InvalidActivationError && e.reason === 'length'],
    [apiError(409, 'conflict', { field: 'ign' }), e => e instanceof IgnTakenError],
    [apiError(409, 'already_activated'), e => e instanceof AlreadyActivatedError],
    [apiError(404, 'not_found'), e => e instanceof UserNotFoundError],
  ];

  for (const [response, matches] of cases) {
    mock.restoreAll();
    silenceApiLogs();
    stubFetch(response);
    await assert.rejects(activateAccount(ID, 'Steve', 'Panita#2026'), matches);
  }
});

test('activateAccount lets other failures through untouched', async () => {
  for (const response of [apiError(400, 'invalid_request', { fields: ['ign'] }), apiError(500, 'internal_error'), apiError(401, 'unauthenticated')]) {
    mock.restoreAll();
    silenceApiLogs();
    stubFetch(response);
    await assert.rejects(activateAccount(ID, 'Steve', 'Panita#2026'), (error: unknown) => error instanceof ApiError);
  }
});

test('syncMemberRoles sends the role ids and the edition flag with PUT', async () => {
  const counts = { rolesAdded: 1, rolesRemoved: 0, editionsAdded: 0, editionsRemoved: 1 };
  const calls = stubFetch(ok(counts));

  assert.deepEqual(await syncMemberRoles(ID, ['1', '2'], { removeEditions: true }), counts);
  assert.deepEqual(calls, [{
    method: 'PUT',
    path: `/v1/discord/users/${ID}/roles`,
    body: { discord_role_ids: ['1', '2'], remove_editions: true },
  }]);
});

test('syncMemberRoles returns null when the member has no account', async () => {
  stubFetch(apiError(404, 'not_found'));

  assert.equal(await syncMemberRoles(ID, [], { removeEditions: false }), null);
});

test('unmapDiscordRole posts without a body and returns the count', async () => {
  const calls = stubFetch(ok({ unmapped: 1 }));

  assert.equal(await unmapDiscordRole('912345678901234567'), 1);
  assert.deepEqual(calls, [{ method: 'POST', path: '/v1/discord/roles/912345678901234567/unmap', body: undefined }]);
});

const fakeMember = (index: number, options: { bot?: boolean; alt?: boolean; joinedAt?: Date | null } = {}) =>
  ({
    id: String(100000 + index),
    joinedAt: options.joinedAt === undefined ? new Date('2026-01-01T00:00:00.000Z') : options.joinedAt,
    user: {
      id: String(100000 + index),
      bot: options.bot ?? false,
      username: `user${index}`,
      displayAvatarURL: () => `https://cdn.discordapp.com/avatars/${index}.png`,
    },
    roles: { cache: new Map(options.alt ? [['test', {}], ['9' + index, {}]] : [['9' + index, {}]]) },
  }) as unknown as GuildMember;

test('resyncMembers sends chunks of 50 one after another and adds up the summaries', async () => {
  const members = Array.from({ length: 101 }, (_, i) => fakeMember(i));
  const calls = stubFetch(ok({ processed: 50, created: 2, skipped: 1 }));

  const summary = await resyncMembers(members);

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(c => (c.body as { members: unknown[] }).members.length), [50, 50, 1]);
  assert.ok(calls.every(c => c.method === 'POST' && c.path === '/v1/discord/members/resync'));
  assert.deepEqual(summary, { processed: 150, created: 6, skipped: 3 });
});

test('resyncMembers maps each member to the request shape', async () => {
  const calls = stubFetch(ok({ processed: 2, created: 0, skipped: 0 }));

  await resyncMembers([fakeMember(1), fakeMember(2, { joinedAt: null })]);

  const [first, second] = (calls[0].body as { members: Array<Record<string, unknown>> }).members;
  assert.deepEqual(first, {
    discord_id: '100001',
    username: 'user1',
    avatar_url: 'https://cdn.discordapp.com/avatars/1.png',
    joined_at: '2026-01-01T00:00:00.000Z',
    discord_role_ids: ['91'],
  });
  assert.equal(second.joined_at, null);
});

test('resyncMembers drops bots and alts before any call and counts them as skipped', async () => {
  const calls = stubFetch(ok({ processed: 1, created: 1, skipped: 0 }));

  const summary = await resyncMembers([fakeMember(1), fakeMember(2, { bot: true }), fakeMember(3, { alt: true })]);

  assert.equal(calls.length, 1);
  assert.equal((calls[0].body as { members: unknown[] }).members.length, 1);
  assert.deepEqual(summary, { processed: 1, created: 1, skipped: 2 });
});

test('resyncMembers makes no request when nobody is eligible', async () => {
  const calls = stubFetch(ok({ processed: 0, created: 0, skipped: 0 }));

  assert.deepEqual(await resyncMembers([fakeMember(1, { bot: true })]), { processed: 0, created: 0, skipped: 1 });
  assert.equal(calls.length, 0);
});

test('resyncMembers stops at the first failing chunk', async () => {
  const calls = stubFetch(ok({ processed: 50, created: 0, skipped: 0 }), apiError(400, 'invalid_request'));

  await assert.rejects(resyncMembers(Array.from({ length: 150 }, (_, i) => fakeMember(i))), ApiError);
  assert.equal(calls.length, 2);
});

test('deleteUsersByDiscordIds sends chunks of 500 and adds up deleted and skipped', async () => {
  const ids = Array.from({ length: 1001 }, (_, i) => String(100000 + i));
  const calls = stubFetch(
    ok({ deleted: 499, skipped: [{ discord_id: '100000', reason: 'owns_content' }] }),
    ok({ deleted: 500, skipped: [] }),
    ok({ deleted: 1, skipped: [] }),
  );

  const result = await deleteUsersByDiscordIds(ids);

  assert.deepEqual(calls.map(c => (c.body as { discord_ids: string[] }).discord_ids.length), [500, 500, 1]);
  assert.ok(calls.every(c => c.method === 'POST' && c.path === '/v1/discord/users/bulk-delete'));
  assert.deepEqual(result, { deleted: 1000, skipped: [{ discord_id: '100000', reason: 'owns_content' }] });
});

test('deleteUsersByDiscordIds makes no request for an empty list', async () => {
  const calls = stubFetch(ok({ deleted: 0, skipped: [] }));

  assert.deepEqual(await deleteUsersByDiscordIds([]), { deleted: 0, skipped: [] });
  assert.equal(calls.length, 0);
});
