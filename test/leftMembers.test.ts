import { apiError, ok, silenceApiLogs, stubFetch } from './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { GuildMember, PartialGuildMember } from 'discord.js';
import { env } from '../src/config/env';
import { guildMemberRemoveEvent } from '../src/events/guildMemberRemove';
import { planReconciliation, reconcileLeftMembers } from '../src/services/leftMembers';

beforeEach(() => silenceApiLogs());
afterEach(() => mock.restoreAll());

const ids = (count: number, from = 1) => Array.from({ length: count }, (_, i) => String(100000 + from + i));
const planFor = (members: string[], enabled: string[], expectedMembers = members.length) =>
  planReconciliation({ memberIds: new Set(members), expectedMembers, enabledIds: enabled });

test('plans to deactivate the enabled accounts whose member is gone', () => {
  const members = ids(100);

  assert.deepEqual(planFor(members, [...members.slice(0, 50), '999999990', '999999991']), {
    kind: 'deactivate',
    ids: ['999999990', '999999991'],
  });
});

test('plans nothing when everyone enabled is still a member, or nobody is enabled', () => {
  const members = ids(10);

  assert.deepEqual(planFor(members, members.slice(0, 5)), { kind: 'deactivate', ids: [] });
  assert.deepEqual(planFor(members, []), { kind: 'deactivate', ids: [] });
});

test('skips when the fetched member list falls short of the guild member count by more than 2%', () => {
  const members = ids(97);
  const plan = planFor(members, ['999999990'], 100);

  assert.deepEqual(plan, { kind: 'skip', reason: 'member_list_incomplete', counts: { members: 97, expectedMembers: 100, enabled: 1, gone: 1 } });
});

test('accepts a member list within 2% of the guild member count', () => {
  assert.equal(planFor(ids(98), ['999999990'], 100).kind, 'deactivate');
});

test('an empty member list never deactivates anyone', () => {
  const plan = planFor([], ids(50), 800);

  assert.equal(plan.kind, 'skip');
});

test('skips when more than 10% of the enabled accounts and more than 5 would go', () => {
  const members = ids(200);
  const enabled = [...members.slice(0, 40), ...ids(5, 900000)];
  assert.equal(planFor(members, enabled).kind, 'deactivate'); // 5 of 45

  const many = [...members.slice(0, 40), ...ids(6, 900000)];
  const plan = planFor(members, many); // 6 of 46: more than 5 and more than 10%
  assert.deepEqual(plan, { kind: 'skip', reason: 'too_many_to_deactivate', counts: { members: 200, expectedMembers: 200, enabled: 46, gone: 6 } });
});

test('a few departures among many accounts are fine, and a big share of few is too', () => {
  const members = ids(500);
  const many = [...members.slice(0, 400), ...ids(30, 900000)]; // 30 of 430: 7%
  assert.equal(planFor(members, many).kind, 'deactivate');

  const small = [...members.slice(0, 10), ...ids(5, 900000)]; // 5 of 15: a big share but not more than 5
  assert.equal(planFor(members, small).kind, 'deactivate');
});

const fakeGuild = (memberIds: string[], options: { available?: boolean; memberCount?: number; fetchFails?: boolean } = {}) => ({
  available: options.available ?? true,
  memberCount: options.memberCount ?? memberIds.length,
  members: {
    fetch: async () => {
      if (options.fetchFails) throw new Error('gateway timeout');
      return new Map(memberIds.map(id => [id, {}]));
    },
  },
});

const quietLogger = () => {
  const lines: string[] = [];
  const log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  return { logger: { log, warn: log, error: log }, lines };
};

test('reconcile deactivates exactly the accounts of members who left', async () => {
  const members = ids(100);
  const deactivated: string[] = [];
  const { logger, lines } = quietLogger();

  await reconcileLeftMembers(fakeGuild(members), {
    listEnabled: async () => [...members.slice(0, 10), '999999990', '999999991'],
    deactivate: async id => { deactivated.push(id); return true; },
    logger,
  });

  assert.deepEqual(deactivated, ['999999990', '999999991']);
  assert.match(lines.join('\n'), /2 deactivated, 0 failed/);
});

test('reconcile keeps going after one account fails, and logs it', async () => {
  const members = ids(100);
  const deactivated: string[] = [];
  const { logger, lines } = quietLogger();

  await reconcileLeftMembers(fakeGuild(members), {
    listEnabled: async () => ['999999990', '999999991'],
    deactivate: async id => {
      if (id === '999999990') throw new Error('boom');
      deactivated.push(id);
      return true;
    },
    logger,
  });

  assert.deepEqual(deactivated, ['999999991']);
  assert.match(lines.join('\n'), /Could not deactivate 999999990/);
  assert.match(lines.join('\n'), /1 deactivated, 1 failed/);
});

test('reconcile does nothing when the guild is unavailable, the fetch fails or the list is incomplete', async () => {
  const members = ids(100);
  const cases = [
    fakeGuild(members, { available: false }),
    fakeGuild(members, { fetchFails: true }),
    fakeGuild(members.slice(0, 50), { memberCount: 100 }),
  ];

  for (const guild of cases) {
    const deactivated: string[] = [];
    const { logger } = quietLogger();
    await reconcileLeftMembers(guild, {
      listEnabled: async () => ['999999990'],
      deactivate: async id => { deactivated.push(id); return true; },
      logger,
    });
    assert.deepEqual(deactivated, []);
  }
});

test('reconcile does nothing, and says so with counts only, when too many would be deactivated', async () => {
  const members = ids(100);
  const deactivated: string[] = [];
  const { logger, lines } = quietLogger();

  await reconcileLeftMembers(fakeGuild(members), {
    listEnabled: async () => [...members.slice(0, 20), ...ids(10, 900000)],
    deactivate: async id => { deactivated.push(id); return true; },
    logger,
  });

  assert.deepEqual(deactivated, []);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /too_many_to_deactivate.*"gone":10/);
  assert.doesNotMatch(lines[0], /900001/);
});

test('reconcile never throws when the API fails', async () => {
  const { logger, lines } = quietLogger();

  await reconcileLeftMembers(fakeGuild(ids(10)), {
    listEnabled: async () => { throw new Error('api down'); },
    logger,
  });

  assert.match(lines.join('\n'), /Failed; it will be tried again/);
});

const fakeMember = (id: string, bot = false) =>
  ({ id, user: { bot }, guild: { id: env.GUILD_ID ?? '700000000000000000' } }) as unknown as GuildMember | PartialGuildMember;

test('a member who leaves has their account deactivated', async () => {
  const calls = stubFetch(ok({ deactivated: true, user: {} }));

  await guildMemberRemoveEvent(fakeMember('812345678901234567'));

  assert.deepEqual(calls, [{ method: 'POST', path: '/v1/discord/users/812345678901234567/deactivate', body: undefined }]);
});

test('a bot that leaves is ignored', async () => {
  const calls = stubFetch(ok({ deactivated: true, user: {} }));

  await guildMemberRemoveEvent(fakeMember('812345678901234567', true));

  assert.equal(calls.length, 0);
});

test('a failed deactivation is logged and never thrown', async () => {
  stubFetch(apiError(401, 'unauthenticated'));

  await guildMemberRemoveEvent(fakeMember('812345678901234567'));
});
