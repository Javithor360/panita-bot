import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UserError } from '../src/core/errors';
import { CommandRegistry } from '../src/core/registry';
import { claimTurn, OCR_COOLDOWN_MS, readImage } from '../src/features/ocr/read';
import { downloadImage, imageUrlOf, isDiscordUrl, MAX_IMAGE_BYTES } from '../src/features/ocr/source';
import { ocrMessage } from '../src/features/ocr/view';
import { createCooldown } from '../src/lib/cooldown';
import { cleanText, createOcr } from '../src/lib/ocr';
import { buildContextMenuPayload } from '../src/services/commandDeploy';

const CDN = 'https://cdn.discordapp.com/attachments/1/2/shot.png';
const PROXY = 'https://images-ext-1.discordapp.net/external/abc/https/site.test/preview.png';

const image = (body: Uint8Array | string, headers: Record<string, string> = { 'content-type': 'image/png' }) =>
  new Response(body, { status: 200, headers });

test('cleanText trims and collapses blank lines', () => {
  assert.equal(cleanText('  hola  \r\n\n\n\n mundo \n'), 'hola\n\n mundo');
  assert.equal(cleanText('   \n '), '');
});

test('the engine reads images one at a time and creates its worker once', async () => {
  let created = 0;
  let running = 0;
  let peak = 0;
  const ocr = createOcr(async () => {
    created += 1;
    return {
      async recognize(buffer) {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise(resolve => setTimeout(resolve, 5));
        running -= 1;
        return { data: { text: ` ${buffer.toString()} ` } };
      },
    };
  });

  const texts = await Promise.all(['a', 'b', 'c'].map(letter => ocr.readText(Buffer.from(letter))));
  assert.deepEqual(texts, ['a', 'b', 'c']);
  assert.equal(created, 1);
  assert.equal(peak, 1);
});

test('the engine refuses new images when too many are waiting', async () => {
  const ocr = createOcr(async () => ({
    async recognize() {
      await new Promise(resolve => setTimeout(resolve, 10));
      return { data: { text: 'x' } };
    },
  }));

  const jobs = Array.from({ length: 4 }, () => ocr.readText(Buffer.from('x')));
  assert.throws(() => ocr.readText(Buffer.from('x')), UserError);
  await Promise.all(jobs);
  // Once the queue drains it accepts images again
  assert.equal(await ocr.readText(Buffer.from('x')), 'x');
});

test('a failed worker start is retried on the next image', async () => {
  let attempts = 0;
  const ocr = createOcr(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('no network');
    return { async recognize() { return { data: { text: 'ok' } }; } };
  });

  await assert.rejects(ocr.readText(Buffer.from('x')), /no network/);
  assert.equal(await ocr.readText(Buffer.from('x')), 'ok');
});

test('imageUrlOf prefers attached pictures and falls back to the proxy copy of a link preview', () => {
  const text = { url: 'https://cdn.discordapp.com/f.txt', contentType: 'text/plain' };
  const png = { url: CDN, contentType: 'image/png; charset=binary' };
  assert.equal(imageUrlOf({ attachments: [text, png], embeds: [] }), CDN);
  assert.equal(imageUrlOf({ attachments: [text], embeds: [{ image: { proxyURL: PROXY } }] }), PROXY);
  assert.equal(imageUrlOf({ attachments: [], embeds: [{ thumbnail: { proxyURL: PROXY } }] }), PROXY);
  assert.equal(imageUrlOf({ attachments: [{ url: CDN, contentType: 'image/gif' }], embeds: [{}] }), null);
});

test('only https Discord hosts are downloaded', () => {
  assert.equal(isDiscordUrl(CDN), true);
  assert.equal(isDiscordUrl(PROXY), true);
  assert.equal(isDiscordUrl('https://media.discordapp.net/a.png'), true);
  assert.equal(isDiscordUrl('http://cdn.discordapp.com/a.png'), false);
  assert.equal(isDiscordUrl('https://evil.test/a.png'), false);
  assert.equal(isDiscordUrl('https://cdn.discordapp.com.evil.test/a.png'), false);
  assert.equal(isDiscordUrl('not a url'), false);
});

test('downloadImage refuses other hosts, file types and big files', async () => {
  await assert.rejects(downloadImage('https://evil.test/a.png', async () => image('x')), /host/);
  await assert.rejects(downloadImage(CDN, async () => image('x', { 'content-type': 'text/html' })), /type/);
  await assert.rejects(
    downloadImage(CDN, async () => image('x', { 'content-type': 'image/png', 'content-length': String(MAX_IMAGE_BYTES + 1) })),
    /size/,
  );
  await assert.rejects(downloadImage(CDN, async () => new Response('no', { status: 404 })), /404/);
  assert.equal((await downloadImage(CDN, async () => image('pixels'))).toString(), 'pixels');
});

test('ocrMessage cuts long text, protects the code block and never pings', () => {
  const short = ocrMessage('@everyone ``` hola');
  const description = short.embeds![0].toJSON().description!;
  assert.ok(!description.slice(4, -4).includes('```'));
  assert.deepEqual(short.allowedMentions, { parse: [] });

  const long = ocrMessage('a'.repeat(5000)).embeds![0].toJSON();
  assert.ok(long.description!.length <= 4096);
  assert.match(long.footer!.text, /cortó/);
});

test('claimTurn lets a person read once per window', () => {
  let now = 0;
  const cooldown = createCooldown(OCR_COOLDOWN_MS, () => now);
  claimTurn('1', cooldown);
  assert.throws(() => claimTurn('1', cooldown), UserError);
  claimTurn('2', cooldown);
  now += OCR_COOLDOWN_MS;
  claimTurn('1', cooldown);
});

test('the cooldown is within the range the staff asked for', () => {
  assert.ok(OCR_COOLDOWN_MS >= 10_000 && OCR_COOLDOWN_MS <= 20_000);
});

test('readImage reads the text, and explains when there is none or the image cannot be downloaded', async t => {
  t.mock.method(globalThis, 'fetch', async () => image('pixels'));
  const message = await readImage(CDN, async buffer => `leído ${buffer.toString()}`);
  assert.match(message.embeds![0].toJSON().description!, /leído pixels/);

  await assert.rejects(readImage(CDN, async () => ''), /no encontré texto/);
  await assert.rejects(readImage('https://evil.test/a.png', async () => 'x'), /no pude descargar/);
});

test('the ocr command registers a "Leer texto" message menu in the deploy payload', () => {
  const payload = buildContextMenuPayload(new CommandRegistry());
  const menu = payload.find(entry => entry.name === 'Leer texto');
  assert.ok(menu);
  assert.equal(menu.type, 3);
});
