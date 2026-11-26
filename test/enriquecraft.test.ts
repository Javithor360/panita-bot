import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import enriquecraft from '../src/commands/minecraft/enriquecraft';
import { SERVER, URLS } from '../src/config/constants';
import type { CommandContext } from '../src/core/context';
import { UserError } from '../src/core/errors';
import { parsePrefixArgs, type ParseResult } from '../src/core/prefixParser';
import { getRegistry } from '../src/core/registry';
import { features, join, prankClarifications, prankLevels, rules, utilityCommands } from '../src/data/enriquecraft';
import { run as runCommands, view as commandsView } from '../src/features/enriquecraft/commands';
import { overview as featuresOverview, single as featureView } from '../src/features/enriquecraft/features';
import { view as infoView } from '../src/features/enriquecraft/info';
import { view as joinView } from '../src/features/enriquecraft/join';
import { IMAGES_DIR, type View } from '../src/features/enriquecraft/look';
import { clarification, level, overview as pranksOverview } from '../src/features/enriquecraft/pranks';
import { overview as rulesOverview, single as ruleView } from '../src/features/enriquecraft/rules';

const schema = (enriquecraft.data.toJSON().options ?? []) as any[];
const config = { subcommandAliases: enriquecraft.prefix.subcommandAliases };

const parse = (raw: string): ParseResult => parsePrefixArgs(raw, schema, config);
const ok = (raw: string) => {
  const result = parse(raw);
  assert.equal(result.kind, 'ok', `${raw} -> ${JSON.stringify(result)}`);
  return result as Extract<ParseResult, { kind: 'ok' }>;
};

const optionOf = (subcommand: string) => schema.find(option => option.name === subcommand).options?.[0];

/** Every view the command can answer with. */
const allViews = (): Array<[string, View]> => [
  ['info', infoView()],
  ['rules', rulesOverview()],
  ...rules.map((rule): [string, View] => [`rule ${rule.id}`, ruleView(rule)]),
  ['pranks', pranksOverview()],
  ...prankLevels.map((item): [string, View] => [`level ${item.id}`, level(item)]),
  ...prankClarifications.map((item): [string, View] => [`clarification ${item.title}`, clarification(item)]),
  ['features', featuresOverview()],
  ...features.map((feature): [string, View] => [`feature ${feature.id}`, featureView(feature)]),
  ['commands', commandsView()],
  ['join', joinView()],
];

// ── The command ──────────────────────────────────────────────────────────────────────────────────────────────────

test('enriquecraft has the six subcommands, and no staff one', () => {
  assert.deepEqual(schema.map(option => option.name), ['info', 'rules', 'pranks', 'features', 'commands', 'join']);
});

test('rules, pranks and features take an optional choice with every id of their data', () => {
  const ids = (subcommand: string) => optionOf(subcommand).choices.map((choice: any) => choice.value);
  assert.deepEqual(ids('rules'), rules.map(rule => rule.id));
  assert.deepEqual(ids('pranks'), [...prankLevels.map(item => item.id), 'extremo']);
  assert.deepEqual(ids('features'), features.map(feature => feature.id));
  for (const subcommand of ['rules', 'pranks', 'features']) assert.equal(!!optionOf(subcommand).required, false, subcommand);
  for (const subcommand of ['info', 'commands', 'join']) assert.equal(optionOf(subcommand), undefined, subcommand);
});

test('the Spanish and short names are words of enriquecraft', () => {
  const cases: Array<[string, string]> = [
    ['informacion', 'info'], ['general', 'info'],
    ['reglas', 'rules'], ['normas', 'rules'],
    ['bromas', 'pranks'],
    ['caracteristicas', 'features'], ['mecanicas', 'features'],
    ['comandos', 'commands'], ['cmds', 'commands'],
    ['jugar', 'join'], ['ip', 'join'], ['unirse', 'join'],
  ];
  for (const [raw, subcommand] of cases) assert.equal(ok(raw).subcommand, subcommand, raw);
});

test('a rule, a level and a feature are asked for by id or by name', () => {
  assert.deepEqual(ok('rules comun').values.get('regla'), { type: 'string', value: 'comun' });
  assert.deepEqual(ok('normas LIMITES').values.get('regla'), { type: 'string', value: 'limites' });
  assert.deepEqual(ok('pranks extremo').values.get('nivel'), { type: 'string', value: 'extremo' });
  assert.deepEqual(ok('bromas mimo').values.get('nivel'), { type: 'string', value: 'mimo' });
  assert.deepEqual(ok('mecanicas voz').values.get('caracteristica'), { type: 'string', value: 'voz' });
  assert.equal(ok('rules').values.get('regla'), undefined);
});

test('an id that does not exist is not accepted', () => {
  assert.notEqual(parse('rules inventada').kind, 'ok');
  assert.notEqual(parse('pranks inventado').kind, 'ok');
});

test('"enri" and "ec" open the command, and no other command uses those names', () => {
  const registry = getRegistry();
  assert.equal(registry.resolve('enriquecraft')?.data.name, 'enriquecraft');
  assert.equal(registry.resolve('enri')?.data.name, 'enriquecraft');
  assert.equal(registry.resolve('ec')?.data.name, 'enriquecraft');
});

// ── The content ──────────────────────────────────────────────────────────────────────────────────────────────────

test('the document is all there: six rules, four levels, the Extremo indicator and eight features', () => {
  assert.equal(rules.length, 6);
  assert.deepEqual(prankLevels.map(item => item.id), ['mimo', 'bufon', 'payaso', 'arlequin']);
  assert.ok(prankClarifications.some(item => item.id === 'extremo'));
  assert.equal(features.length, 8);
  assert.ok(!features.some(feature => /staff/i.test(feature.id + feature.title)), 'the staff is not listed');
});

test('Mimo is level zero: it allows no prank at all', () => {
  const [mimo, ...others] = prankLevels;
  assert.equal(mimo.id, 'mimo');
  assert.equal(mimo.allowed, null);
  assert.match(mimo.text, /ningún tipo de broma/);
  assert.ok(others.every(item => item.allowed), 'the other levels allow something');
  assert.match(level(mimo).embeds[0].toJSON().fields![0].value, /Ninguna broma/);
});

test('every view fits the limits of Discord', () => {
  for (const [name, { embeds }] of allViews()) {
    assert.equal(embeds.length, 1, name);
    const json = embeds[0].toJSON();
    assert.ok((json.title ?? '').length <= 256, `${name}: title`);
    assert.ok((json.description ?? '').length <= 4096, `${name}: description`);
    assert.ok((json.fields ?? []).length <= 25, `${name}: fields`);
    for (const field of json.fields ?? []) {
      assert.ok(field.name.length <= 256, `${name}: field name ${field.name}`);
      assert.ok(field.value.length <= 1024, `${name}: field value of ${field.name} has ${field.value.length}`);
    }
    const total = [json.title, json.description, json.author?.name, json.footer?.text, ...(json.fields ?? []).flatMap(field => [field.name, field.value])]
      .reduce((sum, text) => sum + (text?.length ?? 0), 0);
    assert.ok(total <= 6000, `${name}: ${total} characters`);
  }
});

test('the pictures of the features exist and are attached under the name the embed shows', () => {
  const withImage = features.filter(feature => feature.image);
  assert.deepEqual(withImage.map(feature => feature.image), ['perfil.png', 'login.gif', 'interchat.png']);

  for (const feature of withImage) {
    assert.ok(existsSync(path.join(IMAGES_DIR, feature.image!)), `${feature.image} is in assets/enriquecraft`);
    const { embeds, files } = featureView(feature);
    assert.equal(embeds[0].toJSON().image?.url, `attachment://${feature.image}`);
    assert.deepEqual(files?.map(file => file.name), [feature.image]);
  }
  for (const feature of features.filter(item => !item.image)) assert.equal(featureView(feature).files, undefined, feature.id);
});

test('the list of features names every feature', () => {
  const list = featuresOverview().embeds[0].toJSON().fields![0].value;
  for (const feature of features) assert.ok(list.includes(feature.title), feature.title);
});

test('commands shows the four utility commands and not the ones of Tezzlar', () => {
  assert.deepEqual(utilityCommands.map(item => item.command), ['/c [jugador]', '/skin set <name>', '/tps', '/prank set <level>']);
  const text = commandsView().embeds[0].toJSON().description!;
  for (const item of utilityCommands) assert.ok(text.includes(item.command), item.command);
  assert.ok(!text.includes('/punishments') && !text.includes('/rewards'));
});

test('join gives the IP, the version, !activar and Panita Client as a recommendation', () => {
  assert.equal(join.ip, 'mc.panitacraft.com');
  assert.equal(join.version, '26.3');
  assert.equal(SERVER.domain, join.ip);

  const json = joinView().embeds[0].toJSON();
  const text = (json.fields ?? []).map(field => field.value).join('\n');
  assert.ok(text.includes('mc.panitacraft.com'));
  assert.ok(text.includes('26.3'));
  assert.ok(text.includes('!activar'));
  assert.match(text, /Recomendado.*Panita Client/);
  assert.ok(text.includes(URLS.launcherDownload));
  assert.equal(URLS.launcherDownload, 'https://www.panitacraft.com/downloads/launcher');
});

test('the chat feature mentions the live-server channel', () => {
  const chat = features.find(feature => feature.id === 'chat')!;
  assert.ok(chat.text.includes('<#1575346365205188720>'));
  assert.ok(!chat.text.includes('${'), 'the channel is filled in, not left as a template');
});

test('the rules link the Terms of Use and the Privacy Policy', () => {
  const description = rulesOverview().embeds[0].toJSON().description!;
  assert.ok(description.includes(URLS.termsOfUse));
  assert.ok(description.includes(URLS.privacyPolicy));
});

// ── Running ──────────────────────────────────────────────────────────────────────────────────────────────────────

const fakeContext = (options: Record<string, string>) => {
  const replies: any[] = [];
  const ctx = {
    options: { getString: (name: string) => options[name] ?? null, getSubcommand: () => null },
    reply: async (payload: unknown) => { replies.push(payload); },
  } as unknown as CommandContext;
  return { ctx, replies };
};

test('rules answers with every rule, or with just the one that was asked for', async () => {
  const { run } = await import('../src/features/enriquecraft/rules');

  const all = fakeContext({});
  await run(all.ctx);
  assert.equal(all.replies[0].embeds[0].toJSON().fields.length, rules.length);

  const one = fakeContext({ regla: 'robar' });
  await run(one.ctx);
  assert.match(one.replies[0].embeds[0].toJSON().title, /No robar/);
  assert.match(one.replies[0].embeds[0].toJSON().footer.text, /Regla 4 de 6/);

  await assert.rejects(run(fakeContext({ regla: 'nope' }).ctx), UserError);
});

test('pranks answers with the system, a level or the Extremo indicator', async () => {
  const { run } = await import('../src/features/enriquecraft/pranks');

  const all = fakeContext({});
  await run(all.ctx);
  assert.equal(all.replies[0].embeds[0].toJSON().fields.length, prankLevels.length + prankClarifications.length);

  const extremo = fakeContext({ nivel: 'extremo' });
  await run(extremo.ctx);
  assert.match(extremo.replies[0].embeds[0].toJSON().title, /Indicador Extremo/);

  await assert.rejects(run(fakeContext({ nivel: 'nope' }).ctx), UserError);
});

test('features answers with the list, or with one feature and its picture', async () => {
  const { run } = await import('../src/features/enriquecraft/features');

  const list = fakeContext({});
  await run(list.ctx);
  assert.equal(list.replies[0].files, undefined);

  const login = fakeContext({ caracteristica: 'login' });
  await run(login.ctx);
  assert.deepEqual(login.replies[0].files.map((file: any) => file.name), ['login.gif']);

  await assert.rejects(run(fakeContext({ caracteristica: 'nope' }).ctx), UserError);
});

test('commands answers with the feature of the utility commands', async () => {
  const { ctx, replies } = fakeContext({});
  await runCommands(ctx);
  assert.match(replies[0].embeds[0].toJSON().title, /Comandos de utilidad/);
});
