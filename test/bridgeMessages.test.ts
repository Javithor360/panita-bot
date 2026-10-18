import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnnouncer } from '../src/features/minecraft/announcer';
import { channelMapOf } from '../src/features/minecraft/channels';
import { DEFAULT_MESSAGES, parseMessageConfig, type MessageConfig } from '../src/features/minecraft/messageConfig';
import type { BridgePlayer, EventFrame } from '../src/features/minecraft/protocol';
import { emoteNameOf, renderEvent, type RenderContext, type Rendered } from '../src/features/minecraft/render';

const GLOBAL = '111111111111111111';
const OWNER = '999999999999999999';
const JAVI: BridgePlayer = { uuid: 'dd12be42-52a9-4a91-a8a1-11c01849e498', name: 'Javithor360', nickname: null, premium: true, skin: null };
const TEZ: BridgePlayer = { uuid: '11111111-2222-3333-4444-555555555555', name: 'Tezzlar', nickname: 'Tez', premium: false, skin: null };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('icon')]);
const NOW = new Date('2026-10-17T12:00:00Z');
const EMOJIS: Record<string, string> = { rayThumbsup: '<:rayThumbsup:1>', rayEdgy: '<:rayEdgy:2>' };

const context = (overrides: Partial<RenderContext> = {}): RenderContext => ({
  botName: 'Panita Bot',
  botAvatar: 'https://bot.test/avatar.png',
  ownerId: OWNER,
  serverIcon: null,
  emoji: name => EMOJIS[name],
  now: NOW,
  avatarOf: player => `https://heads.test/${player.name}`,
  ...overrides,
});

const config = (yaml: string): MessageConfig => {
  const { config: parsed, warnings } = parseMessageConfig(yaml);
  assert.deepEqual(warnings, []);
  return parsed;
};

const render = (kind: EventFrame['kind'] | 'crashed', frame?: Partial<EventFrame>, ctx = context(), messages = DEFAULT_MESSAGES) =>
  renderEvent(messages, kind, frame ? ({ type: 'event', kind, ...frame } as EventFrame) : undefined, ctx);

const data = (rendered: Rendered | null) => {
  assert.ok(rendered, 'something is posted');
  assert.equal(rendered.embeds.length, 1);
  return rendered.embeds[0].data;
};

// The player events

test('a join, a first join and a leave show what the player is called, with their head', () => {
  const join = data(render('join', { player: JAVI }));
  assert.equal(join.author?.name, 'Javithor360 entró al servidor');
  assert.equal(join.author?.icon_url, 'https://heads.test/Javithor360');
  assert.equal(join.color, 0x00ff00);
  assert.equal(data(render('first_join', { player: TEZ })).author?.name, 'Tez entró al servidor por primera vez. ¡Bienvenido!');
  assert.equal(data(render('leave', { player: JAVI })).author?.name, 'Javithor360 salió del servidor');
  assert.equal(data(render('leave', { player: JAVI })).color, 0xff0000);
});

test('a death and an advancement say the text the game gave', () => {
  assert.equal(data(render('death', { player: JAVI, text: 'Javithor360 was slain by Zombie' })).author?.name, 'Javithor360 was slain by Zombie');
  assert.equal(data(render('advancement', { player: TEZ, text: 'Stone Age' })).author?.name, 'Tez completó el logro Stone Age');
});

test('posts nothing for a player event without a player, a death or an advancement without a text, or a broadcast without one', () => {
  assert.equal(render('join', {}), null);
  assert.equal(render('death', { player: JAVI }), null);
  assert.equal(render('advancement', { player: JAVI }), null);
  assert.equal(render('broadcast', {}), null);
});

test('an event that is off posts nothing', () => {
  assert.equal(render('join', { player: JAVI }, context(), config('events:\n  join: false\n')), null);
});

// Broadcasts

test('a broadcast is an official announcement with the icon of the server, which travels with the message', () => {
  const rendered = render('broadcast', { text: 'Reinicio en 5 minutos' }, context({ serverIcon: PNG }));

  assert.equal(data(rendered).author?.name, 'Anuncio Oficial');
  assert.equal(data(rendered).author?.icon_url, 'attachment://server-icon.png');
  assert.equal(data(rendered).description, 'Reinicio en 5 minutos');
  assert.deepEqual(rendered?.files, [{ name: 'server-icon.png', data: PNG }]);
});

test('a broadcast without a server icon has no icon and no file', () => {
  const rendered = render('broadcast', { text: 'Hola' });

  assert.equal(data(rendered).author?.name, 'Anuncio Oficial');
  assert.equal(data(rendered).author?.icon_url, undefined);
  assert.deepEqual(rendered?.files, []);
});

test('the icon is attached only when a message uses it', () => {
  const plainBroadcast = config('events:\n  broadcast:\n    description: "{message}"\n');
  const withThumbnail = config('events:\n  broadcast:\n    thumbnail: "{servericon}"\n    description: "{message}"\n');

  assert.deepEqual(render('broadcast', { text: 'a' }, context({ serverIcon: PNG }), plainBroadcast)?.files, []);
  assert.deepEqual(render('broadcast', { text: 'a' }, context({ serverIcon: PNG }), withThumbnail)?.files, [{ name: 'server-icon.png', data: PNG }]);
  assert.equal(data(render('broadcast', { text: 'a' }, context({ serverIcon: PNG }), withThumbnail)).thumbnail?.url, 'attachment://server-icon.png');
});

test('text from the game is escaped where Discord shows markdown, and not in names', () => {
  const messages = config('events:\n  death:\n    author: "{deathmessage}"\n    description: "{deathmessage}"\n');

  const embed = data(render('death', { player: JAVI, text: 'Player_One was *slain*' }, context(), messages));

  assert.equal(embed.author?.name, 'Player_One was *slain*');
  assert.equal(embed.description, 'Player\\_One was \\*slain\\*');
});

// Plain messages

test('the start and stop are plain messages with the emoji of the server', () => {
  assert.deepEqual(render('started', {}), { content: '<:rayThumbsup:1> **Server despierto**', embeds: [], files: [], mentions: [] });
  assert.equal(render('stopping', {})?.content, '<:rayEdgy:2> **El server se ha puesto a mimir.**');
});

test('an emoji the server does not have stays as written', () => {
  assert.equal(render('started', {}, context({ emoji: () => undefined }))?.content, ':rayThumbsup: **Server despierto**');
});

test('a crash mentions the owner and shows the time, and nobody else is ever mentioned', () => {
  const crashed = render('crashed');

  assert.equal(crashed?.content, `<t:${NOW.getTime() / 1000}:f> <@${OWNER}>, el servidor ha colapsado 🔥‼️`);
  assert.deepEqual(crashed?.mentions, [OWNER]);
  for (const kind of ['started', 'stopping'] as const) assert.deepEqual(render(kind, {})?.mentions, []);
  assert.deepEqual(render('join', { player: JAVI })?.mentions, []);
});

test('a crash in a guild whose owner is not known mentions nobody', () => {
  const crashed = render('crashed', undefined, context({ ownerId: undefined }));

  assert.equal(crashed?.content, `<t:${NOW.getTime() / 1000}:f> , el servidor ha colapsado 🔥‼️`);
  assert.deepEqual(crashed?.mentions, []);
});

test('text of a message is cut to the 2000 characters Discord accepts', () => {
  const long = config(`events:\n  started: "${'x'.repeat(2500)}"\n`);

  assert.equal(render('started', {}, context(), long)?.content?.length, 2000);
});

// Custom embeds

test('shows every part of a custom embed', () => {
  const messages = config(`
events:
  join:
    color: "#123456"
    content: "Entra {username}"
    author: { text: "{displayname}", icon: "{avatar}", url: "https://panitacraft.test/{username}" }
    title: { text: "Bienvenido a {botname}", url: "https://panitacraft.test" }
    description: ":rayEdgy: hola"
    thumbnail: "{botavatar}"
    image: "https://img.test/a.png"
    footer: { text: "pie", icon: "https://img.test/f.png" }
    fields:
      - { name: "Quién", value: "{username}", inline: true }
      - { name: "Cuándo", value: "{date}" }
    timestamp: true
`);

  const rendered = render('join', { player: TEZ }, context(), messages);
  const embed = data(rendered);

  assert.equal(rendered?.content, 'Entra Tezzlar');
  assert.equal(embed.color, 0x123456);
  assert.deepEqual(embed.author, { name: 'Tez', icon_url: 'https://heads.test/Tezzlar', url: 'https://panitacraft.test/Tezzlar' });
  assert.equal(embed.title, 'Bienvenido a Panita Bot');
  assert.equal(embed.url, 'https://panitacraft.test');
  assert.equal(embed.description, '<:rayEdgy:2> hola');
  assert.equal(embed.thumbnail?.url, 'https://bot.test/avatar.png');
  assert.equal(embed.image?.url, 'https://img.test/a.png');
  assert.deepEqual(embed.footer, { text: 'pie', icon_url: 'https://img.test/f.png' });
  assert.deepEqual(embed.fields, [
    { name: 'Quién', value: 'Tezzlar', inline: true },
    { name: 'Cuándo', value: `<t:${NOW.getTime() / 1000}:f>`, inline: false },
  ]);
  assert.equal(embed.timestamp, NOW.toISOString());
});

test('an icon or an image that does not come out as a link is left out instead of failing the message', () => {
  const messages = config('events:\n  join:\n    author: { text: "{displayname}", icon: "{avatar}" }\n    thumbnail: "{servericon}"\n');

  const embed = data(render('join', { player: JAVI }, context({ avatarOf: () => 'not a link' }), messages));

  assert.equal(embed.author?.name, 'Javithor360');
  assert.equal(embed.author?.icon_url, undefined);
  assert.equal(embed.thumbnail, undefined);
});

test('cuts the parts of an embed to what Discord accepts', () => {
  const messages = config(`events:\n  join:\n    author: "${'a'.repeat(300)}"\n    description: "${'d'.repeat(5000)}"\n`);

  const embed = data(render('join', { player: JAVI }, context(), messages));

  assert.equal(embed.author?.name.length, 256);
  assert.equal(embed.description?.length, 4096);
});

test('leaves out a field whose name or value came out empty, and posts nothing when no part has anything to show', () => {
  const withEmptyField = config('events:\n  crashed:\n    description: "x"\n    fields:\n      - { name: "Dueño", value: "{guildowner}" }\n      - { name: "Hora", value: "{date}" }\n');
  const fields = data(render('crashed', undefined, context({ ownerId: undefined }), withEmptyField)).fields;
  assert.deepEqual(fields?.map(field => field.name), ['Hora']);

  const empty = config('events:\n  join:\n    author: ""\n    description: ""\n    color: "#ffffff"\n');
  assert.equal(render('join', { player: JAVI }, context(), empty), null);
});

// /me

test('the name of what a player does with /me comes from the config', () => {
  assert.equal(emoteNameOf(DEFAULT_MESSAGES, TEZ), '* Tez');
  assert.equal(emoteNameOf(config('chat:\n  emote_name: "+ {username}"\n'), TEZ), '+ Tezzlar');
});

// The announcer

const announcer = (options: { channels?: ReturnType<typeof channelMapOf>; messages?: MessageConfig } = {}) => {
  const notified: Array<{ channelId: string; message: Rendered }> = [];
  const announce = createAnnouncer({
    channels: options.channels ?? channelMapOf({ global: GLOBAL }),
    config: options.messages ?? DEFAULT_MESSAGES,
    avatars: { premium: 'https://heads.test/{name}', cracked: 'https://heads.test/steve', skin: 'https://heads.test/skin/{skin}' },
    surroundings: () => context(),
    notify: async (channelId, message) => void notified.push({ channelId, message }),
    now: () => NOW,
  });
  return { announce, notified };
};

test('the announcer posts in the main channel with the head of the player', async () => {
  const { announce, notified } = announcer();

  await announce('join', { type: 'event', kind: 'join', player: JAVI });

  assert.equal(notified.length, 1);
  assert.equal(notified[0].channelId, GLOBAL);
  assert.equal(notified[0].message.embeds[0].data.author?.icon_url, 'https://heads.test/Javithor360');
});

test('the announcer can post what no frame reports, a crash', async () => {
  const { announce, notified } = announcer();

  await announce('crashed');

  assert.match(notified[0].message.content ?? '', /el servidor ha colapsado/);
});

test('the announcer posts nothing without a main channel, or when the message is empty', async () => {
  const none = announcer({ channels: channelMapOf({}) });
  await none.announce('started');
  const off = announcer({ messages: config('events:\n  started: false\n') });
  await off.announce('started');

  assert.deepEqual(none.notified, []);
  assert.deepEqual(off.notified, []);
});
