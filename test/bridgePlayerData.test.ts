import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPlaytime, playerInfoEmbed } from '../src/features/minecraft/embeds';
import { readQueryData } from '../src/features/minecraft/protocol';

const UUID = 'dd12be42-52a9-4a91-a8a1-11c01849e498';
const SKIN = 'a'.repeat(64);

const player = (over: Record<string, unknown> = {}) => ({
  name: 'Javithor360',
  nickname: 'Javi',
  uuid: UUID,
  premium: true,
  skin: SKIN,
  ping: 42,
  display: [{ t: '[PANITA] ', c: '#aa00ff', b: true }, { t: 'Javi' }],
  ...over,
});

test('reads a list with the uuid, skin, ping and the line of each player', () => {
  const data = readQueryData('playerlist', { online: [player()], max: 25 });
  assert.deepEqual(data, {
    online: [
      {
        name: 'Javithor360',
        nickname: 'Javi',
        uuid: UUID,
        premium: true,
        skin: SKIN,
        ping: 42,
        display: [{ text: '[PANITA] ', color: '#aa00ff', bold: true }, { text: 'Javi' }],
      },
    ],
    max: 25,
  });
});

test('a mod that knows only names and nicknames still gives a valid list', () => {
  assert.deepEqual(readQueryData('playerlist', { online: [{ name: 'Tezzlar', nickname: null }], max: 20 }), {
    online: [{ name: 'Tezzlar', nickname: null }],
    max: 20,
  });
});

test('the cosmetic fields that are not valid are left out and the player is kept', () => {
  const data = readQueryData('playerlist', {
    online: [player({ uuid: 'nope', skin: 'short', ping: -3, display: [{ t: 'x', c: 'red' }] })],
    max: 20,
  });
  assert.deepEqual(data?.online[0], { name: 'Javithor360', nickname: 'Javi', premium: true });
});

test('a line with too many runs, text too long or a mark that is not true is dropped', () => {
  const many = Array.from({ length: 17 }, () => ({ t: 'a' }));
  assert.equal(readQueryData('playerlist', { online: [player({ display: many })], max: 20 })?.online[0].display, undefined);
  assert.equal(readQueryData('playerlist', { online: [player({ display: [{ t: 'x'.repeat(81) }] })], max: 20 })?.online[0].display, undefined);
  assert.equal(readQueryData('playerlist', { online: [player({ display: [{ t: 'x', b: false }] })], max: 20 })?.online[0].display, undefined);
  assert.equal(readQueryData('playerlist', { online: [player({ display: [{ t: '' }] })], max: 20 })?.online[0].display, undefined);
  assert.equal(readQueryData('playerlist', { online: [player({ display: [{ t: 'x', f: 'Not A Font' }] })], max: 20 })?.online[0].display, undefined);
});

test('keeps the font of a run and every mark that is on', () => {
  const data = readQueryData('playerlist', {
    online: [player({ display: [{ t: '', f: 'panita:ranks', i: true, u: true, s: true, o: true }] })],
    max: 20,
  });
  assert.deepEqual(data?.online[0].display, [{ text: '', font: 'panita:ranks', italic: true, underline: true, strikethrough: true, obfuscated: true }]);
});

test('a player of the list with an invalid name rejects the whole answer', () => {
  assert.equal(readQueryData('playerlist', { online: [player({ name: 'not a name' })], max: 20 }), null);
});

test('reads the answer about a player, found or not', () => {
  assert.deepEqual(readQueryData('playerinfo', { found: false }), { found: false });
  assert.deepEqual(readQueryData('playerinfo', { ...player(), found: true, online: true, playtimeSeconds: 3600 }), {
    found: true,
    online: true,
    playtimeSeconds: 3600,
    player: {
      name: 'Javithor360',
      nickname: 'Javi',
      uuid: UUID,
      premium: true,
      skin: SKIN,
      ping: 42,
      display: [{ text: '[PANITA] ', color: '#aa00ff', bold: true }, { text: 'Javi' }],
    },
  });
  const unknown = readQueryData('playerinfo', { ...player(), found: true, online: false });
  assert.equal(unknown && unknown.found && unknown.playtimeSeconds, null);
});

test('refuses an answer about a player that is not the documented shape', () => {
  assert.equal(readQueryData('playerinfo', { name: 'Javithor360' }), null);
  assert.equal(readQueryData('playerinfo', { ...player(), found: true }), null);
  assert.equal(readQueryData('playerinfo', { ...player(), found: true, online: 'yes' }), null);
  assert.equal(readQueryData('playerinfo', { found: true, name: 'bad name', online: true }), null);
});

test('writes a time played with the units that are not zero', () => {
  assert.equal(formatPlaytime(0), '0s');
  assert.equal(formatPlaytime(48), '48s');
  assert.equal(formatPlaytime(60), '1m');
  assert.equal(formatPlaytime(3661), '1h 1m 1s');
  assert.equal(formatPlaytime(7 * 86400 + 16 * 3600 + 38 * 60 + 48), '1w 16h 38m 48s');
  assert.equal(formatPlaytime(86400 * 3 + 5), '3d 5s');
  assert.equal(formatPlaytime(-5), '0s');
});

test('the card of a player is an embed with their time played, with the picture or in text', () => {
  const info = readQueryData('playerinfo', { ...player(), found: true, online: true, playtimeSeconds: 3600 });
  assert.ok(info && info.found);
  const withPicture = playerInfoEmbed(info, true).toJSON();
  assert.equal(withPicture.title, 'Información de Javi');
  assert.match(withPicture.description ?? '', /Tiempo jugado:\*\* 1h/);
  assert.equal(withPicture.image?.url, 'attachment://playerinfo.png');

  const text = playerInfoEmbed(info, false).toJSON();
  assert.equal(text.image, undefined);
  assert.equal(text.fields?.[0].name, '[PANITA] Javi');
  assert.equal(text.fields?.[0].value, 'Status: Online');

  const away = readQueryData('playerinfo', { name: 'Tezzlar', nickname: null, found: true, online: false });
  assert.ok(away && away.found);
  const awayEmbed = playerInfoEmbed(away, false).toJSON();
  assert.match(awayEmbed.description ?? '', /Sin registro/);
  assert.equal(awayEmbed.fields?.[0].value, 'Status: Offline');
});
