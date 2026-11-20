import './support';
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import tezzlar from '../src/commands/minecraft/tezzlar';
import trailer from '../src/commands/minecraft/trailer';
import { SERVER, URLS } from '../src/config/constants';
import { UserError } from '../src/core/errors';
import { parsePrefixArgs, type ParseResult } from '../src/core/prefixParser';
import { getRegistry } from '../src/core/registry';
import { formatParseError } from '../src/core/usage';

const schema = (tezzlar.data.toJSON().options ?? []) as any[];
const config = { subcommandAliases: tezzlar.prefix.subcommandAliases };

const parse = (raw: string): ParseResult => parsePrefixArgs(raw, schema, config);
const ok = (raw: string) => {
  const result = parse(raw);
  assert.equal(result.kind, 'ok', `${raw} -> ${JSON.stringify(result)}`);
  return result as Extract<ParseResult, { kind: 'ok' }>;
};

test('tezzlar has the eight subcommands, with the options and flags the old commands had', () => {
  const subcommands = schema.map(option => option.name);
  assert.deepEqual(subcommands, ['day', 'commands', 'food', 'ip', 'minievent', 'recipes', 'resources', 'trailer']);

  const optionsOf = (name: string) => (schema.find(option => option.name === name).options ?? []).map((o: any) => [o.name, o.type, !!o.required]);
  assert.deepEqual(optionsOf('day'), [['numero', 4, true], ['force', 5, false]]);
  assert.deepEqual(optionsOf('ip'), [['numeric', 5, false]]);
  assert.deepEqual(optionsOf('minievent'), [['id', 3, true]]);
  assert.deepEqual(optionsOf('recipes'), [['id', 3, true]]);
  for (const name of ['commands', 'food', 'resources', 'trailer']) assert.deepEqual(optionsOf(name), [], name);
});

test('the Spanish and short names of the old commands are words of tezzlar', () => {
  const cases: Array<[string, string]> = [
    ['comandos', 'commands'], ['cmds', 'commands'],
    ['comida', 'food'], ['comidas', 'food'], ['foods', 'food'],
    ['jugar', 'ip'], ['minecraft', 'ip'],
    ['minieventos list', 'minievent'], ['minievents list', 'minievent'], ['me list', 'minievent'],
    ['recetas list', 'recipes'], ['crafteos list', 'recipes'], ['crafts list', 'recipes'],
    ['recursos', 'resources'], ['assets', 'resources'],
    ['trailer', 'trailer'],
  ];
  for (const [raw, subcommand] of cases) assert.equal(ok(raw).subcommand, subcommand, raw);
});

test('the flags and arguments are kept: ip --numeric, day --force, the id of minievent and recipes', () => {
  assert.deepEqual(ok('ip --numeric').values.get('numeric'), { type: 'boolean', value: true });
  assert.deepEqual(ok('jugar --numeric').values.get('numeric'), { type: 'boolean', value: true });
  assert.equal(ok('ip').values.get('numeric'), undefined);

  const day = ok('day 7 --force');
  assert.equal(day.subcommand, 'day');
  assert.deepEqual(day.values.get('numero'), { type: 'integer', value: 7 });
  assert.deepEqual(day.values.get('force'), { type: 'boolean', value: true });

  assert.deepEqual(ok('minievent list').values.get('id'), { type: 'string', value: 'list' });
  assert.deepEqual(ok('recetas armaduras').values.get('id'), { type: 'string', value: 'armaduras' });
  assert.equal((parse('minievent') as any).reason, 'missing_option');
  assert.equal((parse('day 99') as any).reason, 'out_of_range');
});

test('the day is only !tz day <number>: a bare number or nothing is an invalid subcommand', () => {
  for (const raw of ['7', '', 'foo']) {
    const result = parse(raw);
    assert.equal(result.kind, 'error', raw);
    assert.equal((result as any).reason, 'missing_subcommand', raw);
  }
  assert.equal(tezzlar.prefix.defaultSubcommand, undefined);

  const message = formatParseError('!', 'tezzlar', schema, parse('7') as any, [], { displayName: 'Javi' });
  assert.match(message.split('\n')[0], /^<:cross:\d+> ~ \*\*Javi\*\*, subcomando inválido\.$/);
  for (const subcommand of ['day', 'ip', 'minievent', 'recipes']) assert.ok(message.includes(`!tezzlar ${subcommand}`), subcommand);
});

const fakeContext = (subcommand: string, options: { strings?: Record<string, string>; booleans?: Record<string, boolean>; integers?: Record<string, number>; developer?: boolean } = {}) => {
  const replies: any[] = [];
  const ctx = {
    options: {
      getSubcommand: () => subcommand,
      getString: (name: string) => options.strings?.[name] ?? null,
      getBoolean: (name: string) => options.booleans?.[name] ?? null,
      getInteger: (name: string) => options.integers?.[name] ?? null,
    },
    user: { id: 'nobody' },
    member: { displayName: 'Javi' },
    reply: async (payload: any) => { replies.push(payload); },
    send: async (payload: any) => { replies.push(payload); },
  } as any;
  return { ctx, replies };
};

const embedOf = (payload: any) => payload.embeds[0].toJSON();

test('ip answers with the domain, or the numeric address with the flag', async () => {
  const domain = fakeContext('ip');
  await tezzlar.run(domain.ctx);
  assert.equal(domain.replies[0], `🌐 **IP del Servidor:** \`${SERVER.domain}\``);

  const numeric = fakeContext('ip', { booleans: { numeric: true } });
  await tezzlar.run(numeric.ctx);
  assert.equal(numeric.replies[0], `🌐 **IP del Servidor:** \`${SERVER.numericIp}\``);
});

test('minievent and recipes list their catalog, show one by id, and refuse an unknown one with the new !tz hint', async () => {
  for (const [subcommand, listTitle] of [['minievent', 'Lista de Minieventos Disponibles'], ['recipes', 'Lista de Categorías de Crafteo']] as const) {
    const list = fakeContext(subcommand, { strings: { id: 'LIST' } });
    await tezzlar.run(list.ctx);
    assert.equal(embedOf(list.replies[0]).title, listTitle, subcommand);
    assert.ok(embedOf(list.replies[0]).description.includes(`!tz ${subcommand} <id>`), subcommand);

    const unknown = fakeContext(subcommand, { strings: { id: 'nope-nope' } });
    await tezzlar.run(unknown.ctx);
    assert.match(unknown.replies[0].content, /^<:cross:\d+> ~ \*\*Javi\*\*, no se encontró/);
    assert.ok(unknown.replies[0].content.includes(`!tz ${subcommand} list`), subcommand);
    assert.equal(unknown.replies[0].ephemeral, true);
  }
});

test('commands, food and resources each answer with an embed', async () => {
  for (const subcommand of ['commands', 'food', 'resources']) {
    const { ctx, replies } = fakeContext(subcommand);
    await tezzlar.run(ctx);
    assert.equal(replies.length, 1, subcommand);
    assert.ok(embedOf(replies[0]).description || embedOf(replies[0]).fields, subcommand);
  }
});

test('day still hides a day that has not unlocked, lets the developer force it, and an unknown subcommand is refused', async () => {
  // The clock is pinned to July 3rd 2026 at noon UTC-6 (18:00 UTC): day 3 unlocks at 20:00 UTC that day, day 4 the next one
  const pinned = mock.method(Date, 'now', () => Date.UTC(2026, 6, 3, 18, 0, 0));
  try {
    const locked = fakeContext('day', { integers: { numero: 4 } });
    await tezzlar.run(locked.ctx);
    assert.match(locked.replies[0].content, /Alto ahí, viajero del tiempo.*Día 4/);
    assert.equal(locked.replies[0].ephemeral, true);

    // `--force` only works for the developer (DEVELOPER_ID is "test" in the test environment)
    const stranger = fakeContext('day', { integers: { numero: 4 }, booleans: { force: true } });
    await tezzlar.run(stranger.ctx);
    assert.match(stranger.replies[0].content, /Alto ahí/);

    const developer = fakeContext('day', { integers: { numero: 4 }, booleans: { force: true } });
    developer.ctx.user = { id: 'test' };
    await tezzlar.run(developer.ctx);
    assert.doesNotMatch(String(developer.replies[0].content ?? ''), /Alto ahí/);

    const unlocked = fakeContext('day', { integers: { numero: 2 } });
    await tezzlar.run(unlocked.ctx);
    assert.doesNotMatch(String(unlocked.replies[0].content ?? ''), /Alto ahí/);
  } finally {
    pinned.mock.restore();
  }

  const none = fakeContext('nothing');
  await assert.rejects(tezzlar.run(none.ctx), (error: unknown) => error instanceof UserError && /subcomando inválido/.test(error.message));
});

test('the Tezzlar trailer keeps its link, and the top-level trailer is the Enriquecraft 666 one', async () => {
  const inside = fakeContext('trailer');
  await tezzlar.run(inside.ctx);
  assert.ok(inside.replies[0].includes('Tezzlar 3'));
  assert.ok(inside.replies[0].includes(URLS.trailer));

  assert.equal(URLS.enriquecraftTrailer, 'https://www.youtube.com/watch?v=4nAiLdzxo9M');
  const outside = fakeContext('');
  await trailer.run(outside.ctx);
  assert.ok(outside.replies[0].includes('Enriquecraft 666'));
  assert.ok(outside.replies[0].includes('https://www.youtube.com/watch?v=4nAiLdzxo9M'));
  assert.equal(outside.replies[0].includes(URLS.trailer), false);
});

test('the old top-level commands are gone, trailer stays, and tezzlar keeps its own aliases', () => {
  const registry = getRegistry();
  for (const gone of ['commands', 'comandos', 'cmds', 'food', 'comida', 'ip', 'jugar', 'minievent', 'minieventos', 'me', 'recipes', 'recetas', 'crafts', 'resources', 'recursos', 'assets']) {
    assert.equal(registry.resolve(gone), undefined, gone);
  }
  assert.equal(registry.resolve('trailer')?.data.name, 'trailer');
  for (const alias of ['tezzlar', 'tez', 'tz']) assert.equal(registry.resolve(alias)?.data.name, 'tezzlar', alias);
  // the other Minecraft commands were not touched
  for (const kept of ['enchantments', 'playerlist', 'playerinfo', 'skin', 'tps']) assert.ok(registry.resolve(kept), kept);
});
