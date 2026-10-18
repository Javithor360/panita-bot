import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelMapOf } from '../src/features/minecraft/channels';
import { createOutbound, toGameText, type BridgeMessage } from '../src/features/minecraft/outbound';
import type { BotFrame } from '../src/features/minecraft/protocol';
import { RateLimiter } from '../src/features/minecraft/rateLimit';
import type { EnabledMember } from '../src/lib/api/types';

const GLOBAL = '111111111111111111';
const LINKED: EnabledMember = { discord_id: '222222222222222222', ign: 'Javithor360', minecraft_status: 'premium' };

const message = (overrides: Partial<BridgeMessage> = {}, reactions: string[] = []): BridgeMessage => ({
  author: { bot: false, id: LINKED.discord_id },
  webhookId: null,
  channelId: GLOBAL,
  content: 'hola',
  cleanContent: 'hola',
  attachments: { size: 0, values: () => [] },
  stickers: { size: 0 },
  inGuild: () => true,
  react: async emoji => reactions.push(emoji),
  ...overrides,
});

const setup = (options: { connected?: boolean; members?: EnabledMember[]; limit?: number; features?: string[] } = {}) => {
  const sent: BotFrame[] = [];
  const outbound = createOutbound({
    link: { connected: options.connected ?? true, features: options.features ?? [], send: frame => (sent.push(frame), true) },
    channels: channelMapOf({ global: GLOBAL }),
    directory: { byDiscordId: async id => (options.members ?? [LINKED]).find(member => member.discord_id === id) },
    limiter: new RateLimiter(options.limit ?? 5, 10_000, () => 0),
    logger: { error: () => {} },
  });
  return { outbound, sent };
};

test('passes the message of a linked member to the game under their Minecraft name', async () => {
  const { outbound, sent } = setup();

  await outbound(message());

  assert.deepEqual(sent, [{ type: 'chat', channel: 'global', author: { discordId: LINKED.discord_id, ign: 'Javithor360' }, text: 'hola' }]);
});

test('reacts with a cross to someone who is not linked and sends nothing', async () => {
  const reactions: string[] = [];
  const { outbound, sent } = setup({ members: [] });

  await outbound(message({}, reactions));

  assert.deepEqual(sent, []);
  assert.deepEqual(reactions, ['❌']);
});

test('ignores bots, webhooks, direct messages and other channels', async () => {
  const { outbound, sent } = setup();

  await outbound(message({ author: { bot: true, id: '1' } }));
  await outbound(message({ webhookId: '999' }));
  await outbound(message({ inGuild: () => false }));
  await outbound(message({ channelId: '333333333333333333' }));

  assert.deepEqual(sent, []);
});

test('never bridges a command', async () => {
  const { outbound, sent } = setup();

  await outbound(message({ content: '!ip', cleanContent: '!ip' }));

  assert.deepEqual(sent, []);
});

test('does nothing while the Minecraft server is not connected', async () => {
  const reactions: string[] = [];
  const { outbound, sent } = setup({ connected: false, members: [] });

  await outbound(message({}, reactions));

  assert.deepEqual(sent, []);
  assert.deepEqual(reactions, []);
});

test('hears a member only five times in ten seconds', async () => {
  const { outbound, sent } = setup({ limit: 5 });

  for (let i = 0; i < 8; i++) await outbound(message({ cleanContent: `uno ${i}` }));

  assert.equal(sent.length, 5);
});

test('ignores a message with nothing to say', async () => {
  const { outbound, sent } = setup();

  await outbound(message({ cleanContent: '   ' }));

  assert.deepEqual(sent, []);
});

test('writes custom emojis, attachments and stickers as words', () => {
  const text = (cleanContent: string, attachments = 0, stickers = 0) =>
    toGameText({ cleanContent, attachments: { size: attachments }, stickers: { size: stickers } });

  assert.equal(text('mira <:pepe:123456789012345678> y <a:baile:987654321098765432>'), 'mira :pepe: y :baile:');
  assert.equal(text('foto', 2), 'foto [adjunto]');
  assert.equal(text('', 1, 1), '[adjunto] [sticker]');
});

test('joins the lines of a message and removes control characters', () => {
  assert.equal(toGameText({ cleanContent: 'uno\n\ndos\u0007\ntres', attachments: { size: 0 }, stickers: { size: 0 } }), 'uno dos tres');
});

test('cuts a long message to the length of a chat line', () => {
  const text = toGameText({ cleanContent: 'x'.repeat(500), attachments: { size: 0 }, stickers: { size: 0 } });

  assert.equal(text.length, 256);
  assert.ok(text.endsWith('…'));
});

test('the limiter forgets what is older than its window', () => {
  let now = 0;
  const limiter = new RateLimiter(2, 1000, () => now);

  assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('a'), false);
  assert.equal(limiter.take('b'), true, 'another key has its own count');
  now = 1001;
  assert.equal(limiter.take('a'), true);
});

const photo = (overrides: Record<string, unknown> = {}) => ({
  url: 'https://cdn.discordapp.com/attachments/1/2/foto.png?ex=68f1',
  name: 'foto.png',
  contentType: 'image/png',
  size: 1000,
  width: 800,
  height: 600,
  spoiler: false,
  ...overrides,
});
const attached = (...list: ReturnType<typeof photo>[]) => ({ size: list.length, values: () => list });
const chatOf = (sent: BotFrame[]) => sent.map(frame => (frame.type === 'chat' ? { text: frame.text, media: frame.media } : frame));

test('sends the images to a mod that announced media as entries, and leaves them out of the text', async () => {
  const { outbound, sent } = setup({ features: ['media'] });

  await outbound(message({ cleanContent: 'mira', attachments: attached(photo(), photo({ name: 'SPOILER_b.png', spoiler: true })) }));

  assert.deepEqual(chatOf(sent), [{
    text: 'mira',
    media: [
      { url: 'https://cdn.discordapp.com/attachments/1/2/foto.png?ex=68f1', name: 'foto.png', type: 'image/png', size: 1000, width: 800, height: 600, spoiler: false },
      { url: 'https://cdn.discordapp.com/attachments/1/2/foto.png?ex=68f1', name: 'b.png', type: 'image/png', size: 1000, width: 800, height: 600, spoiler: true },
    ],
  }]);
});

test('a message of only images goes with an empty text to a mod that announced media', async () => {
  const { outbound, sent } = setup({ features: ['media'] });

  await outbound(message({ cleanContent: '', attachments: attached(photo()) }));

  assert.equal(sent.length, 1);
  assert.equal(chatOf(sent)[0] && (chatOf(sent)[0] as { text: string }).text, '');
});

test('a mod that did not announce media still gets [adjunto] and no entries', async () => {
  const { outbound, sent } = setup({ features: [] });

  await outbound(message({ cleanContent: 'mira', attachments: attached(photo()) }));
  await outbound(message({ cleanContent: '', attachments: attached(photo()) }));

  assert.deepEqual(chatOf(sent), [{ text: 'mira [adjunto]', media: undefined }, { text: '[adjunto]', media: undefined }]);
});

test('what the game may not show stays [adjunto], next to the images that go as entries', async () => {
  const { outbound, sent } = setup({ features: ['media'] });

  await outbound(message({
    cleanContent: 'hola',
    attachments: attached(photo(), photo({ contentType: 'video/mp4', name: 'clip.mp4' }), photo({ url: 'https://evil.example/a.png' })),
  }));

  const [frame] = chatOf(sent) as { text: string; media: unknown[] }[];
  assert.equal(frame.text, 'hola [adjunto]');
  assert.equal(frame.media.length, 1);
});

test('more than four images: four go as entries and the rest are written as [adjunto]', async () => {
  const { outbound, sent } = setup({ features: ['media'] });

  await outbound(message({ cleanContent: '', attachments: attached(...Array.from({ length: 6 }, (_, index) => photo({ name: `${index}.png` }))) }));

  const [frame] = chatOf(sent) as { text: string; media: { name: string }[] }[];
  assert.deepEqual(frame.media.map(entry => entry.name), ['0.png', '1.png', '2.png', '3.png']);
  assert.equal(frame.text, '[adjunto]');
});

test('says nothing for a message whose only attachment cannot be shown to a mod without media', async () => {
  const { outbound, sent } = setup({ features: ['media'] });

  await outbound(message({ cleanContent: '', attachments: { size: 0, values: () => [] } }));

  assert.deepEqual(sent, []);
});
