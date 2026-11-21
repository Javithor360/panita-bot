import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMOJIS } from '../src/config/emojis';
import { UserError } from '../src/core/errors';
import { infoEmbed, type InfoData } from '../src/features/info/infoView';
import { boostsToNextTier } from '../src/features/info/labels';
import { countPresences } from '../src/features/info/presence';
import {
  channelPages,
  emojiPages,
  serverMessage,
  SERVER_FLAGS,
  type CategoryNode,
  type ServerData,
  type ServerView,
} from '../src/features/info/serverView';

const data = (extra: Partial<ServerData> = {}): ServerData => ({
  id: '707103390852710491',
  name: 'Panitacraft',
  iconUrl: 'https://cdn.example/icon.png',
  bannerUrl: null,
  splashUrl: null,
  createdAt: new Date('2020-05-05T00:00:00Z'),
  ownerId: '111111111111111111',
  verificationLevel: 1,
  boostTier: 1,
  boosts: 3,
  memberCount: 23,
  humans: 14,
  bots: 9,
  presence: null,
  channelCounts: { total: 25, categories: 4, text: 13, voice: 12, announcements: 0, forums: 0, stages: 0 },
  afkChannelId: '222222222222222222',
  afkTimeoutSeconds: 300,
  roles: [],
  emojis: [],
  stickers: 2,
  features: [],
  vanityCode: null,
  serverTag: null,
  boosters: [],
  membersComplete: true,
  tree: [],
  ...extra,
});

const makeId = (view: ServerView, page: number, slot: string) => `server:page:${view}:${page}:${slot}`;
const message = (view: ServerView, d: ServerData, page = 0) => serverMessage(view, d, page, makeId, () => 0);
const embedOf = (m: ReturnType<typeof message>) => (m.embeds![0] as any).toJSON();
const fieldValue = (json: any, name: string): string => json.fields.find((f: any) => f.name === name).value;
const rowOf = (m: ReturnType<typeof message>) => (m.components![0] as any).toJSON().components;

test('the default embed is Noa\'s: the creation date, even columns and the flags below', () => {
  const json = embedOf(message('info', data()));

  assert.equal(json.author.name, 'Panitacraft');
  assert.equal(json.author.icon_url, 'https://cdn.example/icon.png');
  assert.equal(json.thumbnail.url, 'https://cdn.example/icon.png');
  assert.match(json.description, /^Creado el <t:\d+:D> \(<t:\d+:R>\)$/);
  assert.deepEqual(json.fields.map((f: any) => f.name), ['Miembros', 'Canales', 'Información', 'Extras', 'Contenido', 'Mejoras', 'Parámetros']);
  // Two rows of three columns, then the flags across the whole width
  assert.deepEqual(json.fields.map((f: any) => f.inline), [true, true, true, true, true, true, false]);
  assert.equal(json.footer.text, 'ID: 707103390852710491');
});

test('every line of a column is short, so none wraps in a third of the width', () => {
  const json = embedOf(message('info', data()));
  for (const f of json.fields.filter((field: any) => field.inline)) {
    for (const line of f.value.split('\n')) assert.ok(line.replace(/<[^>]+>/g, 'x'.repeat(8)).length <= 32, line);
  }
});

test('members, channels and information are one short line each', () => {
  const json = embedOf(message('info', data()));

  assert.equal(fieldValue(json, 'Miembros'), 'Usuarios: **23**\nHumanos: **14**\nBots: **9**');
  assert.equal(fieldValue(json, 'Canales'), 'Total: **25**\nCategorías: **4**\nTexto: **13**\nVoz: **12**');
  assert.equal(fieldValue(json, 'Información'), 'Propietario: <@111111111111111111>\nVerificación: **Bajo**');

  const more = fieldValue(embedOf(message('info', data({ channelCounts: { total: 30, categories: 4, text: 13, voice: 12, announcements: 1, forums: 2, stages: 0 } }))), 'Canales');
  assert.ok(more.endsWith('Anuncios: **1**\nForos: **2**'));
  assert.equal(more.includes('Escenarios'), false);
});

test('the members column drops what it does not know, and the status circles get a row of their own, only with presences', () => {
  const unknown = embedOf(message('info', data({ humans: null, bots: null })));
  assert.equal(fieldValue(unknown, 'Miembros'), 'Usuarios: **23**');
  assert.equal(unknown.fields.some((f: any) => f.name === 'Estado'), false);

  const counts = countPresences([{ status: 'online', mobile: true, activities: [] }], 23);
  const json = embedOf(message('info', data({ presence: counts })));
  assert.match(fieldValue(json, 'Estado'), new RegExp(`${EMOJIS.online} 1 · ${EMOJIS.idle} 0 · ${EMOJIS.dnd} 0 · ${EMOJIS.streaming} 0 · ${EMOJIS.offline} 22 · ${EMOJIS.mobile} 1`));
  assert.equal(json.fields.find((f: any) => f.name === 'Estado').inline, false);
});

test('extras, content and boosts have a column each', () => {
  const json = embedOf(message('info', data({ roles: [{ id: '1', members: 0 }], emojis: [{ markup: 'x', animated: false }] })));
  assert.equal(fieldValue(json, 'Extras'), 'AFK: <#222222222222222222>\nEspera: **5m 0s**');
  assert.equal(fieldValue(json, 'Contenido'), 'Roles: **1**\nEmotes: **1**\nStickers: **2**');
  assert.equal(fieldValue(json, 'Mejoras'), `Nivel: **Nivel 1**\nBoosts: ${EMOJIS.boost} **3**`);
  assert.match(fieldValue(embedOf(message('info', data({ afkChannelId: null }))), 'Extras'), /^AFK: \*\*Ninguno\*\*/);
});

test('the parameters list every flag', () => {
  const params = fieldValue(embedOf(message('info', data())), 'Parámetros');
  for (const { flag } of SERVER_FLAGS) assert.ok(params.includes(`\`--${flag}\``), flag);
  assert.deepEqual(SERVER_FLAGS.map(f => f.flag), ['roles', 'emojis', 'channels', 'activity', 'community', 'stickers', 'events', 'sounds', 'boost', 'icon', 'banner']);
});

test('roles are listed by position with their members, 20 to a page, with buttons that carry the page', () => {
  const roles = Array.from({ length: 25 }, (_, i) => ({ id: `30000000000000000${i}`.slice(0, 18), members: i }));
  const first = message('roles', data({ roles }));
  const json = embedOf(first);

  assert.match(json.description, /^\*\*Roles\*\* \(25\)\n<@&300000000000000000> · 0 miembros\n<@&300000000000000001> · 1 miembro\n/);
  assert.equal(json.description.split('\n').length, 21);
  assert.deepEqual(rowOf(first).map((b: any) => b.custom_id), ['server:page:roles:-1:prev', 'server:page:roles:0:here', 'server:page:roles:1:next']);

  const last = message('roles', data({ roles }), 99);
  assert.equal(embedOf(last).description.split('\n').length, 6);
  assert.equal(rowOf(last)[1].label, '2/2');
  assert.equal(rowOf(last)[2].disabled, true);
});

test('a short list has no buttons, and no roles says so', () => {
  assert.deepEqual(message('roles', data({ roles: [{ id: '1', members: 1 }] })).components, []);
  assert.match(embedOf(message('roles', data())).description, /no tiene roles/);
});

test('still and animated emojis have pages of their own, each titled with its own count of the limit', () => {
  const emojis = [
    { markup: '<:a:1>', animated: false },
    { markup: '<:b:2>', animated: false },
    { markup: '<a:c:3>', animated: true },
  ];
  const still = embedOf(message('emojis', data({ emojis })));
  assert.equal(still.description, '**Emojis** (2/100)\n# <:a:1> <:b:2>');
  assert.equal(still.footer.text, 'Stickers: 2/15');

  const animated = embedOf(message('emojis', data({ emojis }), 1));
  assert.equal(animated.description, '**Animados** (1/100)\n# <a:c:3>');

  assert.match(embedOf(message('emojis', data())).description, /no tiene emojis/);
});

test('a page never mixes the two kinds, even when the still ones leave room', () => {
  const emojis = [
    ...Array.from({ length: 38 }, (_, i) => ({ markup: `<:s${i}:${i}>`, animated: false })),
    ...Array.from({ length: 9 }, (_, i) => ({ markup: `<a:m${i}:${i}>`, animated: true })),
  ];
  const pages = emojiPages(emojis);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.map(p => [p.animated, p.items.length]), [[false, 38], [true, 9]]);

  const first = embedOf(message('emojis', data({ emojis })));
  assert.ok(first.description.startsWith('**Emojis** (38/100)'));
  assert.equal(first.description.includes('<a:'), false);
  assert.equal(((message('emojis', data({ emojis })).components![0] as any).toJSON().components as any[])[1].label, '1/2');

  const second = embedOf(message('emojis', data({ emojis }), 1));
  assert.ok(second.description.startsWith('**Animados** (9/100)'));
  assert.equal(second.description.includes('<:s'), false);
});

test('a kind with more emojis than a page continues on the next pages before the other kind starts', () => {
  const still = Array.from({ length: 45 }, (_, i) => ({ markup: `<:s${i}:${i}>`, animated: false }));
  const animated = [{ markup: '<a:m:1>', animated: true }];
  const pages = emojiPages([...animated, ...still], 40);
  assert.deepEqual(pages.map(p => [p.animated, p.items.length]), [[false, 40], [false, 5], [true, 1]]);
  assert.deepEqual(emojiPages([], 40), []);
  assert.deepEqual(emojiPages(animated, 40).map(p => p.animated), [true]);
});

const tree = (): CategoryNode[] => [
  { id: null, name: 'Sin categoría', channels: [{ id: '400000000000000001', kind: 'text', visible: true }] },
  {
    id: '500000000000000001',
    name: 'General',
    channels: [
      { id: '400000000000000002', kind: 'text', visible: true },
      { id: '400000000000000003', kind: 'announcement', visible: true },
      { id: '400000000000000004', kind: 'voice', visible: true },
    ],
  },
  {
    id: '500000000000000002',
    name: 'Staff',
    channels: [
      { id: '999000000000000001', kind: 'text', visible: false },
      { id: '999000000000000002', kind: 'voice', visible: false },
    ],
  },
];

test('the channel tree never names a channel the person cannot see, it only counts them', () => {
  const m = message('channels', data({ tree: tree() }));
  const json = embedOf(m);

  assert.ok(json.description.includes('**General**'));
  assert.ok(json.description.includes('• <#400000000000000002>'));
  assert.ok(json.description.includes('• <#400000000000000003>'));
  assert.ok(json.description.includes('• <#400000000000000004>'));
  assert.equal(json.description.includes('999000000000000001'), false);
  assert.equal(json.description.includes('Staff'), false);
  assert.equal(json.footer.text, 'y 2 canales más que no puedes ver');
  assert.equal(JSON.stringify(m).includes('999000000000000002'), false);
});

test('with one hidden channel the footer is singular, and with none there is no footer', () => {
  const one = tree();
  one[2].channels = [one[2].channels[0]];
  assert.equal(embedOf(message('channels', data({ tree: one }))).footer.text, 'y 1 canal más que no puedes ver');
  assert.equal(embedOf(message('channels', data({ tree: tree().slice(0, 2) }))).footer, undefined);
  assert.match(embedOf(message('channels', data({ tree: [] }))).description, /No hay canales que puedas ver/);
});

test('channel pages keep a category with its channels and split a huge one', () => {
  const many = (n: number, start: number): CategoryNode['channels'] =>
    Array.from({ length: n }, (_, i) => ({ id: String(start + i), kind: 'text' as const, visible: true }));

  const packed = channelPages([
    { id: '1', name: 'A', channels: many(10, 100) },
    { id: '2', name: 'B', channels: many(10, 200) },
    { id: '3', name: 'C', channels: many(10, 300) },
  ], 25);
  assert.equal(packed.length, 2);
  assert.equal(packed[0].filter(line => line.startsWith('**')).length, 2);
  assert.equal(packed[1][0], '**C**');

  const huge = channelPages([{ id: '1', name: 'Big', channels: many(60, 1000) }], 25);
  assert.ok(huge.every(page => page.length <= 25));
  assert.equal(huge.flat().filter(line => line.startsWith('•')).length, 60);
});

test('boost tells the tier, how many are missing, the perks and the images', () => {
  const json = embedOf(message('boost', data({
    features: ['COMMUNITY', 'INTERNAL_THING', 'BANNER'],
    splashUrl: 'https://cdn.example/splash.png',
    bannerUrl: 'https://cdn.example/banner.png',
  })));

  assert.equal(json.author.name, 'Estado de boost en Panitacraft');
  assert.ok(json.description.includes(`${EMOJIS.boost} Nivel de boost: **Nivel 1**`));
  assert.ok(json.description.includes('Miembros boosteando: **3**'));
  assert.ok(json.description.includes('Faltan **4** para el siguiente nivel'));
  assert.ok(json.description.includes('`Comunidad`, `Banner`'));
  assert.equal(json.thumbnail.url, 'https://cdn.example/splash.png');
  assert.equal(json.image.url, 'https://cdn.example/banner.png');

  const top = embedOf(message('boost', data({ boostTier: 3, boosts: 20 })));
  assert.equal(top.description.includes('Faltan'), false);
  assert.ok(top.description.includes('Ninguna'));
  assert.equal(top.thumbnail.url, 'https://cdn.example/icon.png');
  assert.equal(boostsToNextTier(0, 1), 1);
  assert.equal(boostsToNextTier(2, 100), 0);
  assert.equal(boostsToNextTier(3, 100), null);
});

test('icon and banner show the picture big, and a server without one says so', () => {
  const icon = embedOf(message('icon', data()));
  assert.equal(icon.title, 'Ícono de Panitacraft');
  assert.equal(icon.url, 'https://cdn.example/icon.png');
  assert.equal(icon.image.url, 'https://cdn.example/icon.png');

  assert.throws(() => message('banner', data()), (error: unknown) => error instanceof UserError && /no tiene banner/.test(error.message));
  assert.throws(() => message('icon', data({ iconUrl: null })), UserError);
  assert.equal(embedOf(message('banner', data({ bannerUrl: 'https://cdn.example/b.png' }))).title, 'Banner de Panitacraft');
});

const info = (extra: Partial<InfoData> = {}): InfoData => ({
  botName: 'Panita Bot',
  avatarUrl: 'https://cdn.example/bot.png',
  version: '2.1.0',
  developer: 'Javithor360',
  stats: { guilds: 2, users: 150, channels: 67, commands: 57 },
  programming: { discordjs: '14.26.4', node: 'v22.14.0', memoryMb: 92.456, uptime: '2d 3h 5m 10s', apiMs: 105 },
  links: { web: 'https://www.panitacraft.com/', donate: 'https://paypal.example', discord: 'https://discord.gg/x' },
  api: { online: true, version: '2.0.0', latencyMs: 80 },
  ...extra,
});

test('the bot info is Noa\'s botinfo: statistics and technology in code blocks, links, and the version in the footer', () => {
  const json = infoEmbed(info(), () => 0).toJSON();

  assert.equal(json.title, 'Información de Panita Bot');
  assert.equal(json.footer?.text, 'Versión: v2.1.0 | Desarrollado por: Javithor360');
  assert.ok(json.timestamp);
  assert.ok(json.description!.startsWith(`${EMOJIS.stats} **Estadísticas**\n\`\`\`\nServidores: 2\nUsuarios: 150\nCanales: 67\nComandos: 57\n\`\`\``));
  assert.ok(json.description!.includes(`${EMOJIS.dev} **Programación**`));
  for (const line of ['Lenguaje: TypeScript', 'discord.js: v14.26.4', 'Node.js: v22.14.0', 'Memoria usada: 92.5 MB', 'En línea: 2d 3h 5m 10s', 'Latencia Discord: 105ms']) {
    assert.ok(json.description!.includes(line), line);
  }
  assert.ok(json.description!.endsWith('[Web](https://www.panitacraft.com/) · [Donar](https://paypal.example) · [Discord](https://discord.gg/x)'));
});

test('the bot info leaves out the API latency until the gateway has answered', () => {
  assert.equal(infoEmbed(info({ programming: { ...info().programming, apiMs: null } })).toJSON().description!.includes('Latencia Discord'), false);
});

const boostDescription = (extra: Partial<ServerData>) => embedOf(message('boost', data(extra))).description as string;

test('boost says when the server has no tag', () => {
  assert.ok(boostDescription({ serverTag: null }).includes('**Etiqueta del servidor**\nEste servidor no tiene etiqueta.'));
});

test('boost tells the tag, how many members wear it and who', () => {
  const text = boostDescription({
    serverTag: { text: 'PANA', count: 2, userIds: ['111111111111111111', '222222222222222222'], approximate: false },
  });
  assert.ok(text.includes('**Etiqueta del servidor** `PANA`\nMiembros que la usan: **2**\n<@111111111111111111> <@222222222222222222>'));
});

test('a long list of members names the first 25 and counts the rest, and an incomplete list says it is approximate', () => {
  const ids = Array.from({ length: 30 }, (_, i) => String(100_000_000_000_000_000n + BigInt(i)));
  const text = boostDescription({ serverTag: { text: 'PANA', count: 30, userIds: ids, approximate: true } });

  assert.ok(text.includes('Miembros que la usan: **30** (aprox.)'));
  assert.equal(text.match(/<@\d+>/g)?.length, 25);
  assert.ok(text.includes(' y 5 más\n'));
});

test('a tag nobody wears yet shows a zero and no list, and a tag without a known text has no code span', () => {
  const none = boostDescription({ serverTag: { text: null, count: 0, userIds: [], approximate: false } });
  assert.ok(none.includes('**Etiqueta del servidor**\nMiembros que la usan: **0**'));
});

test('no line of the channel list can be read by Discord as a title or a list', () => {
  const json = embedOf(message('channels', data({ tree: tree() })));
  for (const line of (json.description as string).split('\n')) {
    assert.equal(/^(#{1,3} |[-*+] |\d+[.)] |> )/.test(line), false, line);
  }
});

test('the emoji lines are markdown titles, so Discord shows the emojis big, and the section names stay plain', () => {
  const emojis = [{ markup: '<:a:1>', animated: false }, { markup: '<a:c:3>', animated: true }];
  for (const [page, title, line] of [[0, '**Emojis** (1/100)', '# <:a:1>'], [1, '**Animados** (1/100)', '# <a:c:3>']] as const) {
    const lines = (embedOf(message('emojis', data({ emojis }), page)).description as string).split('\n');
    assert.deepEqual(lines, [title, line]);
  }
});
