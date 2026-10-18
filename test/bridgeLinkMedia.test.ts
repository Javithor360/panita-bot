import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLinkMedia, previewImages } from '../src/features/minecraft/linkMedia';
import { mediaHostAllowed } from '../src/features/minecraft/protocol';

const KLIPY = 'https://klipy.com/gifs/have-a-brain-minecraft';
const KLIPY_PAGE = `<html><head>
<meta property="og:image" content="https://static2.klipy.com/ii/d7ae/45/5b/OvaNYsLo.webp"/>
<meta property="og:image:type" content="image/webp"/>
<meta property="og:image" content="https://static2.klipy.com/ii/d7ae/45/5b/CVdQsFw4.gif"/>
<meta property="og:image:width" content="640"/>
<meta property="og:image:type" content="image/gif"/>
</head></html>`;

const resolver = (pages: Record<string, string | null> = {}) => {
  const asked: string[] = [];
  const links = createLinkMedia({ fetchPage: async url => (asked.push(url), pages[url] ?? null) });
  return { links, asked };
};

test('allows the Discord CDN exactly and the image hosts of the GIF services by subdomain only', () => {
  for (const host of ['cdn.discordapp.com', 'media.discordapp.net', 'static2.klipy.com', 'media.tenor.com', 'media1.tenor.com', 'media.giphy.com', 'MEDIA.GIPHY.COM']) {
    assert.equal(mediaHostAllowed(host), true, host);
  }
  for (const host of ['klipy.com', 'tenor.com', 'evil.example', 'cdn.discordapp.com.evil.example', 'evilklipy.com', 'klipy.com.evil.example', 'discordapp.com', '']) {
    assert.equal(mediaHostAllowed(host), false, host);
  }
});

test('reads the preview images of a page with the type each one says', () => {
  assert.deepEqual(previewImages(KLIPY_PAGE).map(image => image.type), ['image/webp', 'image/gif']);
  assert.deepEqual(previewImages('<meta property="og:image" content="https://a.test/x.png?a=1&amp;b=2">'), [{ url: 'https://a.test/x.png?a=1&b=2', type: null }]);
  assert.deepEqual(previewImages('no tags here'), []);
});

test('a direct link to an image on the Discord CDN is an image as it stands, with no page asked', async () => {
  const { links, asked } = resolver();

  const found = await links('mira https://cdn.discordapp.com/attachments/1/2/enrique.gif?ex=1&is=2 jeje', 4);

  assert.equal(found.entries.length, 1);
  assert.equal(found.entries[0].name, 'enrique.gif');
  assert.equal(found.entries[0].type, 'image/gif');
  assert.equal(found.entries[0].size, 0);
  assert.deepEqual(found.consumed, ['https://cdn.discordapp.com/attachments/1/2/enrique.gif?ex=1&is=2']);
  assert.deepEqual(asked, []);
});

test('a link wrapped in angle brackets or followed by punctuation is still found, without the punctuation', async () => {
  const { links } = resolver();

  assert.equal((await links('<https://cdn.discordapp.com/a/b/c.png>', 4)).entries.length, 1);
  const found = await links('mira https://cdn.discordapp.com/a/b/c.png.', 4);
  assert.deepEqual(found.consumed, ['https://cdn.discordapp.com/a/b/c.png']);
});

test('a Klipy page becomes the GIF it stands for, not the WebP', async () => {
  const { links, asked } = resolver({ [KLIPY]: KLIPY_PAGE });

  const found = await links(KLIPY, 4);

  assert.deepEqual(asked, [KLIPY]);
  assert.equal(found.entries.length, 1);
  assert.equal(found.entries[0].url, 'https://static2.klipy.com/ii/d7ae/45/5b/CVdQsFw4.gif');
  assert.equal(found.entries[0].type, 'image/gif');
  assert.equal(found.entries[0].name, 'have-a-brain-minecraft.gif');
  assert.deepEqual(found.consumed, [KLIPY]);
});

test('a page whose only image is a WebP still gives it, and one with no allowed image gives nothing', async () => {
  const webp = '<meta property="og:image" content="https://media.tenor.com/x/y.webp"><meta property="og:image:type" content="image/webp">';
  const foreign = '<meta property="og:image" content="https://evil.example/x.gif"><meta property="og:image:type" content="image/gif">';
  const { links } = resolver({ 'https://tenor.com/view/a': webp, 'https://tenor.com/view/b': foreign, 'https://tenor.com/view/c': '<html></html>' });

  assert.equal((await links('https://tenor.com/view/a', 4)).entries[0].type, 'image/webp');
  assert.equal((await links('https://tenor.com/view/b', 4)).entries.length, 0);
  assert.equal((await links('https://tenor.com/view/c', 4)).entries.length, 0);
});

test('a page that cannot be read leaves the link in the text', async () => {
  const { links } = resolver({ [KLIPY]: null });

  assert.deepEqual(await links(KLIPY, 4), { entries: [], consumed: [] });
});

test('only the pages of the GIF services are ever asked for, whatever the link', async () => {
  const { links, asked } = resolver();

  await links('https://evil.example/x https://klipy.com.evil.example/x http://klipy.com/x https://169.254.169.254/latest http://localhost/x', 4);

  assert.deepEqual(asked, []);
});

test('stops at the room it was given and at four links', async () => {
  const { links } = resolver();
  const many = Array.from({ length: 8 }, (_, index) => `https://cdn.discordapp.com/a/b/${index}.png`).join(' ');

  assert.equal((await links(many, 4)).entries.length, 4);
  assert.equal((await links(many, 2)).entries.length, 2);
  assert.equal((await links(many, 0)).entries.length, 0);
});

test('the same link twice is one image', async () => {
  const { links } = resolver();

  assert.equal((await links('https://cdn.discordapp.com/a/b/c.png https://cdn.discordapp.com/a/b/c.png', 4)).entries.length, 1);
});
