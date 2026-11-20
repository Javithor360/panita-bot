import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMOJIS } from '../src/config/emojis';
import { joinExtremes, joinPosition, isMemberListComplete } from '../src/features/info/members';
import {
  cosmeticsLines,
  permissionLines,
  profileFooter,
  voiceLines,
  voiceStates,
  type CosmeticsInput,
  type PermissionsInput,
  type VoiceInfo,
} from '../src/features/info/userExtras';
import { userEmbed, type UserViewInput } from '../src/features/info/userView';

const voice = (extra: Partial<VoiceInfo> = {}): VoiceInfo => ({
  channelId: '600000000000000001',
  serverMute: false,
  serverDeaf: false,
  selfMute: false,
  selfDeaf: false,
  streaming: false,
  camera: false,
  ...extra,
});

test('what a person is doing in voice is told in words, and nothing special is just connected', () => {
  assert.deepEqual(voiceStates(voice()), ['conectado']);
  assert.deepEqual(voiceStates(voice({ selfMute: true })), ['micrófono apagado']);
  assert.deepEqual(voiceStates(voice({ selfMute: true, selfDeaf: true, streaming: true, camera: true })), ['micrófono apagado', 'ensordecido', 'transmitiendo', 'cámara encendida']);
  // A moderator's mute wins over the person's own, and is said as such
  assert.deepEqual(voiceStates(voice({ serverMute: true, selfMute: true, serverDeaf: true })), ['silenciado por un moderador', 'ensordecido por un moderador']);
  assert.deepEqual(voiceLines(voice({ streaming: true })), ['• Canal: <#600000000000000001>', '• Estado: transmitiendo']);
});

test('the footer has the place by join date and the roles, and only the roles when the place is unknown', () => {
  assert.equal(profileFooter(37, 12), 'Miembro #37 en entrar · 12 roles');
  assert.equal(profileFooter(1, 1), 'Miembro #1 en entrar · 1 rol');
  assert.equal(profileFooter(null, 0), '0 roles');
});

const entry = (id: string, joinedTimestamp: number | null) => ({ id, joinedTimestamp });

test('the join position is the place by date, ties go by id, and an incomplete list gives none', () => {
  const entries = [entry('c', 300), entry('a', 100), entry('b', 200), entry('d', null)];
  assert.equal(joinPosition(entries, 'a', true), 1);
  assert.equal(joinPosition(entries, 'b', true), 2);
  assert.equal(joinPosition(entries, 'c', true), 3);
  assert.equal(joinPosition(entries, 'd', true), null);
  assert.equal(joinPosition(entries, 'zzz', true), null);
  assert.equal(joinPosition(entries, 'a', false), null);
  assert.equal(joinPosition([entry('x', 5), entry('a', 5)], 'x', true), 2);
});

test('the newest and oldest members come out in order, without those with no date', () => {
  const entries = [entry('c', 300), entry('a', 100), entry('b', 200), entry('d', null), entry('e', 400)];
  const { oldest, newest } = joinExtremes(entries, 2);
  assert.deepEqual(oldest.map(e => e.id), ['a', 'b']);
  assert.deepEqual(newest.map(e => e.id), ['e', 'c']);
  assert.deepEqual(joinExtremes([], 5), { oldest: [], newest: [] });
});

test('a member list is complete when it holds nearly everybody', () => {
  assert.equal(isMemberListComplete(90, 100), true);
  assert.equal(isMemberListComplete(89, 100), false);
  assert.equal(isMemberListComplete(0, 0), false);
});

const cosmetics = (extra: Partial<CosmeticsInput> = {}): CosmeticsInput => ({
  decorationUrl: null,
  nameplate: null,
  tag: null,
  hasBanner: false,
  accentColor: null,
  ...extra,
});

test('cosmetics say "Ninguna" for what a person does not have', () => {
  const text = cosmeticsLines(cosmetics()).join('\n');
  assert.ok(text.includes('**Decoración de avatar**\nNinguna'));
  assert.ok(text.includes('**Placa de nombre**\nNinguna'));
  assert.ok(text.includes('**Etiqueta del servidor**\nNinguna'));
  assert.ok(text.includes('• Banner: No tiene'));
  assert.ok(text.includes('• Color de acento: Ninguno'));
});

test('cosmetics show the decoration, the nameplate, the tag with its server and the banner and color', () => {
  const text = cosmeticsLines(cosmetics({
    decorationUrl: 'https://cdn.example/deco.png',
    nameplate: { label: 'Lava', palette: 'crimson' },
    tag: { text: 'PANA', badgeUrl: 'https://cdn.example/badge.png', guildName: 'Panitacraft' },
    hasBanner: true,
    accentColor: 0x00ff7f,
  })).join('\n');

  assert.ok(text.includes('[Ver la decoración](https://cdn.example/deco.png)'));
  assert.ok(text.includes('• Nombre: Lava\n• Paleta: crimson'));
  assert.ok(text.includes('• Etiqueta: `PANA`\n• Servidor: Panitacraft\n• [Ver la insignia](https://cdn.example/badge.png)'));
  assert.ok(text.includes('• Banner: Sí'));
  assert.ok(text.includes('• Color de acento: `#00ff7f`'));
});

const permissions = (extra: Partial<PermissionsInput> = {}): PermissionsInput => ({
  channelId: '700000000000000001',
  voice: false,
  administrator: false,
  allowed: ['ViewChannel', 'SendMessages', 'EmbedLinks'],
  ...extra,
});

test('permissions in a text channel are a check or a cross each', () => {
  const lines = permissionLines(permissions());
  assert.equal(lines[0], '**Permisos en <#700000000000000001>**');
  assert.ok(lines.includes(`${EMOJIS.check} Ver el canal`));
  assert.ok(lines.includes(`${EMOJIS.check} Escribir mensajes`));
  assert.ok(lines.includes(`${EMOJIS.cross} Adjuntar archivos`));
  assert.ok(lines.includes(`${EMOJIS.cross} Gestionar mensajes`));
  assert.equal(lines.some(line => line.includes('Hablar')), false);
});

test('a voice channel lists the voice permissions, and an administrator has everything', () => {
  const lines = permissionLines(permissions({ voice: true, allowed: ['ViewChannel', 'Connect'] }));
  assert.ok(lines.includes(`${EMOJIS.check} Conectarse`));
  assert.ok(lines.includes(`${EMOJIS.cross} Hablar`));
  assert.equal(lines.some(line => line.includes('Escribir')), false);

  assert.deepEqual(permissionLines(permissions({ administrator: true })), [
    '**Permisos en <#700000000000000001>**',
    `${EMOJIS.check} Es Administrador: tiene todos los permisos en este canal.`,
  ]);
});

const base = (): UserViewInput => ({
  user: { id: '1', username: 'ana', displayName: 'Ana', bot: false, createdAt: new Date('2020-01-01'), avatarUrl: 'https://cdn.example/a.png', bannerUrl: null, accentColor: null, flags: [] },
  member: {
    nickname: null, displayName: 'Ana', joinedAt: new Date('2021-01-01'), boostingSince: null, timeoutUntil: null, avatarUrl: null,
    roles: [{ id: 'r1', color: 0 }], roleColor: 0, permissions: [], joinPosition: 12, voice: null,
  },
  presence: null,
  view: 'profile',
  random: () => 0,
});

test('the profile has the footer, and the voice section only while the person is in a channel', () => {
  const idle = userEmbed(base()).toJSON();
  assert.equal(idle.footer?.text, 'Miembro #12 en entrar · 1 rol');
  assert.equal(idle.description!.includes('**Voz**'), false);

  const input = base();
  input.member!.voice = voice({ selfMute: true });
  const talking = userEmbed(input).toJSON().description!;
  assert.ok(talking.includes('**Voz**\n• Canal: <#600000000000000001>\n• Estado: micrófono apagado'));
});

test('someone outside the server has no footer and no voice section', () => {
  const json = userEmbed({ ...base(), member: null }).toJSON();
  assert.equal(json.footer, undefined);
  assert.equal(json.description!.includes('**Voz**'), false);
});

test('--cosmetics and --permissions replace the profile, and a person outside the server has no permissions', () => {
  const cos = userEmbed({ ...base(), view: 'cosmetics', cosmetics: cosmetics({ decorationUrl: 'https://cdn.example/deco.png' }) }).toJSON();
  assert.ok(cos.description!.startsWith('**Decoración de avatar**'));
  assert.equal(cos.thumbnail?.url, 'https://cdn.example/deco.png');
  assert.equal(cos.footer, undefined);

  const perm = userEmbed({ ...base(), view: 'permissions', permissions: permissions() }).toJSON();
  assert.ok(perm.description!.startsWith('**Permisos en <#700000000000000001>**'));

  const outside = userEmbed({ ...base(), member: null, view: 'permissions', permissions: null }).toJSON();
  assert.match(outside.description!, /no está en el servidor/);
});
