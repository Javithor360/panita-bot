import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import emoji from '../src/commands/utility/emoji';
import { parsePrefixArgs, type ParseResult } from '../src/core/prefixParser';
import { getRegistry } from '../src/core/registry';
import { UserError } from '../src/core/errors';
import { emojiImages, emojiSourceUrl, isValidEmojiName, parseEmoji, twemojiCodepoints, unicodeImage } from '../src/features/info/emojiParse';
import {
  allowedImageUrl,
  downloadImage,
  MAX_EMOJI_BYTES,
  MAX_SOURCE_BYTES,
  prepareEmojiImage,
  sniffImage,
  slotProblem,
} from '../src/features/info/emojiMedia';
import { emojiLogEmbed, emojiMessage } from '../src/features/info/emojiView';

test('custom emojis are read from their markup, animated ones too', () => {
  assert.deepEqual(parseEmoji('<:pepe:123456789012345678>'), { kind: 'custom', id: '123456789012345678', name: 'pepe', animated: false });
  assert.deepEqual(parseEmoji(' <a:baile:987654321098765432> '), { kind: 'custom', id: '987654321098765432', name: 'baile', animated: true });
});

test('a shortcode, an ID or a name point at an emoji of the server', () => {
  assert.deepEqual(parseEmoji(':pepe:'), { kind: 'name', name: 'pepe' });
  assert.deepEqual(parseEmoji('pepe'), { kind: 'name', name: 'pepe' });
  assert.deepEqual(parseEmoji('123456789012345678'), { kind: 'id', id: '123456789012345678' });
});

test('unicode emojis are read, with flags, keycaps and joined sequences as one', () => {
  assert.deepEqual(parseEmoji('😀'), { kind: 'unicode', chars: '😀', codepoints: '1f600' });
  assert.deepEqual(parseEmoji('😀 hola'), { kind: 'unicode', chars: '😀', codepoints: '1f600' });
  assert.deepEqual(parseEmoji('🇸🇻'), { kind: 'unicode', chars: '🇸🇻', codepoints: '1f1f8-1f1fb' });
  assert.deepEqual(parseEmoji('1️⃣'), { kind: 'unicode', chars: '1️⃣', codepoints: '31-20e3' });
  assert.deepEqual(parseEmoji('👨‍👩‍👧'), { kind: 'unicode', chars: '👨‍👩‍👧', codepoints: '1f468-200d-1f469-200d-1f467' });
});

test('the variation selector is dropped from a Twemoji file name unless the emoji is a joined sequence', () => {
  assert.equal(twemojiCodepoints('❤️'), '2764');
  assert.equal(twemojiCodepoints('👁️‍🗨️'), '1f441-fe0f-200d-1f5e8-fe0f');
});

test('anything else is not an emoji', () => {
  for (const text of ['', '   ', '!!', 'a', '<:x:1>', '<:pepe:123>']) assert.equal(parseEmoji(text), null, JSON.stringify(text));
});

test('the pictures of an emoji: big to show, full size to download, a GIF only if it moves', () => {
  assert.deepEqual(emojiImages('123456789012345678', false), {
    image: 'https://cdn.discordapp.com/emojis/123456789012345678.png?size=1024',
    png: 'https://cdn.discordapp.com/emojis/123456789012345678.png?size=4096',
    webp: 'https://cdn.discordapp.com/emojis/123456789012345678.webp?size=4096',
    gif: null,
  });
  const moving = emojiImages('123456789012345678', true);
  assert.equal(moving.image, 'https://cdn.discordapp.com/emojis/123456789012345678.gif?size=1024');
  assert.equal(moving.gif, 'https://cdn.discordapp.com/emojis/123456789012345678.gif?size=4096');
  assert.equal(emojiSourceUrl('1', true), 'https://cdn.discordapp.com/emojis/1.gif?size=128');
  assert.equal(unicodeImage('1f600'), 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/1f600.png');
});

test('emoji names are letters, numbers and underscores, from 2 to 32', () => {
  for (const name of ['pe', 'pepe_2', 'A'.repeat(32)]) assert.equal(isValidEmojiName(name), true, name);
  for (const name of ['p', 'pepe-2', 'pe pe', 'ñandú', 'A'.repeat(33), '']) assert.equal(isValidEmojiName(name), false, name);
});

const bytes = (...values: number[]) => Uint8Array.from(values);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const webpHeader = (animated: boolean) => {
  const header = new Uint8Array(32);
  header.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
  header[20] = animated ? 0x02 : 0x00;
  return header;
};

test('a file is recognized by its first bytes, and a lie in its name does not matter', () => {
  assert.deepEqual(sniffImage(PNG), { kind: 'png', animated: false });
  assert.deepEqual(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0)), { kind: 'jpeg', animated: false });
  assert.deepEqual(sniffImage(Buffer.from('GIF89a......')), { kind: 'gif', animated: true });
  assert.deepEqual(sniffImage(Buffer.from('GIF87a......')), { kind: 'gif', animated: true });
  assert.deepEqual(sniffImage(webpHeader(false)), { kind: 'webp', animated: false });
  assert.deepEqual(sniffImage(webpHeader(true)), { kind: 'webp', animated: true });
  for (const junk of [Buffer.from('<html>not an image</html>'), Buffer.from(''), bytes(0x47, 0x49, 0x46)]) assert.equal(sniffImage(junk), null);
});

test('only https images of Discord\'s own hosts are accepted, and lookalikes are not', () => {
  assert.ok(allowedImageUrl('https://cdn.discordapp.com/attachments/1/2/a.png'));
  assert.ok(allowedImageUrl('https://media.discordapp.net/attachments/1/2/a.png?ex=1'));
  for (const bad of [
    'http://cdn.discordapp.com/a.png',
    'https://example.com/a.png',
    'https://cdn.discordapp.com.evil.com/a.png',
    'https://evil.com/cdn.discordapp.com/a.png',
    'https://cdn.discordapp.com@evil.com/a.png',
    'ftp://cdn.discordapp.com/a.png',
    'not a link',
    '',
  ]) assert.equal(allowedImageUrl(bad), null, bad);
});

const response = (body: Uint8Array | Buffer, init: ResponseInit & { url?: string } = {}) => {
  const result = new Response(body, init);
  if (init.url) Object.defineProperty(result, 'url', { value: init.url });
  return result;
};

test('a download from Discord returns the bytes; any other host never even gets a request', async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; return response(PNG, { status: 200 }); }) as unknown as typeof fetch;

  assert.deepEqual([...(await downloadImage('https://cdn.discordapp.com/a.png', fetcher))], [...PNG]);
  await assert.rejects(downloadImage('https://evil.com/a.png', fetcher), (e: unknown) => e instanceof UserError && /solo acepto imágenes de Discord/.test(e.message));
  assert.equal(calls, 1);
});

test('a failed, redirected-away, interrupted or oversized download is refused with a message', async () => {
  const failing = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
  await assert.rejects(downloadImage('https://cdn.discordapp.com/a.png', failing), /no pude descargar/);

  const missing = (async () => response(PNG, { status: 404 })) as unknown as typeof fetch;
  await assert.rejects(downloadImage('https://cdn.discordapp.com/a.png', missing), /no pude descargar/);

  const redirected = (async () => response(PNG, { status: 200, url: 'https://evil.com/a.png' })) as unknown as typeof fetch;
  await assert.rejects(downloadImage('https://cdn.discordapp.com/a.png', redirected), /solo acepto imágenes de Discord/);

  const declared = (async () => response(PNG, { status: 200, headers: { 'content-length': String(MAX_SOURCE_BYTES + 1) } })) as unknown as typeof fetch;
  await assert.rejects(downloadImage('https://cdn.discordapp.com/a.png', declared), /máximo es 8 MB/);

  const big = (async () => response(new Uint8Array(MAX_SOURCE_BYTES + 1), { status: 200 })) as unknown as typeof fetch;
  await assert.rejects(downloadImage('https://cdn.discordapp.com/a.png', big), /máximo es 8 MB/);
});

const noisyPng = (side: number) => {
  const canvas = createCanvas(side, side);
  const context = canvas.getContext('2d');
  const image = context.createImageData(side, side);
  for (let i = 0; i < image.data.length; i++) image.data[i] = i % 4 === 3 ? 255 : Math.floor(Math.random() * 256);
  context.putImageData(image, 0, 0);
  return canvas.toBuffer('image/png');
};

test('a small PNG or JPEG goes through untouched, and a small GIF counts as animated', async () => {
  const png = noisyPng(16);
  const kept = await prepareEmojiImage(png);
  assert.equal(kept.data, png);
  assert.deepEqual({ animated: kept.animated, resized: kept.resized }, { animated: false, resized: false });

  const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(100)]);
  assert.deepEqual(await prepareEmojiImage(gif), { data: gif, animated: true, resized: false });
});

test('a static image over 256 KB is really shrunk into a PNG that fits in 128 pixels', async () => {
  const big = noisyPng(600);
  assert.ok(big.length > MAX_EMOJI_BYTES, `the test image must be big (${big.length})`);

  const prepared = await prepareEmojiImage(big);
  assert.equal(prepared.resized, true);
  assert.equal(prepared.animated, false);
  assert.ok(prepared.data.length <= MAX_EMOJI_BYTES);
  assert.equal(sniffImage(prepared.data)?.kind, 'png');

  const shrunk = await loadImage(prepared.data);
  assert.equal(shrunk.width, 128);
  assert.equal(shrunk.height, 128);
});

test('shrinking keeps the shape of a wide image and never makes a small one bigger', async () => {
  const wide = createCanvas(900, 300);
  const context = wide.getContext('2d');
  const image = context.createImageData(900, 300);
  for (let i = 0; i < image.data.length; i++) image.data[i] = i % 4 === 3 ? 255 : Math.floor(Math.random() * 256);
  context.putImageData(image, 0, 0);
  const prepared = await prepareEmojiImage(wide.toBuffer('image/png'));
  const result = await loadImage(prepared.data);
  assert.deepEqual([result.width, result.height], [128, 43]);

  const tinyStillWebp = createCanvas(20, 20).toBuffer('image/webp');
  const converted = await prepareEmojiImage(tinyStillWebp);
  const small = await loadImage(converted.data);
  assert.deepEqual([converted.resized, small.width, small.height, sniffImage(converted.data)?.kind], [true, 20, 20, 'png']);
});

test('what cannot be an emoji is refused with a reason', async () => {
  await assert.rejects(prepareEmojiImage(Buffer.from('<html></html>')), /no es una imagen válida/);
  await assert.rejects(prepareEmojiImage(Buffer.from(webpHeader(true))), /WebP animado/);
  const bigGif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(MAX_EMOJI_BYTES + 10)]);
  await assert.rejects(prepareEmojiImage(bigGif), /animado pesa más de 256 KB/);
  await assert.rejects(prepareEmojiImage(Buffer.concat([Buffer.from(PNG), Buffer.alloc(MAX_EMOJI_BYTES)])), /no pude leer la imagen/);
  await assert.rejects(prepareEmojiImage(noisyPng(600), async () => Buffer.alloc(MAX_EMOJI_BYTES + 1)), /sigue pesando/);
});

test('a server with no room left for that kind of emoji says so', () => {
  assert.equal(slotProblem({ animated: false, boostTier: 0, still: 49, animatedCount: 50 }), null);
  assert.match(slotProblem({ animated: false, boostTier: 0, still: 50, animatedCount: 0 })!, /normales.*50\/50/);
  assert.match(slotProblem({ animated: true, boostTier: 1, still: 0, animatedCount: 100 })!, /animados.*100\/100/);
  assert.equal(slotProblem({ animated: true, boostTier: 3, still: 0, animatedCount: 100 }), null);
});

test('showing an emoji is just the big picture, with download links for a custom one', () => {
  const images = emojiImages('123456789012345678', false);
  const message = emojiMessage({ name: 'pepe', id: '123456789012345678', animated: false, imageUrl: images.image, links: images, info: false, serverName: null, createdAt: null, random: () => 0 });
  const json = (message.embeds![0] as any).toJSON();

  assert.equal(json.image.url, images.image);
  assert.equal(json.title, undefined);
  assert.equal(json.fields, undefined);
  assert.deepEqual((message.components![0] as any).toJSON().components.map((b: any) => b.label), ['PNG', 'WebP']);

  const animated = emojiMessage({ name: 'baile', id: '123456789012345678', animated: true, imageUrl: 'https://cdn.example/x.gif', links: emojiImages('123456789012345678', true), info: false, serverName: null, createdAt: null });
  assert.deepEqual((animated.components![0] as any).toJSON().components.map((b: any) => b.label), ['PNG', 'WebP', 'GIF']);
});

test('--info adds the name, ID, motion, date and server, and a unicode emoji has no download links', () => {
  const images = emojiImages('123456789012345678', true);
  const info = (emojiMessage({
    name: 'baile', id: '123456789012345678', animated: true, imageUrl: images.image, links: images, info: true,
    serverName: 'Panitacraft', createdAt: new Date('2026-11-19T00:00:00Z'),
  }).embeds![0] as any).toJSON();
  assert.equal(info.title, ':baile:');
  assert.deepEqual(info.fields.map((f: any) => [f.name, f.value]).slice(0, 3), [['Nombre', '`:baile:`'], ['ID', '`123456789012345678`'], ['Animado', 'Sí']]);
  assert.equal(info.fields.find((f: any) => f.name === 'Servidor').value, 'Panitacraft');
  assert.match(info.fields.find((f: any) => f.name === 'Creado').value, /^<t:\d+:D> \(<t:\d+:R>\)$/);

  const unicode = emojiMessage({ name: '😀', id: null, animated: false, imageUrl: unicodeImage('1f600'), links: null, info: true, serverName: null, createdAt: null });
  assert.deepEqual(unicode.components, []);
  assert.equal(((unicode.embeds![0] as any).toJSON().fields as any[]).find(f => f.name === 'Nombre').value, 'Emoji de Unicode');
});

test('the mod log entry says what changed, to which emoji and who did it', () => {
  const json = emojiLogEmbed({ change: 'rename', moderatorId: '9', name: 'nuevo', id: '123456789012345678', imageUrl: 'https://cdn/x.png', previousName: 'viejo' }).toJSON();
  assert.equal(json.author?.name, '[EMOJI] Emoji renombrado');
  assert.deepEqual(json.fields?.map(f => f.name), ['Emoji', 'Moderador', 'Antes']);
  assert.equal(json.fields?.[1].value, '<@9>');
  assert.equal(emojiLogEmbed({ change: 'add', moderatorId: '9', name: 'x1', id: '1', imageUrl: 'https://cdn.example/u.png' }).toJSON().fields?.length, 2);
});

/** The schema and prefix settings of the real command. */
const schema = (emoji.data.toJSON().options ?? []) as any[];
const parse = (raw: string): ParseResult => parsePrefixArgs(raw, schema, {
  defaultSubcommand: emoji.prefix.defaultSubcommand,
  subcommandAliases: emoji.prefix.subcommandAliases,
});
const parsed = (raw: string) => {
  const result = parse(raw);
  assert.equal(result.kind, 'ok', `${raw} -> ${JSON.stringify(result)}`);
  return result as Extract<ParseResult, { kind: 'ok' }>;
};

test('!emoji with just an emoji shows it, because the default subcommand is ver', () => {
  const result = parsed('<:pepe:123456789012345678>');
  assert.equal(result.subcommand, 'ver');
  assert.deepEqual(result.values.get('emoji'), { type: 'string', value: '<:pepe:123456789012345678>' });
  assert.deepEqual(parsed('pepe --info').values.get('info'), { type: 'boolean', value: true });
  assert.deepEqual(parsed('😀').values.get('emoji'), { type: 'string', value: '😀' });
});

test('add, remove and rename are their own subcommands, with Spanish aliases', () => {
  const add = parsed('add pepe https://cdn.discordapp.com/emojis/1.png');
  assert.equal(add.subcommand, 'add');
  assert.deepEqual(add.values.get('nombre'), { type: 'string', value: 'pepe' });
  assert.deepEqual(add.values.get('origen'), { type: 'string', value: 'https://cdn.discordapp.com/emojis/1.png' });

  assert.equal(parsed('agregar pepe').subcommand, 'add');
  assert.equal(parsed('remove pepe').subcommand, 'remove');
  assert.equal(parsed('eliminar pepe').subcommand, 'remove');
  const rename = parsed('rename pepe pepito');
  assert.equal(rename.subcommand, 'rename');
  assert.deepEqual([rename.values.get('emoji'), rename.values.get('nombre')], [{ type: 'string', value: 'pepe' }, { type: 'string', value: 'pepito' }]);
  assert.equal(parsed('renombrar pepe pepito').subcommand, 'rename');
});

test('add with an attachment needs no link, and the aliases of the command are registered', () => {
  const result = parsePrefixArgs('add pepe', schema, { defaultSubcommand: 'ver', subcommandAliases: emoji.prefix.subcommandAliases, attachmentCount: 1 });
  assert.equal(result.kind, 'ok');
  assert.ok((result as Extract<ParseResult, { kind: 'ok' }>).values.has('imagen'));

  const registry = getRegistry();
  assert.equal(registry.resolve('emoji')?.data.name, 'emoji');
  for (const alias of ['emote', 'e']) assert.equal(registry.resolve(alias)?.data.name, 'emoji', alias);
});

const member = (staff: boolean) => ({ id: '42', displayName: 'Aaron', roles: { cache: new Map(staff ? [['test', {}]] : []) } }) as any;

const fakeContext = (options: { subcommand: string; strings?: Record<string, string>; staff: boolean }) => {
  const replies: any[] = [];
  let created = 0;
  const ctx = {
    member: member(options.staff),
    user: { id: '42', tag: 'aaron' },
    options: {
      getSubcommand: () => options.subcommand,
      getString: (name: string) => options.strings?.[name] ?? null,
      getBoolean: () => null,
      getAttachment: () => null,
    },
    guild: {
      premiumTier: 0,
      emojis: { cache: { get: () => undefined, find: () => undefined, values: () => [].values() }, fetch: async () => null, create: async () => { created++; } },
      members: { me: { permissions: { has: () => true } } },
    },
    client: { emojis: { cache: { get: () => undefined, find: () => undefined } } },
    reply: async (payload: any) => { replies.push(payload); },
    defer: async () => {},
    customId: (action: string, args: string[]) => `emoji:${action}:${args.join(':')}`,
  } as any;
  return { ctx, replies, created: () => created };
};

test('add, remove and rename are for staff only, even though the command is open to everyone', async () => {
  for (const subcommand of ['add', 'remove', 'rename']) {
    const { ctx, replies, created } = fakeContext({ subcommand, strings: { nombre: 'pepe', emoji: 'pepe', origen: 'https://cdn.discordapp.com/a.png' }, staff: false });
    await emoji.run(ctx);

    assert.equal(replies.length, 1, subcommand);
    assert.match(replies[0].content, /^<:cross:\d+> ~ \*\*Aaron\*\*, no tienes permisos de Staff para usar este comando\.$/, subcommand);
    assert.equal(replies[0].ephemeral, true);
    assert.equal(created(), 0);
  }
});

test('viewing an emoji is open to everyone, and an unknown one gets Noa\'s refusal with the usage', async () => {
  const unknown = fakeContext({ subcommand: 'ver', strings: { emoji: 'zzz' }, staff: false });
  await emoji.run(unknown.ctx);
  const lines = unknown.replies[0].content.split('\n');
  assert.match(lines[0], /^<:cross:\d+> ~ \*\*Aaron\*\*, emoji no encontrado\.$/);
  assert.equal(lines[1], '> **Uso:** `!emoji <emoji> [--info]`');
  assert.equal(lines.length, 5);

  const custom = fakeContext({ subcommand: 'ver', strings: { emoji: '<:pepe:123456789012345678>' }, staff: false });
  await emoji.run(custom.ctx);
  assert.equal(custom.replies[0].embeds[0].toJSON().image.url, 'https://cdn.discordapp.com/emojis/123456789012345678.png?size=1024');
});

test('the confirm and cancel buttons of remove only work for staff', () => {
  const press = (staff: boolean) => ({ inCachedGuild: () => true, member: member(staff) }) as any;
  for (const action of ['confirmremove', 'cancelremove'] as const) {
    const { guard } = emoji.components[action];
    assert.match(String(guard!(press(false), [])), /no tienes permisos de Staff/, action);
    assert.equal(guard!(press(true), []), null, action);
  }
});
