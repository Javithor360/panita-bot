import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { createHeadLoader, headOfSkin, skinAddressOf } from '../src/features/minecraft/render/heads';
import type { ListedPlayer } from '../src/features/minecraft/protocol';

const AVATARS = { premium: 'https://h.test/{uuid}', cracked: 'https://h.test/steve', skin: 'https://h.test/skin/{skin}' };
const UUID = '8c0f4782-ad24-47f5-b874-885e93c5120c';
const HASH = 'a'.repeat(64);
const PLAYER: ListedPlayer = { name: 'Javi', nickname: null, uuid: UUID, premium: true };

/** A skin of 64 by 64 with a red face and, when asked, a blue layer over it. */
const skinPicture = (layer: boolean, height = 64) => {
  const canvas = createCanvas(64, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ff0000';
  context.fillRect(8, 8, 8, 8);
  if (layer) {
    context.fillStyle = '#0000ff';
    context.fillRect(40, 8, 8, 8);
  }
  return canvas.toBuffer('image/png');
};

const solidPicture = () => {
  const canvas = createCanvas(16, 16);
  const context = canvas.getContext('2d');
  context.fillStyle = '#00ff00';
  context.fillRect(0, 0, 16, 16);
  return canvas.toBuffer('image/png');
};

const profileOf = (address: string) =>
  JSON.stringify({ properties: [{ name: 'textures', value: Buffer.from(JSON.stringify({ textures: { SKIN: { url: address } } })).toString('base64') }] });

const SKIN_ADDRESS = 'https://textures.minecraft.net/texture/' + 'b'.repeat(64);

const pixelOf = async (image: Awaited<ReturnType<typeof headOfSkin>>) => {
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return Array.from(context.getImageData(0, 0, 1, 1).data);
};

const loader = (fetchFile: (url: string) => Promise<Buffer>, errors: string[] = [], clock = { now: 0 }) =>
  createHeadLoader({ avatars: AVATARS, fetchFile, now: () => clock.now, logger: { error: message => errors.push(String(message)) } });

test('the face of a skin is drawn with the layer over it, and an old skin has no layer', async () => {
  assert.deepEqual(await pixelOf(await headOfSkin(skinPicture(false))), [255, 0, 0, 255]);
  assert.deepEqual(await pixelOf(await headOfSkin(skinPicture(true))), [0, 0, 255, 255]);
  assert.deepEqual(await pixelOf(await headOfSkin(skinPicture(true, 32))), [255, 0, 0, 255]);
});

test('the skin address of a profile is only taken when it is on the textures host of Mojang', () => {
  assert.equal(skinAddressOf(profileOf(SKIN_ADDRESS)), SKIN_ADDRESS);
  assert.equal(skinAddressOf(profileOf('https://evil.test/texture/x')), null);
  assert.equal(skinAddressOf(profileOf('http://textures.minecraft.net/texture/x')), null);
  assert.equal(skinAddressOf('not json'), null);
  assert.equal(skinAddressOf(JSON.stringify({ properties: [] })), null);
});

test('the head comes from the avatar template when that works, and Mojang is not asked', async () => {
  const asked: string[] = [];
  const head = await loader(async url => {
    asked.push(url);
    return solidPicture();
  })(PLAYER);

  assert.equal(head?.width, 16);
  assert.deepEqual(asked, ['https://h.test/8c0f4782ad2447f5b874885e93c5120c']);
});

test('a head service that refuses the bot is replaced by the skin of the account, and what failed is logged once', async () => {
  const errors: string[] = [];
  const asked: string[] = [];
  const load = loader(async url => {
    asked.push(url);
    if (url.startsWith('https://h.test/')) throw new Error('403 Forbidden');
    if (url.startsWith('https://sessionserver.mojang.com/session/minecraft/profile/')) return Buffer.from(profileOf(SKIN_ADDRESS));
    if (url === SKIN_ADDRESS) return skinPicture(false);
    throw new Error('unexpected ' + url);
  }, errors);

  const head = await load(PLAYER);
  await load(PLAYER);

  assert.deepEqual(await pixelOf(head!), [255, 0, 0, 255]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Javi.*h\.test.*403 Forbidden.*Mojang/);
  assert.ok(asked.includes('https://sessionserver.mojang.com/session/minecraft/profile/8c0f4782ad2447f5b874885e93c5120c'));
  assert.equal(asked.filter(url => url === SKIN_ADDRESS).length, 1, 'kept, not fetched again');
});

test('a skin hash the server gave is fetched from the textures host without asking for a profile', async () => {
  const asked: string[] = [];
  const head = await loader(async url => {
    asked.push(url);
    if (url.startsWith('https://h.test/')) throw new Error('down');
    return skinPicture(false);
  })({ ...PLAYER, skin: HASH });

  assert.ok(head);
  assert.deepEqual(asked, [`https://h.test/skin/${HASH}`, `https://textures.minecraft.net/texture/${HASH}`]);
});

test('a head that could not be had at all is a gray square, said in the log, and is tried again after a minute', async () => {
  const errors: string[] = [];
  const clock = { now: 0 };
  let fail = true;
  const load = loader(async url => {
    if (fail) throw new Error('down');
    if (url.startsWith('https://h.test/')) return solidPicture();
    throw new Error('unexpected ' + url);
  }, errors, clock);

  assert.equal(await load(PLAYER), null);
  assert.equal(errors.length, 2);
  fail = false;
  clock.now = 30_000;
  assert.equal(await load(PLAYER), null, 'still remembered as missing');
  clock.now = 61_000;
  assert.equal((await load(PLAYER))?.width, 16);
});

test('a player who is not premium and has no skin has no skin to fall back to', async () => {
  const errors: string[] = [];
  const head = await loader(async () => {
    throw new Error('down');
  }, errors)({ name: 'Cracked', nickname: null, premium: false });

  assert.equal(head, null);
  assert.equal(errors.length, 1, 'only the template failed; there was nothing to try from Mojang');
});
