import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelMapOf } from '../src/features/minecraft/channels';
import { avatarOf, createInbound } from '../src/features/minecraft/inbound';
import { DEFAULT_MESSAGES, type EventName } from '../src/features/minecraft/messageConfig';
import type { BridgePlayer, EventFrame, ModFrame } from '../src/features/minecraft/protocol';
import { grantJoinedRole, type RoleMember } from '../src/features/minecraft/roles';
import { WebhookPoster, safeUsername, type Hook, type HookChannel, type HookMessage } from '../src/features/minecraft/webhook';
import type { EnabledMember } from '../src/lib/api/types';

const GLOBAL = '111111111111111111';
const JAVI: BridgePlayer = { uuid: 'dd12be42-52a9-4a91-a8a1-11c01849e498', name: 'Javithor360', nickname: null, premium: true, skin: null };
const TEZ: BridgePlayer = { uuid: '11111111-2222-3333-4444-555555555555', name: 'Tezzlar', nickname: 'Tez', premium: false, skin: null };
const AVATARS = { premium: 'https://heads.test/{uuid}', cracked: 'https://heads.test/steve', skin: 'https://heads.test/skin/{skin}' };

// Webhooks

const hookChannel = (existing: Hook[] = []) => {
  const created: string[] = [];
  const sent: HookMessage[] = [];
  const hook = (name: string): Hook => ({ name, send: async message => void sent.push(message) });
  const channel: HookChannel = {
    ownHooks: async () => existing,
    createHook: async name => {
      created.push(name);
      return hook(name);
    },
  };
  return { channel, created, sent, hook };
};

const poster = (channel: HookChannel | null) => new WebhookPoster(async () => channel, 'Enriquecraft', { error: () => {} });

test('makes the webhook the first time and finds it again afterwards', async () => {
  const { channel, created, sent } = hookChannel();
  const webhooks = poster(channel);

  await webhooks.post(GLOBAL, { username: 'Javi', avatarUrl: 'https://heads.test/a', content: 'uno' });
  await webhooks.post(GLOBAL, { username: 'Javi', avatarUrl: 'https://heads.test/a', content: 'dos' });

  assert.deepEqual(created, ['Enriquecraft']);
  assert.equal(sent.length, 2);
});

test('uses a webhook the bot already made', async () => {
  const { channel, created, sent, hook } = hookChannel();
  const own = hookChannel([hook('Enriquecraft')]);

  await poster(own.channel).post(GLOBAL, { username: 'Javi', avatarUrl: 'https://heads.test/a', content: 'hola' });

  assert.deepEqual(created, []);
  assert.deepEqual(own.created, []);
  void channel;
  void sent;
});

test('posts with the name and head given and mentions nobody', async () => {
  const { channel, sent } = hookChannel();

  await poster(channel).post(GLOBAL, { username: 'Javi', avatarUrl: 'https://heads.test/a', content: '@everyone hola' });

  assert.deepEqual(sent, [{ content: '@everyone hola', username: 'Javi', avatarURL: 'https://heads.test/a', allowedMentions: { parse: [] } }]);
});

test('cuts a message to what Discord accepts', async () => {
  const { channel, sent } = hookChannel();

  await poster(channel).post(GLOBAL, { username: 'Javi', avatarUrl: 'https://heads.test/a', content: 'x'.repeat(3000) });

  assert.equal(sent[0].content.length, 2000);
});

test('makes a new webhook when Discord says the old one was deleted', async () => {
  let deleted = true;
  const sent: string[] = [];
  const made: string[] = [];
  const hookNamed = (name: string): Hook => ({
    name,
    send: async message => {
      if (deleted) {
        deleted = false;
        throw Object.assign(new Error('Unknown Webhook'), { code: 10015 });
      }
      sent.push(message.content);
    },
  });
  const channel: HookChannel = {
    ownHooks: async () => [],
    createHook: async name => (made.push(name), hookNamed(name)),
  };

  await poster(channel).post(GLOBAL, { username: 'Javi', avatarUrl: 'https://heads.test/a', content: 'hola' });

  assert.deepEqual(made, ['Enriquecraft', 'Enriquecraft']);
  assert.deepEqual(sent, ['hola']);
});

test('drops a message when the channel can not be reached, and tries again for the next one', async () => {
  let reachable = false;
  const { channel, sent } = hookChannel();
  const webhooks = new WebhookPoster(async () => (reachable ? channel : null), 'Enriquecraft', { error: () => {} });

  await webhooks.post(GLOBAL, { username: 'Javi', avatarUrl: 'https://heads.test/a', content: 'perdido' });
  reachable = true;
  await webhooks.post(GLOBAL, { username: 'Javi', avatarUrl: 'https://heads.test/a', content: 'llega' });

  assert.deepEqual(sent.map(message => message.content), ['llega']);
});

test('never throws when the webhook can not send', async () => {
  const channel: HookChannel = {
    ownHooks: async () => [],
    createHook: async name => ({ name, send: async () => Promise.reject(new Error('boom')) }),
  };

  await poster(channel).post(GLOBAL, { username: 'Javi', avatarUrl: 'https://heads.test/a', content: 'hola' });
});

test('hides the words Discord refuses in a webhook name with an invisible space', () => {
  assert.equal(safeUsername('Discord_Fan'), 'Dis​cord_Fan');
  assert.equal(safeUsername('xClydex'), 'xCly​dex');
  assert.equal(safeUsername('Javi'), 'Javi');
  assert.equal(safeUsername('a'.repeat(100)).length, 80);
});

// The inbound handler

const inbound = () => {
  const posted: Array<{ channelId: string; username: string; avatarUrl: string; content: string }> = [];
  const announced: Array<{ kind: EventName; frame: EventFrame }> = [];
  const joined: BridgePlayer[] = [];
  const handle = createInbound({
    channels: channelMapOf({ global: GLOBAL }),
    webhooks: { post: async (channelId, message) => void posted.push({ channelId, ...message }) },
    messages: DEFAULT_MESSAGES,
    announce: async (kind, frame) => void announced.push({ kind, frame }),
    avatars: AVATARS,
    onJoin: async player => void joined.push(player),
    logger: { error: () => {} },
  });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return { handle: async (frame: ModFrame) => (handle(frame), settle()), posted, announced, joined };
};

test('posts a chat line under the nickname with the head of how the player logs in', async () => {
  const { handle, posted } = inbound();

  await handle({ type: 'chat', channel: 'global', player: TEZ, text: 'hola', emote: false });
  await handle({ type: 'chat', channel: 'global', player: JAVI, text: 'buenas', emote: false });

  assert.deepEqual(posted, [
    { channelId: GLOBAL, username: 'Tez', avatarUrl: 'https://heads.test/steve', content: 'hola' },
    { channelId: GLOBAL, username: 'Javithor360', avatarUrl: 'https://heads.test/dd12be4252a94a91a8a111c01849e498', content: 'buenas' },
  ]);
});

test('posts what a player does with an emote in italics', async () => {
  const { handle, posted } = inbound();

  await handle({ type: 'chat', channel: 'global', player: JAVI, text: 'saluda *a todos*', emote: true });

  assert.equal(posted[0].content, '*saluda \\*a todos\\**');
});

test('posts what a player does with /me under a name that starts with an asterisk, and a normal line under the plain name', async () => {
  const { handle, posted } = inbound();

  await handle({ type: 'chat', channel: 'global', player: TEZ, text: 'se ríe', emote: true });
  await handle({ type: 'chat', channel: 'global', player: TEZ, text: 'hola', emote: false });

  assert.deepEqual(posted.map(item => [item.username, item.content]), [
    ['* Tez', '*se ríe*'],
    ['Tez', 'hola'],
  ]);
});

test('ignores a chat line of a channel that is not joined', async () => {
  const { handle, posted } = inbound();

  await handle({ type: 'chat', channel: 'staff', player: JAVI, text: 'secreto', emote: false });

  assert.deepEqual(posted, []);
});

test('announces every event with its own kind and gives the role at a join only', async () => {
  const { handle, announced, joined } = inbound();
  const frames: EventFrame[] = [
    { type: 'event', kind: 'join', player: JAVI },
    { type: 'event', kind: 'first_join', player: TEZ },
    { type: 'event', kind: 'leave', player: JAVI },
    { type: 'event', kind: 'broadcast', text: 'hola' },
  ];

  for (const frame of frames) await handle(frame);

  assert.deepEqual(announced, frames.map(frame => ({ kind: frame.kind, frame })));
  assert.deepEqual(joined, [JAVI, TEZ]);
});

test('a failure while posting never reaches the bridge', async () => {
  const handle = createInbound({
    channels: channelMapOf({ global: GLOBAL }),
    webhooks: { post: async () => Promise.reject(new Error('boom')) },
    messages: DEFAULT_MESSAGES,
    announce: async () => Promise.reject(new Error('boom')),
    avatars: AVATARS,
    onJoin: async () => {},
    logger: { error: () => {} },
  });

  handle({ type: 'chat', channel: 'global', player: JAVI, text: 'hola', emote: false });
  handle({ type: 'event', kind: 'started' });
  await new Promise(resolve => setImmediate(resolve));
});

// The role at join

const LINKED: EnabledMember = { discord_id: '222222222222222222', ign: 'Javithor360', minecraft_status: 'premium' };

const roleSetup = (options: { has?: boolean; dryRun?: boolean; roleId?: string | undefined; linked?: boolean; present?: boolean } = {}) => {
  const added: string[] = [];
  const logs: string[] = [];
  const member: RoleMember = { roles: { cache: { has: () => options.has ?? false }, add: async id => void added.push(id) } };
  const deps = {
    roleId: 'roleId' in options ? options.roleId : '333333333333333333',
    directory: { byIgn: async () => (options.linked === false ? undefined : LINKED) },
    fetchMember: async () => (options.present === false ? null : member),
    dryRun: options.dryRun ?? false,
    logger: { log: (text: string) => void logs.push(text), error: () => {} },
  };
  return { deps, added, logs };
};

test('gives the role to the linked member a player is', async () => {
  const { deps, added } = roleSetup();

  await grantJoinedRole(deps, JAVI);

  assert.deepEqual(added, ['333333333333333333']);
});

test('does not give the role to someone who has it, who is not linked, or who left the server', async () => {
  for (const options of [{ has: true }, { linked: false }, { present: false }]) {
    const { deps, added } = roleSetup(options);
    await grantJoinedRole(deps, JAVI);
    assert.deepEqual(added, [], JSON.stringify(options));
  }
});

test('does nothing without a role set', async () => {
  const { deps, added } = roleSetup({ roleId: undefined });

  await grantJoinedRole(deps, JAVI);

  assert.deepEqual(added, []);
});

test('in dry run it only says what it would do', async () => {
  const { deps, added, logs } = roleSetup({ dryRun: true });

  await grantJoinedRole(deps, JAVI);

  assert.deepEqual(added, []);
  assert.match(logs[0], /would give the joined role to Javithor360/);
});

test('a failure giving the role is logged and not thrown', async () => {
  const { deps } = roleSetup();
  deps.fetchMember = async () => Promise.reject(new Error('boom'));

  await grantJoinedRole(deps, JAVI);
});

// The role does not depend on the notification

const joinFrame: ModFrame = { type: 'event', kind: 'join', player: JAVI };
const settled = () => new Promise(resolve => setImmediate(resolve));

test('gives the role at a join even when the embed can not be posted', async () => {
  const joined: BridgePlayer[] = [];
  const errors: unknown[][] = [];
  const handle = createInbound({
    channels: channelMapOf({ global: GLOBAL }),
    webhooks: { post: async () => {} },
    messages: DEFAULT_MESSAGES,
    announce: async () => Promise.reject(new Error('missing permissions')),
    avatars: AVATARS,
    onJoin: async player => void joined.push(player),
    logger: { error: (...args: unknown[]) => void errors.push(args) },
  });

  handle(joinFrame);
  await settled();

  assert.deepEqual(joined, [JAVI]);
  assert.equal(errors.length, 1, 'the failed embed is still reported');
});

test('gives the role at a join even when no channel is joined', async () => {
  const joined: BridgePlayer[] = [];
  const handle = createInbound({
    channels: channelMapOf({}),
    webhooks: { post: async () => {} },
    messages: DEFAULT_MESSAGES,
    announce: async () => {},
    avatars: AVATARS,
    onJoin: async player => void joined.push(player),
    logger: { error: () => {} },
  });

  handle(joinFrame);
  await settled();

  assert.deepEqual(joined, [JAVI]);
});

test('says why no role was given: nobody linked has that name, or the member is not in the server', async () => {
  const unlinked = roleSetup({ linked: false });
  await grantJoinedRole(unlinked.deps, JAVI);
  const absent = roleSetup({ present: false });
  await grantJoinedRole(absent.deps, JAVI);

  assert.match(unlinked.logs[0], /Javithor360 joined, but no linked account has that Minecraft name/);
  assert.match(absent.logs[0], /is not in the server, so no role was given/);
});

test('a member who already has the role is not logged or touched', async () => {
  const { deps, added, logs } = roleSetup({ has: true });

  await grantJoinedRole(deps, JAVI);

  assert.deepEqual(added, []);
  assert.deepEqual(logs, []);
});

test('the head of a player is their skin when the server says which, and the one of how they log in otherwise', () => {
  const skinned = { ...TEZ, skin: 'a'.repeat(64) };

  assert.equal(avatarOf(AVATARS, skinned), `https://heads.test/skin/${'a'.repeat(64)}`);
  assert.equal(avatarOf(AVATARS, { ...JAVI, skin: 'b'.repeat(64) }), `https://heads.test/skin/${'b'.repeat(64)}`);
  assert.equal(avatarOf(AVATARS, JAVI), 'https://heads.test/dd12be4252a94a91a8a111c01849e498');
  assert.equal(avatarOf(AVATARS, TEZ), 'https://heads.test/steve');
});
