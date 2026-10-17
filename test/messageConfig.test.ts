import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  DEFAULT_MESSAGES,
  MESSAGES_FILE,
  loadMessageConfig,
  parseMessageConfig,
  type EmbedSpec,
} from '../src/features/minecraft/messageConfig';
import { clip, fill, isUrl, placeholdersIn, resolveEmojis } from '../src/features/minecraft/template';

/** Compares what a file says, not which keys were left undefined. */
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

const embed = (spec: unknown) => spec as EmbedSpec;

// The templates

test('fills the placeholders and leaves the ones it does not know', () => {
  assert.equal(fill('{a} y {b} y {c}', { text: { a: 'uno' }, raw: { b: 'dos' } }, false), 'uno y dos y {c}');
});

test('escapes what comes from the game only where Discord shows markdown', () => {
  const values = { text: { name: 'Player_One *x*' }, raw: { link: 'https://a_b.test' } };

  assert.equal(fill('{name} {link}', values, true), 'Player\\_One \\*x\\* https://a_b.test');
  assert.equal(fill('{name}', values, false), 'Player_One *x*');
});

test('never reads a value for placeholders, nor a name from the prototype', () => {
  assert.equal(fill('{a} {constructor}', { text: { a: '{b}', b: 'no' } }, false), '{b} {constructor}');
});

test('lists the placeholders of a text', () => {
  assert.deepEqual(placeholdersIn('{a} y {b_c} no {D} ni {}'), ['a', 'b_c']);
});

test('turns :name: into the emoji of the server and keeps what it does not know', () => {
  const find = (name: string) => (name === 'rayEdgy' ? '<:rayEdgy:1>' : undefined);

  assert.equal(resolveEmojis(':rayEdgy: hola :nada: 12:30:45', find), '<:rayEdgy:1> hola :nada: 12:30:45');
  assert.equal(resolveEmojis(':rayEdgy::rayEdgy:', find), '<:rayEdgy:1><:rayEdgy:1>');
  assert.equal(resolveEmojis('<:rayEdgy:745510357715517560>', () => 'X'), '<:rayEdgy:745510357715517560>');
});

test('cuts a text with an ellipsis and accepts only addresses Discord takes', () => {
  assert.equal(clip('abcdef', 4), 'abc…');
  assert.equal(clip('abc', 4), 'abc');
  assert.ok(isUrl('https://a.test/b.png'));
  assert.ok(isUrl('attachment://server-icon.png'));
  assert.ok(!isUrl('ftp://a.test'));
  assert.ok(!isUrl('no es un link'));
});

// The file

test('the file in the repository is valid and says what the defaults say', () => {
  const { config, warnings } = parseMessageConfig(readFileSync(MESSAGES_FILE, 'utf8'));

  assert.deepEqual(warnings, []);
  assert.deepEqual(plain(config), plain(DEFAULT_MESSAGES));
});

test('an empty file, or one without the keys, gives the defaults without a complaint', () => {
  for (const source of ['', '# nada\n', 'events:\n', 'events: {}\nchat:\n']) {
    const { config, warnings } = parseMessageConfig(source);
    assert.deepEqual(warnings, [], source);
    assert.deepEqual(plain(config), plain(DEFAULT_MESSAGES), source);
  }
});

test('a file that is not YAML gives all the defaults and says why', () => {
  const { config, warnings } = parseMessageConfig('events: [unclosed\n  - : :');

  assert.equal(config, DEFAULT_MESSAGES);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /not valid YAML/);
});

test('a file that is not a group of keys gives all the defaults', () => {
  const { config, warnings } = parseMessageConfig('- uno\n- dos\n');

  assert.equal(config, DEFAULT_MESSAGES);
  assert.match(warnings[0], /must be a group of keys/);
});

test('changes one event and leaves the others as they are', () => {
  const { config, warnings } = parseMessageConfig(`
events:
  join:
    color: "#123456"
    author: "Hola {displayname}"
    description: "Bienvenido a {botname}"
    footer: { text: "pie", icon: "https://a.test/i.png" }
    fields:
      - { name: "Quién", value: "{username}", inline: true }
    timestamp: true
`);

  assert.deepEqual(warnings, []);
  assert.deepEqual(plain(config.events.join), {
    color: 0x123456,
    author: { text: 'Hola {displayname}', icon: '{avatar}' },
    description: 'Bienvenido a {botname}',
    footer: { text: 'pie', icon: 'https://a.test/i.png' },
    fields: [{ name: 'Quién', value: '{username}', inline: true }],
    timestamp: true,
  });
  assert.deepEqual(plain(config.events.leave), plain(DEFAULT_MESSAGES.events.leave));
});

test('an event can be turned off, written as text or written as an embed', () => {
  const { config, warnings } = parseMessageConfig(`
events:
  join: false
  started: "El server está **arriba**"
  stopping:
    description: "Apagando"
`);

  assert.deepEqual(warnings, []);
  assert.equal(config.events.join, false);
  assert.equal(config.events.started, 'El server está **arriba**');
  assert.equal(embed(config.events.stopping).description, 'Apagando');
  assert.equal(embed(config.events.stopping).color, 0x5865f2, 'an embed without a color is blurple');
  assert.equal(embed(config.events.stopping).author, undefined);
});

test('an empty text turns off what a default would show', () => {
  const { config } = parseMessageConfig(`
events:
  join:
    author: ""
    description: "solo texto"
`);

  assert.equal(embed(config.events.join).author?.text, '');
});

test('accepts a color as a hex text or as a number', () => {
  const { config, warnings } = parseMessageConfig(`
events:
  join: { color: "#FF8800", description: "x" }
  leave: { color: 255, description: "x" }
`);

  assert.deepEqual(warnings, []);
  assert.equal(embed(config.events.join).color, 0xff8800);
  assert.equal(embed(config.events.leave).color, 255);
});

test('a wrong value is replaced by the default of that key and reported, the rest of the event is kept', () => {
  const { config, warnings } = parseMessageConfig(`
events:
  join:
    color: rojo
    author: "Hola {displayname}"
`);

  assert.equal(embed(config.events.join).color, 0x00ff00);
  assert.equal(embed(config.events.join).author?.text, 'Hola {displayname}');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /events\.join\.color is not a color/);
});

test('an unquoted hex color is a comment in YAML, so it is reported instead of silently ignored', () => {
  const { config, warnings } = parseMessageConfig('events:\n  join:\n    color: #ff0000\n    description: "x"\n');

  assert.equal(embed(config.events.join).color, 0x00ff00, 'the default of the event');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /events\.join\.color is empty .* in quotes/);
});

test('reports a placeholder that the message does not have', () => {
  const { config, warnings } = parseMessageConfig(`
events:
  started: "Hola {displayname}"
  join:
    author: "{deathmessage}"
`);

  assert.equal(config.events.started, DEFAULT_MESSAGES.events.started);
  assert.deepEqual(plain(embed(config.events.join).author), plain(embed(DEFAULT_MESSAGES.events.join).author));
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /events\.join\.author uses \{deathmessage\}/);
  assert.match(warnings[1], /events\.started uses \{displayname\}/);
});

test('the server icon is only for icons and images', () => {
  const { config, warnings } = parseMessageConfig(`
events:
  broadcast:
    author: { text: "Aviso", icon: "{servericon}" }
    thumbnail: "{servericon}"
    description: "{servericon}"
`);

  assert.equal(embed(config.events.broadcast).thumbnail, '{servericon}');
  assert.equal(embed(config.events.broadcast).author?.icon, '{servericon}');
  assert.equal(embed(config.events.broadcast).description, '{message}', 'it is not a text placeholder');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /events\.broadcast\.description uses \{servericon\}/);
});

test('reports a link that is not a link', () => {
  const { config, warnings } = parseMessageConfig(`
events:
  join:
    description: "x"
    thumbnail: "imagen.png"
    image: "https://a.test/i.png"
`);

  assert.equal(embed(config.events.join).thumbnail, undefined);
  assert.equal(embed(config.events.join).image, 'https://a.test/i.png');
  assert.match(warnings[0], /events\.join\.thumbnail is not a link/);
});

test('skips a field without a name or a value and keeps at most 25', () => {
  const many = Array.from({ length: 30 }, (_, i) => `      - { name: "n${i}", value: "v${i}" }`).join('\n');
  const { config, warnings } = parseMessageConfig(`
events:
  join:
    description: "x"
    fields:
      - { name: "solo nombre" }
      - uno
${many}
`);

  assert.equal(embed(config.events.join).fields.length, 25);
  assert.equal(embed(config.events.join).fields[0].name, 'n0');
  assert.equal(embed(config.events.join).fields[0].inline, false);
  assert.equal(warnings.length, 3);
});

test('reports keys that are not known, which are usually typos', () => {
  const { warnings } = parseMessageConfig(`
evnts: {}
events:
  joinn: "x"
  join:
    colour: "#ffffff"
chat:
  name: "x"
`);

  assert.deepEqual(
    [...warnings].sort(),
    [
      'chat.name is not a known key and is ignored',
      'evnts is not a known key and is ignored',
      'events.join.colour is not a known key and is ignored',
      'events.joinn is not a known key and is ignored',
    ].sort(),
  );
});

test('reads the name of the /me webhook, the crash time and the topic', () => {
  const { config, warnings } = parseMessageConfig(`
chat:
  emote_name: "+ {username}"
crash_after_seconds: 30
topic:
  online: "{playercount} de {playermax} · {totalplayers} jugadores en total"
  offline: "Apagado"
`);

  assert.deepEqual(warnings, []);
  assert.equal(config.chat.emoteName, '+ {username}');
  assert.equal(config.crashAfterSeconds, 30);
  assert.equal(config.topic.online, '{playercount} de {playermax} · {totalplayers} jugadores en total');
  assert.equal(config.topic.offline, 'Apagado');
});

test('wrong values of the chat, the crash time and the topic fall back to the defaults', () => {
  const { config, warnings } = parseMessageConfig(`
chat:
  emote_name: "{displayname} {message}"
crash_after_seconds: 0
topic:
  online: "{tps} {uptime}"
  offline: 3
`);

  assert.equal(config.chat.emoteName, DEFAULT_MESSAGES.chat.emoteName);
  assert.equal(config.crashAfterSeconds, DEFAULT_MESSAGES.crashAfterSeconds);
  assert.deepEqual(config.topic, DEFAULT_MESSAGES.topic);
  assert.equal(warnings.length, 4);
});

// Loading

const logger = () => {
  const lines: string[] = [];
  return { lines, log: (text: string) => void lines.push(text), error: (text: string) => void lines.push(text) };
};

test('loads the file and logs each problem once', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'messages-'));
  const file = path.join(dir, 'messages.yml');
  writeFileSync(file, 'events:\n  join: { color: rojo, description: "x" }\n  started: "hola"\n');
  const { lines, ...log } = logger();

  const config = loadMessageConfig(file, log);

  assert.equal(config.events.started, 'hola');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[Minecraft\] messages: events\.join\.color is not a color/);
});

test('a missing file gives the defaults and says so', () => {
  const { lines, ...log } = logger();

  const config = loadMessageConfig(path.join(tmpdir(), 'no-existe-minecraft-messages.yml'), log);

  assert.equal(config, DEFAULT_MESSAGES);
  assert.match(lines[0], /was not found, so the default messages are used/);
});
