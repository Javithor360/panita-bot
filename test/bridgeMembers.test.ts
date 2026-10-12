import { ok, silenceApiLogs, stubFetch } from './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { MemberDirectory } from '../src/features/minecraft/directory';
import type { EnabledMember } from '../src/lib/api/types';
import { listEnabledMembers } from '../src/services/users';

beforeEach(() => silenceApiLogs());
afterEach(() => mock.restoreAll());

const member = (id: string, ign: string): EnabledMember => ({ discord_id: id, ign, minecraft_status: 'premium' });
const ALPHA = member('100000000000000001', 'Alpha');
const BRAVO = member('100000000000000002', 'Bravo');

test('reads the enabled members page by page with the cursor', async () => {
  const calls = stubFetch(
    ok([ALPHA], { meta: { count: 1, next_after: 7 } }),
    ok([BRAVO], { meta: { count: 1, next_after: null } }),
  );

  assert.deepEqual(await listEnabledMembers(), [ALPHA, BRAVO]);
  assert.equal(calls.length, 2);
  assert.match(calls[0].path, /^\/v1\/discord\/users\/enabled-members\?after=0&limit=500$/);
  assert.match(calls[1].path, /after=7/);
});

const directoryOf = (read: () => Promise<EnabledMember[]>, clock: { now: number }) =>
  new MemberDirectory({ fetchAll: read, now: () => clock.now, logger: { error: () => {} } });

test('finds a member by Discord id and a name by its owner, ignoring case', async () => {
  const directory = directoryOf(async () => [ALPHA, BRAVO], { now: 0 });

  assert.deepEqual(await directory.byDiscordId(ALPHA.discord_id), ALPHA);
  assert.deepEqual(await directory.byIgn('bravo'), BRAVO);
  assert.equal(await directory.byIgn('nobody'), undefined);
});

test('reads once for many questions at the same time', async () => {
  let reads = 0;
  const directory = directoryOf(async () => {
    reads++;
    return [ALPHA];
  }, { now: 0 });

  await Promise.all([directory.byDiscordId(ALPHA.discord_id), directory.byIgn('Alpha'), directory.byDiscordId('1')]);

  assert.equal(reads, 1);
});

test('trusts what it read for a minute and then reads again', async () => {
  let reads = 0;
  const clock = { now: 0 };
  const directory = directoryOf(async () => {
    reads++;
    return [ALPHA];
  }, clock);
  await directory.byDiscordId(ALPHA.discord_id);

  clock.now = 59_000;
  await directory.byDiscordId(ALPHA.discord_id);
  assert.equal(reads, 1);

  clock.now = 61_000;
  await directory.byDiscordId(ALPHA.discord_id);
  assert.equal(reads, 2);
});

test('looks again for a member it does not know, but not more than every ten seconds', async () => {
  let members = [ALPHA];
  let reads = 0;
  const clock = { now: 0 };
  const directory = directoryOf(async () => {
    reads++;
    return members;
  }, clock);
  await directory.byDiscordId(ALPHA.discord_id);

  members = [ALPHA, BRAVO];
  clock.now = 3_000;
  assert.equal(await directory.byDiscordId(BRAVO.discord_id), undefined, 'too soon to look again');
  clock.now = 12_000;
  assert.deepEqual(await directory.byDiscordId(BRAVO.discord_id), BRAVO);
  assert.equal(reads, 2);
});

test('keeps what it knew when a read fails', async () => {
  let fail = false;
  const clock = { now: 0 };
  const directory = directoryOf(async () => {
    if (fail) throw new Error('api down');
    return [ALPHA];
  }, clock);
  await directory.byDiscordId(ALPHA.discord_id);

  fail = true;
  clock.now = 120_000;

  assert.deepEqual(await directory.byDiscordId(ALPHA.discord_id), ALPHA);
});
