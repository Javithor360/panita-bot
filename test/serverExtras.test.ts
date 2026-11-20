import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMOJIS } from '../src/config/emojis';
import { localeLabel } from '../src/features/info/labels';
import { countPresences } from '../src/features/info/presence';
import {
  activityLines,
  communityLines,
  eventLine,
  soundLine,
  stickerLine,
  type ActivityData,
  type CommunityData,
  type ServerExtra,
} from '../src/features/info/serverExtras';
import { boosterLines, serverMessage, SERVER_FLAGS, type ServerData, type ServerView } from '../src/features/info/serverView';

const base = (extra: Partial<ServerData> = {}): ServerData => ({
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
  afkChannelId: null,
  afkTimeoutSeconds: 300,
  roles: [],
  emojis: [],
  stickers: 0,
  features: [],
  vanityCode: null,
  serverTag: null,
  boosters: [],
  membersComplete: true,
  tree: [],
  ...extra,
});

const makeId = (view: ServerView, page: number, slot: string) => `server:page:${view}:${page}:${slot}`;
const show = (view: ServerView, extra: ServerExtra, data = base()) => serverMessage(view, data, 0, makeId, () => 0, extra);
const json = (message: ReturnType<typeof show>) => (message.embeds![0] as any).toJSON();

const activity = (extra: Partial<ActivityData> = {}): ActivityData => ({
  voiceTotal: 5,
  voiceChannels: [{ id: '600000000000000001', count: 3 }, { id: '600000000000000002', count: 2 }],
  activeThreads: 4,
  oldest: [{ id: '1', joinedAt: new Date('2020-05-06T00:00:00Z') }],
  newest: [{ id: '9', joinedAt: new Date('2026-11-18T00:00:00Z') }],
  ...extra,
});

test('the flags are the ones asked for, all of them listed in the parameters', () => {
  assert.deepEqual(SERVER_FLAGS.map(f => f.flag), ['roles', 'emojis', 'channels', 'activity', 'community', 'stickers', 'events', 'sounds', 'boost', 'icon', 'banner']);
});

test('activity says who is in voice and where, the active threads and the newest and oldest members', () => {
  const lines = activityLines(activity(), null, true);
  assert.equal(lines[0], '**En voz ahora** (5)');
  assert.equal(lines[1], '• <#600000000000000001>: 3 personas');
  assert.equal(lines[2], '• <#600000000000000002>: 2 personas');
  assert.ok(lines.includes('**Hilos activos**: 4'));
  assert.ok(lines.includes('**Miembros más nuevos**'));
  assert.ok(lines.includes('**Miembros más antiguos**'));
  assert.ok(lines.some(line => /^• <@9> <t:\d+:R>$/.test(line)));
  assert.equal(lines.some(line => line.includes('Conectados')), false);
});

test('activity with nobody in voice, a long list of channels, and members online when the bot has presences', () => {
  assert.equal(activityLines(activity({ voiceTotal: 0, voiceChannels: [] }), null, true)[1], 'Nadie en voz');
  assert.deepEqual(activityLines(activity({ voiceChannels: [{ id: '6', count: 1 }] }), null, true)[1], '• <#6>: 1 persona');

  const many = Array.from({ length: 13 }, (_, i) => ({ id: `60000000000000000${i}`.slice(0, 18), count: 1 }));
  const lines = activityLines(activity({ voiceChannels: many }), null, true);
  assert.equal(lines.filter(line => line.startsWith('• <#')).length, 10);
  assert.ok(lines.includes('… y 3 canales más'));

  const presence = countPresences([{ status: 'online', mobile: false, activities: [] }, { status: 'dnd', mobile: false, activities: [] }], 10);
  assert.ok(activityLines(activity(), presence, true).includes(`**Conectados**: ${EMOJIS.online} 1 · ${EMOJIS.idle} 0 · ${EMOJIS.dnd} 1`));
});

test('an incomplete member list marks the newest and oldest as approximate', () => {
  const lines = activityLines(activity(), null, false);
  assert.ok(lines.includes('**Miembros más nuevos** (aprox.)'));
  assert.ok(lines.includes('**Miembros más antiguos** (aprox.)'));
  assert.equal(activityLines(activity({ newest: [], oldest: [] }), null, true).some(line => line.includes('Miembros más')), false);
});

const community = (extra: Partial<CommunityData> = {}): CommunityData => ({
  description: 'El mejor servidor',
  rulesChannelId: '400000000000000001',
  systemChannelId: '400000000000000002',
  updatesChannelId: '400000000000000003',
  safetyChannelId: null,
  vanityCode: 'panita',
  locale: 'es-419',
  mfaLevel: 1,
  explicitFilter: 2,
  notifications: 1,
  maxMembers: 500000,
  nsfwLevel: 2,
  ...extra,
});

test('community lists the settings, and leaves out the ones the server does not have', () => {
  const lines = communityLines(community());
  assert.ok(lines.includes('• Descripción: **El mejor servidor**'));
  assert.ok(lines.includes('• Reglas: **<#400000000000000001>**'));
  assert.ok(lines.includes('• URL personalizada: **discord.gg/panita**'));
  assert.ok(lines.includes('• Idioma: **Español (Latinoamérica) 🌎**'));
  assert.ok(lines.includes('• Verificación en dos pasos: **Obligatoria para moderadores**'));
  assert.ok(lines.includes('• Filtro de contenido: **Todos los miembros**'));
  assert.ok(lines.includes('• Notificaciones: **Solo menciones**'));
  assert.ok(lines.includes('• Contenido NSFW: **Seguro**'));
  assert.ok(lines.includes('• Máximo de miembros: **500000**'));
  assert.equal(lines.some(line => line.includes('Alertas de seguridad')), false);

  const bare = communityLines(community({ description: null, rulesChannelId: null, systemChannelId: null, updatesChannelId: null, vanityCode: null, maxMembers: null }));
  assert.equal(bare.some(line => /Descripción|Reglas|URL|Máximo/.test(line)), false);
});

test('the language is the server\'s locale with its flag, and an unknown one is shown as it is', () => {
  assert.equal(localeLabel('es-ES'), 'Español (España) 🇪🇸');
  assert.equal(localeLabel('en-US'), 'Inglés (EE. UU.) 🇺🇸');
  assert.equal(localeLabel('xx-YY'), 'xx-YY');
});

test('events show the name, the date, where and whether they are on now', () => {
  const soon = eventLine({ name: 'Inauguración', startsAt: new Date('2026-12-01T20:00:00Z'), active: false, where: { channelId: '600000000000000001' } });
  assert.match(soon, /^\*\*Inauguración\*\*\n<t:\d+:F> \(<t:\d+:R>\) · <#600000000000000001>$/);
  const live = eventLine({ name: 'Torneo', startsAt: new Date('2026-11-19T20:00:00Z'), active: true, where: { location: 'mc.panitacraft.com' } });
  assert.ok(live.startsWith(`${EMOJIS.online} **Torneo**`));
  assert.ok(live.endsWith('mc.panitacraft.com'));
  assert.match(eventLine({ name: 'x', startsAt: null, active: false, where: null }), /sin fecha$/);
});

test('sounds and stickers are one line each', () => {
  assert.equal(soundLine({ name: 'Aplausos', emoji: '👏', volume: 0.5, uploader: 'ana', available: true }), '👏 **Aplausos** · volumen 50% · de ana');
  assert.equal(soundLine({ name: 'x', emoji: null, volume: 1, uploader: null, available: false }), '**x** · volumen 100% · no disponible');
  assert.equal(stickerLine({ name: 'Pepe', tags: 'rana, meme', format: 'APNG', available: true }), '**Pepe** · APNG · rana, meme');
  assert.equal(stickerLine({ name: 'Baile', tags: null, format: 'Lottie', available: false }), '**Baile** · Lottie · no disponible');
});

test('the events, sounds and stickers views are lists that page and say when there is nothing', () => {
  const events = Array.from({ length: 10 }, (_, i) => ({ name: `Evento ${i}`, startsAt: new Date(2026, 11, i + 1), active: false, where: null }));
  const first = show('events', { events });
  assert.ok(json(first).description.startsWith('**Eventos** (10)'));
  assert.equal(((first.components![0] as any).toJSON().components as any[])[1].label, '1/2');

  assert.match(json(show('events', { events: [] })).description, /No hay eventos programados/);
  assert.match(json(show('sounds', { sounds: [] })).description, /no tiene sonidos/);
  assert.match(json(show('stickers', { stickers: [] })).description, /no tiene stickers/);

  const stickers = Array.from({ length: 21 }, (_, i) => ({ name: `S${i}`, tags: null, format: 'PNG', available: true }));
  assert.equal(((show('stickers', { stickers }).components![0] as any).toJSON().components as any[])[1].label, '1/2');
});

test('the activity and community views are single embeds, and say so when the data could not be read', () => {
  const activityMessage = show('activity', { activity: activity() });
  assert.deepEqual(activityMessage.components, []);
  assert.ok(json(activityMessage).description.startsWith('**En voz ahora** (5)'));
  assert.match(json(show('activity', {})).description, /No pude leer la actividad/);
  assert.ok(json(show('community', { community: community() })).description.includes('• Reglas:'));
  assert.match(json(show('community', {})).description, /no tiene configuración de comunidad/);
});

test('boost lists the boosters with since when, the first 25 and the rest counted', () => {
  assert.deepEqual(boosterLines([]), ['**Impulsores**', 'Nadie impulsa el servidor todavía.']);

  const some = boosterLines([{ id: '111111111111111111', since: new Date('2025-01-01T00:00:00Z') }]);
  assert.equal(some[0], '**Impulsores** (1)');
  assert.match(some[1], /^<@111111111111111111> <t:\d+:R>$/);

  const many = Array.from({ length: 30 }, (_, i) => ({ id: String(100_000_000_000_000_000n + BigInt(i)), since: new Date(2025, 0, i + 1) }));
  const lines = boosterLines(many);
  assert.equal(lines.filter(line => line.startsWith('<@')).length, 25);
  assert.equal(lines[lines.length - 1], '… y 5 más');

  const description = json(show('boost', {}, base({ boosters: many.slice(0, 2) }))).description as string;
  assert.ok(description.includes('**Impulsores** (2)'));
});
