import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StickerType } from 'discord.js';
import sticker from '../src/commands/utility/sticker';
import { parsePrefixArgs, type ParseResult } from '../src/core/prefixParser';
import { getRegistry } from '../src/core/registry';
import { stickerFormatName } from '../src/features/info/labels';
import { findByName, hasPicture, parseStickerQuery } from '../src/features/info/stickerParse';
import { LOTTIE_NOTE, stickerMessage, type StickerViewInput } from '../src/features/info/stickerView';

test('a sticker is pointed at by ID or by name', () => {
  assert.deepEqual(parseStickerQuery('123456789012345678'), { kind: 'id', id: '123456789012345678' });
  assert.deepEqual(parseStickerQuery('  Pepe feliz '), { kind: 'name', name: 'Pepe feliz' });
  for (const bad of ['', '   ', 'a', 'x'.repeat(31), null, undefined]) assert.equal(parseStickerQuery(bad as any), null, String(bad));
});

test('a name is found ignoring case and spaces, and Lottie is the only format without a picture', () => {
  const list = [{ name: 'Pepe' }, { name: 'Baile' }];
  assert.equal(findByName(list, '  pepe '), list[0]);
  assert.equal(findByName(list, 'nada'), null);
  assert.equal(hasPicture(1) && hasPicture(2) && hasPicture(4), true);
  assert.equal(hasPicture(3), false);
  assert.deepEqual([1, 2, 3, 4, 9].map(stickerFormatName), ['PNG', 'APNG', 'Lottie', 'GIF', 'Desconocido']);
});

const input = (extra: Partial<StickerViewInput> = {}): StickerViewInput => ({
  name: 'Pepe',
  id: '123456789012345678',
  description: 'Una rana feliz',
  tags: 'rana, meme',
  format: 'PNG',
  imageUrl: 'https://cdn.discordapp.com/stickers/123456789012345678.png?size=1024',
  serverName: 'Panitacraft',
  standard: false,
  createdAt: new Date('2026-11-19T00:00:00Z'),
  info: false,
  random: () => 0,
  ...extra,
});
const json = (message: ReturnType<typeof stickerMessage>) => (message.embeds![0] as any).toJSON();

test('a sticker is just the big picture, with a link to open it', () => {
  const message = stickerMessage(input());
  assert.equal(json(message).image.url, input().imageUrl);
  assert.equal(json(message).title, undefined);
  assert.equal(json(message).fields, undefined);
  assert.deepEqual((message.components![0] as any).toJSON().components.map((b: any) => [b.label, b.url]), [['Abrir imagen', input().imageUrl]]);
});

test('--info adds the ID, format, origin, tags, description and date', () => {
  const embed = json(stickerMessage(input({ info: true })));
  assert.equal(embed.title, 'Pepe');
  assert.deepEqual(embed.fields.map((f: any) => f.name), ['ID', 'Formato', 'Origen', 'Emoji', 'Descripción', 'Creado']);
  assert.equal(embed.fields.find((f: any) => f.name === 'Origen').value, 'Panitacraft');
  assert.equal(embed.fields.find((f: any) => f.name === 'Formato').value, 'PNG');

  const standard = json(stickerMessage(input({ info: true, standard: true, serverName: null, tags: null, description: null })));
  assert.equal(standard.fields.find((f: any) => f.name === 'Origen').value, 'Paquete de Discord');
  assert.equal(standard.fields.some((f: any) => f.name === 'Emoji'), false);
  const other = json(stickerMessage(input({ info: true, serverName: null })));
  assert.equal(other.fields.find((f: any) => f.name === 'Origen').value, 'Otro servidor');
});

test('a Lottie sticker has no picture: it says why and always shows its information', () => {
  const message = stickerMessage(input({ imageUrl: null, format: 'Lottie' }));
  const embed = json(message);
  assert.equal(embed.description, LOTTIE_NOTE);
  assert.equal(embed.image, undefined);
  assert.ok(embed.fields.some((f: any) => f.name === 'Formato' && f.value === 'Lottie'));
  assert.deepEqual(message.components, []);
});

test('the schema takes a name or ID and --info, and the alias is registered', () => {
  const schema = (sticker.data.toJSON().options ?? []) as any[];
  const parse = (raw: string) => {
    const result: ParseResult = parsePrefixArgs(raw, schema);
    assert.equal(result.kind, 'ok', raw);
    return (result as Extract<ParseResult, { kind: 'ok' }>).values;
  };
  assert.deepEqual(parse('Pepe feliz --info').get('sticker'), { type: 'string', value: 'Pepe feliz' });
  assert.deepEqual(parse('--info').get('info'), { type: 'boolean', value: true });
  assert.equal(parse('').size, 0);

  const registry = getRegistry();
  assert.equal(registry.resolve('sticker')?.data.name, 'sticker');
  assert.equal(registry.resolve('stk')?.data.name, 'sticker');
});

const fakeSticker = (extra: Record<string, unknown> = {}) => ({
  id: '123456789012345678',
  name: 'Pepe',
  description: null,
  tags: 'rana',
  format: 1,
  url: 'https://cdn.discordapp.com/stickers/123456789012345678.png',
  guildId: '707103390852710491',
  type: StickerType.Guild,
  partial: false,
  ...extra,
});

const fakeContext = (options: { text?: string; info?: boolean; stickers?: any[]; trigger?: any; reference?: any; byId?: any }) => {
  const replies: any[] = [];
  const messages: Record<string, any> = { t: options.trigger, r: options.reference };
  const ctx = {
    options: { getString: () => options.text ?? null, getBoolean: () => options.info ?? null },
    member: { displayName: 'Javi' },
    guild: { stickers: { cache: new Map((options.stickers ?? []).map(s => [s.id + s.name, s])) } },
    client: {
      fetchSticker: async () => { if (!options.byId) throw new Error('Unknown Sticker'); return options.byId; },
      guilds: { cache: new Map([['707103390852710491', { name: 'Panitacraft' }]]) },
    },
    channel: { messages: { fetch: async (id: string) => { if (!messages[id]) throw new Error('Unknown Message'); return messages[id]; } } },
    triggerMessageId: options.trigger ? 't' : null,
    referencedMessageId: options.reference ? 'r' : null,
    defer: async () => {},
    reply: async (payload: any) => { replies.push(payload); },
  } as any;
  return { ctx, replies };
};

const withStickers = (...items: any[]) => ({ stickers: { first: () => items[0] ?? undefined } });

test('a sticker of the server is found by name', async () => {
  const { ctx, replies } = fakeContext({ text: 'pepe', stickers: [fakeSticker()] });
  await sticker.run(ctx);
  assert.equal((replies[0].embeds[0] as any).toJSON().image.url, 'https://cdn.discordapp.com/stickers/123456789012345678.png');
});

test('any sticker is found by ID, and --info says where it comes from', async () => {
  const { ctx, replies } = fakeContext({ text: '123456789012345678', info: true, byId: fakeSticker({ guildId: null, type: StickerType.Standard }) });
  await sticker.run(ctx);
  const embed = (replies[0].embeds[0] as any).toJSON();
  assert.equal(embed.fields.find((f: any) => f.name === 'Origen').value, 'Paquete de Discord');
});

test('a sticker sent with the command, or in the message it replies to, is used; a partial one is completed first', async () => {
  const partial = fakeSticker({ partial: true, description: null, fetch: async () => fakeSticker({ description: 'Completo' }) });
  const sent = fakeContext({ trigger: withStickers(partial) });
  await sticker.run(sent.ctx);
  assert.equal(sent.replies.length, 1);

  const replied = fakeContext({ trigger: withStickers(), reference: withStickers(fakeSticker({ name: 'Respondido' })), info: true });
  await sticker.run(replied.ctx);
  assert.equal((replied.replies[0].embeds[0] as any).toJSON().title, 'Respondido');
});

test('a Lottie sticker is told as such instead of showing a picture', async () => {
  const { ctx, replies } = fakeContext({ text: 'pepe', stickers: [fakeSticker({ format: 3, url: 'https://cdn.discordapp.com/stickers/1.json' })] });
  await sticker.run(ctx);
  assert.equal((replies[0].embeds[0] as any).toJSON().description, LOTTIE_NOTE);
});

test('no sticker is Noa\'s refusal with the usage', async () => {
  for (const options of [{}, { text: 'nadie', stickers: [fakeSticker()] }, { text: '123456789012345678' }]) {
    const { ctx, replies } = fakeContext(options);
    await sticker.run(ctx);
    const lines = replies[0].content.split('\n');
    assert.match(lines[0], /^<:cross:\d+> ~ \*\*Javi\*\*, sticker no encontrado\.$/);
    assert.equal(lines[1], '> **Uso:** `!sticker <nombre o ID> [--info]`');
    assert.equal(lines.length, 4);
    assert.equal(replies[0].ephemeral, true);
  }
});
