import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UserError } from '../src/core/errors';
import { decodeCustomId } from '../src/core/customId';
import { getRegistry } from '../src/core/registry';
import { MENU_MAX, viewMenu } from '../src/features/info/viewMenu';
import {
  serverMenu,
  serverMessage,
  SERVER_FLAGS,
  SERVER_VIEW_OPTIONS,
  SERVER_VIEWS,
  type ServerData,
  type ServerView,
} from '../src/features/info/serverView';
import { userMenu, USER_VIEW_OPTIONS } from '../src/features/info/userView';

const serverData = (): ServerData => ({
  id: '707103390852710491',
  name: 'Panitacraft',
  iconUrl: 'https://cdn.example/icon.png',
  bannerUrl: 'https://cdn.example/banner.png',
  splashUrl: null,
  createdAt: new Date('2020-05-05T00:00:00Z'),
  ownerId: '111111111111111111',
  verificationLevel: 1,
  boostTier: 1,
  boosts: 3,
  memberCount: 23,
  humans: 14,
  bots: 9,
  presence: null,
  channelCounts: { total: 25, categories: 4, text: 13, voice: 12, announcements: 0, forums: 0, stages: 0 },
  afkChannelId: null,
  afkTimeoutSeconds: 300,
  roles: [],
  emojis: [],
  stickers: 0,
  features: [],
  vanityCode: null,
  serverTag: null,
  boosters: [],
  membersComplete: true,
  tree: [],
});

const MENU_ID = 'server:view|42';
const makeId = (view: ServerView, page: number, slot: string) => `server:page:${view}:${page}:${slot}`;
const selectOf = (row: any) => row.toJSON().components[0];

// ── The shared menu ──────────────────────────────────────────────────────────────────────────────────────────────

test('a menu marks only the view on screen and refuses more options than Discord shows', () => {
  const options = [
    { value: 'a', label: 'A', description: 'la a' },
    { value: 'b', label: 'B', description: 'la b' },
  ];
  const select = selectOf(viewMenu('x:view|1', options, 'b', 'Elige'));
  assert.equal(select.custom_id, 'x:view|1');
  assert.equal(select.placeholder, 'Elige');
  assert.deepEqual(select.options.filter((option: any) => option.default).map((option: any) => option.value), ['b']);

  const tooMany = Array.from({ length: MENU_MAX + 1 }, (_, index) => ({ value: `v${index}`, label: 'L', description: 'd' }));
  assert.throws(() => viewMenu('x:view|1', tooMany, 'v0', 'Elige'), /do not fit/);
});

// ── /server ──────────────────────────────────────────────────────────────────────────────────────────────────────

test('the menu of server has the information and every flag, in the order of the flags, with text Discord accepts', () => {
  assert.deepEqual(SERVER_VIEW_OPTIONS.map(option => option.value), ['info', ...SERVER_FLAGS.map(({ flag }) => flag)]);
  assert.deepEqual([...SERVER_VIEW_OPTIONS.map(option => option.value)].sort(), [...SERVER_VIEWS].sort());
  for (const option of SERVER_VIEW_OPTIONS) {
    assert.ok(option.label.length > 0 && option.label.length <= 100, option.label);
    assert.ok(option.description.length > 0 && option.description.length <= 100, option.description);
  }
  // The text of a flag is the one the flag already has
  for (const { flag, help } of SERVER_FLAGS) assert.equal(SERVER_VIEW_OPTIONS.find(option => option.value === flag)!.description, help);
});

test('every view of server carries the menu with that view marked, and the paged ones keep their buttons first', () => {
  for (const view of SERVER_VIEWS) {
    const message = serverMessage(view, serverData(), 0, makeId, () => 0, {}, MENU_ID);
    const rows = (message.components ?? []).map((row: any) => row.toJSON().components);
    const menu = rows[rows.length - 1];
    assert.equal(menu[0].custom_id, MENU_ID, view);
    assert.deepEqual(menu[0].options.filter((option: any) => option.default).map((option: any) => option.value), [view], view);
    assert.ok(rows.length <= 2, `${view} has at most the buttons and the menu`);
    for (const row of rows.slice(0, -1)) assert.equal(row[0].type, 2, `${view}: the buttons come before the menu`);
  }
});

test('without a menu id the messages of server are the ones they always were', () => {
  for (const view of SERVER_VIEWS) {
    const components = serverMessage(view, serverData(), 0, makeId, () => 0).components ?? [];
    assert.ok(components.every((row: any) => row.toJSON().components[0].type === 2), `${view} has buttons at most`);
  }
  assert.ok(serverMenu(MENU_ID, 'roles'));
});

test('the menu of server is a component of the command, with the id the router will find', () => {
  const server = getRegistry().byName.get('server')!;
  assert.equal(server.components!.view.kind, 'select');
  assert.equal(server.components!.page.kind, 'button');
  assert.deepEqual(decodeCustomId(MENU_ID), { namespace: 'server', action: 'view', args: [], owner: '42' });
});

test('a view of the server menu that does not exist is rejected before anything is read', async () => {
  const handler = getRegistry().byName.get('server')!.components!.view as any;
  const interaction = { inCachedGuild: () => true, values: ['nope'], user: { id: '42' } };
  await assert.rejects(handler.run(interaction, []), UserError);
});

// ── /user ────────────────────────────────────────────────────────────────────────────────────────────────────────

test('the menu of user has the profile and the three flags', () => {
  assert.deepEqual(USER_VIEW_OPTIONS.map(option => option.value), ['profile', 'badges', 'cosmetics', 'permissions']);
  for (const option of USER_VIEW_OPTIONS) {
    assert.ok(option.label.length <= 100 && option.description.length <= 100, option.label);
  }
  for (const option of USER_VIEW_OPTIONS) {
    const select = selectOf(userMenu('user:view:222|42', option.value));
    assert.deepEqual(select.options.filter((entry: any) => entry.default).map((entry: any) => entry.value), [option.value]);
  }
});

test('the menu of user carries who it is about and who can use it', () => {
  const id = 'user:view:222222222222222222|333333333333333333';
  assert.equal(selectOf(userMenu(id, 'profile')).custom_id, id);
  assert.deepEqual(decodeCustomId(id), { namespace: 'user', action: 'view', args: ['222222222222222222'], owner: '333333333333333333' });
  assert.ok(id.length <= 100);
});

test('the user command has the menu next to its older "which one do you mean" menu', () => {
  const user = getRegistry().byName.get('user')!;
  assert.equal(user.components!.view.kind, 'select');
  assert.equal(user.components!.pick.kind, 'select');
});

test('a view of the user menu that does not exist is rejected before anything is read', async () => {
  const handler = getRegistry().byName.get('user')!.components!.view as any;
  const interaction = { inCachedGuild: () => true, values: ['nope'], user: { id: '42' } };
  await assert.rejects(handler.run(interaction, ['222']), UserError);
});
