import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { zipSync } from 'fflate';
import { Cards, pingSprite, runsOf } from '../src/features/minecraft/render/cards';
import { Fonts, SCALE } from '../src/features/minecraft/render/fonts';
import { createCardProvider } from '../src/features/minecraft/render/provider';
import { DirectorySource, ZipSource, texturePath } from '../src/features/minecraft/render/resources';
import type { ListedPlayer } from '../src/features/minecraft/protocol';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** A picture of 16x8 pixels in which the first glyph is 5 columns wide and the second is 4, each in its own cell of 8. */
const fontPicture = () => {
  const canvas = createCanvas(16, 8);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 5, 8);
  context.fillRect(8, 0, 4, 8);
  return canvas.toBuffer('image/png');
};

const put = (root: string, path: string, data: Buffer | string) => {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
};

const DEFAULT_FONT = {
  providers: [
    { type: 'space', advances: { ' ': 4 } },
    { type: 'bitmap', file: 'minecraft:font/test.png', ascent: 7, height: 8, chars: ['ab'] },
  ],
};

const folder = (files: Record<string, Buffer | string> = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'mc-fonts-'));
  put(root, 'assets/minecraft/font/default.json', JSON.stringify(DEFAULT_FONT));
  put(root, texturePath('minecraft:font/test.png'), fontPicture());
  for (const [path, data] of Object.entries(files)) put(root, path, data);
  return { root, done: () => rmSync(root, { recursive: true, force: true }) };
};

test('a glyph is as wide as its last visible column plus one, and a space is what its provider says', async () => {
  const { root, done } = folder();
  try {
    const fonts = new Fonts([new DirectorySource(root)]);
    await fonts.ensure([]);
    assert.equal(fonts.layout([{ text: 'a' }]).width, (5 + 1) * SCALE);
    assert.equal(fonts.layout([{ text: 'ab' }]).width, (5 + 1) * SCALE + (4 + 1) * SCALE);
    assert.equal(fonts.layout([{ text: 'a b' }]).width, (5 + 1) * SCALE + 4 * SCALE + (4 + 1) * SCALE);
  } finally {
    done();
  }
});

test('bold adds a pixel to each glyph, and a glyph the font lacks takes the room of a box', async () => {
  const { root, done } = folder();
  try {
    const fonts = new Fonts([new DirectorySource(root)]);
    await fonts.ensure([]);
    assert.equal(fonts.layout([{ text: 'ab', bold: true }]).width, (5 + 1) * SCALE + (4 + 1) * SCALE + 2 * SCALE);
    assert.equal(fonts.layout([{ text: 'z' }]).width, 6 * SCALE);
    assert.equal(fonts.layout([]).width, 0);
  } finally {
    done();
  }
});

test('an unknown font is empty and a font that refers to itself does not loop', async () => {
  const { root, done } = folder({
    'assets/panita/font/loop.json': JSON.stringify({ providers: [{ type: 'reference', id: 'panita:loop' }] }),
  });
  try {
    const fonts = new Fonts([new DirectorySource(root)]);
    await fonts.ensure(['panita:loop', 'panita:missing']);
    assert.equal(fonts.layout([{ text: 'ab', font: 'panita:loop' }]).width, 12 * SCALE);
    assert.equal(fonts.layout([{ text: 'a', font: 'panita:missing' }]).width, 6 * SCALE);
  } finally {
    done();
  }
});

test('a font of a pack adds its glyphs and wins over the game for the same font', async () => {
  const { root, done } = folder();
  try {
    const picture = createCanvas(8, 8);
    picture.getContext('2d').fillRect(0, 0, 8, 8);
    const pack = zipSync({
      'assets/panita/font/ranks.json': Buffer.from(JSON.stringify({ providers: [{ type: 'bitmap', file: 'panita:font/rank.png', ascent: 7, height: 8, chars: [''] }] })),
      'assets/panita/textures/font/rank.png': new Uint8Array(picture.toBuffer('image/png')),
    });
    const fonts = new Fonts([new ZipSource(pack), new DirectorySource(root)]);
    await fonts.ensure(['panita:ranks']);
    assert.equal(fonts.layout([{ text: '', font: 'panita:ranks' }]).width, (8 + 1) * SCALE);
  } finally {
    done();
  }
});

test('unifont glyphs come from the hex file at half size', async () => {
  const hex = Buffer.from('0041:F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0\n0042:\n');
  const zip = zipSync({ 'unifont.hex': new Uint8Array(hex) });
  const { root, done } = folder({
    'assets/minecraft/font/default.json': JSON.stringify({ providers: [{ type: 'unihex', hex_file: 'minecraft:font/unifont.zip', size_overrides: [] }] }),
    'assets/minecraft/font/unifont.zip': Buffer.from(zip),
  });
  try {
    const fonts = new Fonts([new DirectorySource(root)]);
    await fonts.ensure([]);
    // Four hex pixels wide, one canvas pixel each, and a pixel of the game's space after it
    assert.equal(fonts.layout([{ text: 'A' }]).width, 4 + SCALE);
  } finally {
    done();
  }
});

const PLAYERS: ListedPlayer[] = [
  { name: 'AkaGC', nickname: null, ping: 40, display: [{ text: '[PANITA] ', color: '#aa00ff', bold: true }, { text: 'AkaGC' }] },
  { name: 'Slow', nickname: 'Lento', ping: 1500 },
];

test('the latency icon follows the game: more bars for less delay', () => {
  assert.equal(pingSprite(0), 'ping_5');
  assert.equal(pingSprite(149), 'ping_5');
  assert.equal(pingSprite(150), 'ping_4');
  assert.equal(pingSprite(299), 'ping_4');
  assert.equal(pingSprite(300), 'ping_3');
  assert.equal(pingSprite(600), 'ping_2');
  assert.equal(pingSprite(1000), 'ping_1');
  assert.equal(pingSprite(undefined), 'ping_unknown');
});

test('a player without a line shows the name they use in chat', () => {
  assert.deepEqual(runsOf({ name: 'Slow', nickname: 'Lento' }), [{ text: 'Lento' }]);
  assert.deepEqual(runsOf({ name: 'Slow', nickname: null }), [{ text: 'Slow' }]);
  assert.deepEqual(runsOf({ name: 'Slow', nickname: null, display: [] }), [{ text: 'Slow' }]);
  assert.equal(runsOf(PLAYERS[0]).length, 2);
});

test('draws the list and the card as pictures, whether or not the heads and icons could be had', async () => {
  const { root, done } = folder();
  try {
    const source = new DirectorySource(root);
    const cards = new Cards(new Fonts([source]), source, async () => null);
    const list = await cards.playerList(PLAYERS, 25);
    const card = await cards.playerCard(PLAYERS[0], true);
    const away = await cards.playerCard(PLAYERS[1], false);
    for (const picture of [list, card, away]) assert.deepEqual(picture.subarray(0, 4), PNG_SIGNATURE);
    // The picture grows with what it holds
    const empty = await cards.playerList([], 25);
    assert.ok(list.length > empty.length);
  } finally {
    done();
  }
});

test('the provider keeps working with the game fonts when the pack cannot be downloaded, and renews after its time', async () => {
  const { root, done } = folder();
  try {
    let now = 1_000;
    const requested: string[] = [];
    const errors: unknown[] = [];
    const provider = createCardProvider({
      assetsDir: root,
      packUrl: 'https://packs.test/pack.zip',
      avatars: { premium: 'https://h.test/{uuid}', cracked: 'https://h.test/steve', skin: 'https://h.test/{skin}' },
      logger: { log: () => {}, error: error => errors.push(error) },
      now: () => now,
      fetchFile: async url => {
        requested.push(url);
        throw new Error('down');
      },
    });
    const first = await provider();
    assert.ok(first);
    assert.equal(await provider(), first, 'kept while it is fresh');
    assert.equal(errors.length, 1);
    now += 7 * 60 * 60 * 1000;
    const second = await provider();
    assert.ok(second);
    assert.notEqual(second, first, 'renewed once the pack is old');
    assert.equal(requested.filter(url => url.endsWith('pack.zip')).length, 2);
  } finally {
    done();
  }
});

test('a path that leaves the folder is never read', async () => {
  const { root, done } = folder();
  try {
    assert.equal(await new DirectorySource(root).read('../../etc/passwd'), null);
    assert.equal(await new DirectorySource(root).read('assets/minecraft/font/nothing.json'), null);
    assert.ok(await new DirectorySource(root).read('assets/minecraft/font/default.json'));
  } finally {
    done();
  }
});
