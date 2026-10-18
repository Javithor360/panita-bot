import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { Message } from 'discord.js';
import { bareCommand } from '../src/features/minecraft/bare';
import { channelMapOf } from '../src/features/minecraft/channels';
import { playerListEmbed, playerListPictureEmbed } from '../src/features/minecraft/embeds';
import { withSilentMention } from '../src/features/minecraft/mention';
import { createOutbound, type BridgeMessage } from '../src/features/minecraft/outbound';
import type { BotFrame, PlayerListData } from '../src/features/minecraft/protocol';
import { RateLimiter } from '../src/features/minecraft/rateLimit';
import { Cards } from '../src/features/minecraft/render/cards';
import { Fonts } from '../src/features/minecraft/render/fonts';
import { DirectorySource, texturePath } from '../src/features/minecraft/render/resources';
import { createMessageHandler } from '../src/handlers/messageCreate';

const GLOBAL = '111111111111111111';

test('a message that is only the name of a command is that command, in any case and with blanks around', () => {
  assert.equal(bareCommand('playerlist'), 'playerlist');
  assert.equal(bareCommand('  PlayerList \n'), 'playerlist');
  assert.equal(bareCommand('playerlist please'), null);
  assert.equal(bareCommand('hola playerlist'), null);
  assert.equal(bareCommand('playerinfo'), null);
  assert.equal(bareCommand(''), null);
});

test('a bare playerlist is not bridged to the game as chat', async () => {
  const sent: BotFrame[] = [];
  const outbound = createOutbound({
    link: { connected: true, features: [], send: frame => (sent.push(frame), true) },
    channels: channelMapOf({ global: GLOBAL }),
    directory: { byDiscordId: async () => ({ discord_id: '2'.repeat(18), ign: 'Javithor360', minecraft_status: 'premium' }) },
    links: async () => ({ entries: [], consumed: [] }),
    limiter: new RateLimiter(5, 10_000, () => 0),
    logger: { error: () => {} },
  });
  const message = (content: string): BridgeMessage => ({
    author: { bot: false, id: '2'.repeat(18) },
    webhookId: null,
    channelId: GLOBAL,
    content,
    cleanContent: content,
    attachments: { size: 0, values: () => [] },
    stickers: { size: 0 },
    reference: null,
    fetchReference: async () => Promise.reject(new Error('not a reply')),
    inGuild: () => true,
    react: async () => {},
  });

  await outbound(message('playerlist'));
  assert.deepEqual(sent, []);
  await outbound(message('hola'));
  assert.equal(sent.length, 1);
});

test('the message handler runs a bare command as if it had the prefix, and ignores plain text otherwise', async () => {
  const resolved: string[] = [];
  const registry = { resolve: (name: string) => (resolved.push(name), undefined) } as never;
  const handler = createMessageHandler(registry, message => (message.content.trim() === 'playerlist' ? 'playerlist' : null));
  const message = (content: string) => ({ author: { bot: false }, inGuild: () => true, content }) as unknown as Message;

  await handler(message('playerlist'));
  await handler(message('hola'));
  await handler(message('!tps'));
  await handler(message('  playerlist  '));

  assert.deepEqual(resolved, ['playerlist', 'tps', 'playerlist']);
});

test('the mention is written in the message and notifies nobody, not even as a reply', () => {
  const payload = withSilentMention('123456789012345678', { embeds: [] });
  assert.equal(payload.content, '<@123456789012345678>');
  assert.deepEqual(payload.allowedMentions, { parse: [], repliedUser: false });
  assert.deepEqual(payload.embeds, []);
});

test('the list is an embed with the count in its title and the picture, or the names as text', () => {
  const list: PlayerListData = { online: [{ name: 'AkaGC', nickname: null }, { name: 'Slow', nickname: 'Lento' }], max: 25 };
  const picture = playerListPictureEmbed(list).toJSON();
  assert.match(picture.title ?? '', /\(2\/25\)/);
  assert.equal(picture.image?.url, 'attachment://playerlist.png');
  const text = playerListEmbed(list).toJSON();
  assert.match(text.description ?? '', /Lento/);
});

test('the card of a player is drawn with their head to the left of the name, and without it when there is none', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mc-card-'));
  try {
    const picture = createCanvas(16, 8);
    picture.getContext('2d').fillRect(0, 0, 5, 8);
    const put = (path: string, data: Buffer | string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), data);
    };
    put('assets/minecraft/font/default.json', JSON.stringify({ providers: [{ type: 'bitmap', file: 'minecraft:font/t.png', ascent: 7, height: 8, chars: ['ab'] }] }));
    put(texturePath('minecraft:font/t.png'), picture.toBuffer('image/png'));
    const source = new DirectorySource(root);

    const headCanvas = createCanvas(8, 8);
    headCanvas.getContext('2d').fillStyle = '#ff0000';
    headCanvas.getContext('2d').fillRect(0, 0, 8, 8);
    const head = await loadImage(headCanvas.toBuffer('image/png'));
    const player = { name: 'ab', nickname: null };

    const withHead = await new Cards(new Fonts([source]), source, async () => head).playerCard(player, true);
    const without = await new Cards(new Fonts([source]), source, async () => null).playerCard(player, true);

    const width = async (png: Buffer) => (await loadImage(png)).width;
    assert.equal((await width(withHead)) - (await width(without)), 0, 'the room for the head is kept either way, so the card does not jump');
    const pixels = createCanvas(await width(withHead), (await loadImage(withHead)).height);
    const context = pixels.getContext('2d');
    context.drawImage(await loadImage(withHead), 0, 0);
    // The head is red and sits at the left edge of the box, inside its padding
    const margin = 4;
    const inside = context.getImageData(margin + 8, margin + 8, 2, 2).data;
    assert.equal(inside[0], 255);
    assert.equal(inside[1], 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
