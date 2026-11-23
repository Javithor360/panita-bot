import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelMapOf } from '../src/features/minecraft/channels';
import { createInbound } from '../src/features/minecraft/inbound';
import { mentionsIn } from '../src/features/minecraft/mentions';
import { DEFAULT_MESSAGES } from '../src/features/minecraft/messageConfig';
import { BOT_FEATURES, FEATURE_MENTIONS, MAX_MENTIONS, parseModFrame, type BridgeMention, type BridgePlayer, type ModFrame } from '../src/features/minecraft/protocol';
import { WebhookPoster, type Hook, type HookChannel, type HookMessage } from '../src/features/minecraft/webhook';

const GLOBAL = '111111111111111111';
const TEZ_ID = '222222222222222222';
const SHORT_ID = '333333333333333333';
const JAVI: BridgePlayer = { uuid: 'dd12be42-52a9-4a91-a8a1-11c01849e498', name: 'Javithor360', nickname: null, premium: true, skin: null };
const AVATARS = { premium: 'https://heads.test/{uuid}', cracked: 'https://heads.test/steve', skin: 'https://heads.test/skin/{skin}' };
const TEZ: BridgeMention = { name: 'Tezzlar', discordId: TEZ_ID };
const SHORT: BridgeMention = { name: 'Tez', discordId: SHORT_ID };

const parse = (value: unknown) => parseModFrame(JSON.stringify(value));
const line = { type: 'chat', channel: 'global', player: JAVI, text: 'hola @Tezzlar', emote: false };

// The text

test('writes the @name of a listed member as their mention and says who may be notified', () => {
  assert.deepEqual(mentionsIn('hola @Tezzlar!', [TEZ]), { text: `hola <@${TEZ_ID}>!`, users: [TEZ_ID] });
});

test('ignores the case of the name and lists a member once however many times they are named', () => {
  assert.deepEqual(mentionsIn('@tezzlar y @TEZZLAR', [TEZ]), { text: `<@${TEZ_ID}> y <@${TEZ_ID}>`, users: [TEZ_ID] });
});

test('leaves everything that is not a listed member as plain text', () => {
  assert.deepEqual(mentionsIn('@everyone @here @Otro hola', [TEZ]), { text: '@everyone @here @Otro hola', users: [] });
  assert.deepEqual(mentionsIn('hola @Tezzlar', []), { text: 'hola @Tezzlar', users: [] });
});

test('does not notify a listed member the text never names', () => {
  assert.deepEqual(mentionsIn('hola a todos', [TEZ]), { text: 'hola a todos', users: [] });
});

test('does not read a name inside another word, an address or a longer name', () => {
  assert.deepEqual(mentionsIn('mail@Tezzlar @Tezzlar_x @Tezzlarx', [TEZ]), { text: 'mail@Tezzlar @Tezzlar_x @Tezzlarx', users: [] });
});

test('picks the longest name when one starts another', () => {
  assert.deepEqual(mentionsIn('@Tezzlar y @Tez', [SHORT, TEZ]), { text: `<@${TEZ_ID}> y <@${SHORT_ID}>`, users: [TEZ_ID, SHORT_ID] });
});

// The frame

test('reads the members of a chat line', () => {
  assert.deepEqual(parse({ ...line, mentions: [{ name: 'Tezzlar', discordId: TEZ_ID }] }), { ok: true, frame: { ...line, mentions: [TEZ] } });
});

test('a chat line without members has no mentions in its frame', () => {
  assert.deepEqual(parse(line), { ok: true, frame: line });
  assert.deepEqual(parse({ ...line, mentions: [] }), { ok: true, frame: line });
  assert.deepEqual(parse({ ...line, mentions: 'Tezzlar' }), { ok: true, frame: line });
});

test('leaves out a member that is not a Minecraft name with a Discord id, and still accepts the line', () => {
  const bad = [
    { name: 'Tez zlar', discordId: TEZ_ID },
    { name: 'Tezzlar', discordId: 'abc' },
    { name: 'Tezzlar', discordId: 123 },
    { name: 12, discordId: TEZ_ID },
    'Tezzlar',
    null,
  ];

  assert.deepEqual(parse({ ...line, mentions: [...bad, TEZ] }), { ok: true, frame: { ...line, mentions: [TEZ] } });
});

test('keeps each member once and no more than the limit', () => {
  const many = Array.from({ length: 9 }, (_, index) => ({ name: `Player${index}`, discordId: `1000000000000000${index}` }));

  const parsed = parse({ ...line, mentions: [TEZ, TEZ, { name: 'TEZZLAR', discordId: SHORT_ID }, ...many] });

  assert.ok(parsed.ok && parsed.frame?.type === 'chat');
  const mentions = parsed.ok && parsed.frame?.type === 'chat' ? (parsed.frame.mentions ?? []) : [];
  assert.equal(mentions.length, MAX_MENTIONS);
  assert.deepEqual(mentions[0], TEZ);
  assert.ok(!mentions.some(mention => mention.discordId === SHORT_ID), 'the same name written another way is the same member');
});

test('the bot offers the mentions feature', () => {
  assert.ok(BOT_FEATURES.includes(FEATURE_MENTIONS));
});

// The message in Discord

const hookChannel = () => {
  const sent: HookMessage[] = [];
  const hook: Hook = { name: 'Enriquecraft', send: async message => void sent.push(message) };
  const channel: HookChannel = { ownHooks: async () => [hook], createHook: async () => hook };
  return { channel, sent };
};

test('a webhook notifies only the members it is told and nobody else', async () => {
  const { channel, sent } = hookChannel();
  const webhooks = new WebhookPoster(async () => channel, 'Enriquecraft', { error: () => {} });

  await webhooks.post(GLOBAL, { username: 'Javi', avatarUrl: 'https://heads.test/a', content: `@everyone <@${TEZ_ID}>`, mentionUsers: [TEZ_ID] });

  assert.deepEqual(sent[0].allowedMentions, { parse: [], users: [TEZ_ID] });
});

test('a webhook with no members to notify notifies nobody', async () => {
  const { channel, sent } = hookChannel();
  const webhooks = new WebhookPoster(async () => channel, 'Enriquecraft', { error: () => {} });

  await webhooks.post(GLOBAL, { username: 'Javi', avatarUrl: 'https://heads.test/a', content: 'hola', mentionUsers: [] });

  assert.deepEqual(sent[0].allowedMentions, { parse: [] });
});

const inbound = () => {
  const posted: Array<{ content: string; mentionUsers?: readonly string[] }> = [];
  const handle = createInbound({
    channels: channelMapOf({ global: GLOBAL }),
    webhooks: { post: async (_channelId, message) => void posted.push(message) },
    messages: DEFAULT_MESSAGES,
    announce: async () => {},
    avatars: AVATARS,
    onJoin: async () => {},
    logger: { error: () => {} },
  });
  return { handle: async (frame: ModFrame) => (handle(frame), new Promise(resolve => setImmediate(resolve))), posted };
};

test('a chat line from the game pings the members its player listed', async () => {
  const { handle, posted } = inbound();

  await handle({ type: 'chat', channel: 'global', player: JAVI, text: 'hola @Tezzlar @everyone', emote: false, mentions: [TEZ] });

  assert.equal(posted[0].content, `hola <@${TEZ_ID}> @everyone`);
  assert.deepEqual(posted[0].mentionUsers, [TEZ_ID]);
});

test('a chat line from a player who may not mention stays plain text and pings nobody', async () => {
  const { handle, posted } = inbound();

  await handle({ type: 'chat', channel: 'global', player: JAVI, text: 'hola @Tezzlar', emote: false });

  assert.equal(posted[0].content, 'hola @Tezzlar');
  assert.equal('mentionUsers' in posted[0], false);
});

test('a mention in an action is kept inside the italics', async () => {
  const { handle, posted } = inbound();

  await handle({ type: 'chat', channel: 'global', player: JAVI, text: 'saluda a @Tezzlar', emote: true, mentions: [TEZ] });

  assert.equal(posted[0].content, `*saluda a <@${TEZ_ID}>*`);
});
