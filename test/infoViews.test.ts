import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLORS } from '../src/config/constants';
import { EMOJIS } from '../src/config/emojis';
import { avatarMessage } from '../src/features/info/avatarView';
import { badgeLines, NO_BADGES } from '../src/features/info/badges';
import { dateWithAge, snowflakeDate } from '../src/features/info/dates';
import { emojiLimit, featureLabels, stickerLimit } from '../src/features/info/labels';
import { PASTELS, pastel } from '../src/features/info/palette';
import { clampPage, pageRow, paginate } from '../src/features/info/pages';
import { activityText, countPresences, presenceRow, statusColor, statusText, type PresenceInfo } from '../src/features/info/presence';
import { permissionLabels, ROLE_LIST_MAX, roleList, userColor, userEmbed, type UserViewInput, type UserViewMember, type UserViewUser } from '../src/features/info/userView';

const user = (extra: Partial<UserViewUser> = {}): UserViewUser => ({
  id: '481512865795145730',
  username: 'raycoleck',
  displayName: 'Rayco',
  bot: false,
  createdAt: new Date('2018-08-21T00:00:00Z'),
  avatarUrl: 'https://cdn.example/a.png',
  bannerUrl: null,
  accentColor: null,
  flags: [],
  ...extra,
});

const member = (extra: Partial<UserViewMember> = {}): UserViewMember => ({
  nickname: 'Apodo',
  displayName: 'Apodo',
  joinedAt: new Date('2020-07-15T00:00:00Z'),
  boostingSince: null,
  timeoutUntil: null,
  avatarUrl: null,
  roles: [{ id: 'r2', color: 0 }, { id: 'r1', color: 0xff0000 }],
  roleColor: 0xff0000,
  permissions: ['SendMessages', 'ManageMessages'],
  ...extra,
});

const online: PresenceInfo = { status: 'online', mobile: true, activities: [{ type: 0, name: 'Minecraft', state: null }] };

const input = (extra: Partial<UserViewInput> = {}): UserViewInput => ({
  user: user(),
  member: member(),
  presence: null,
  badges: false,
  random: () => 0,
  ...extra,
});

const description = (extra: Partial<UserViewInput> = {}) => userEmbed(input(extra)).toJSON().description ?? '';

test('a member gets the bold headings and bullets of Noa: identity, account, roles and key permissions', () => {
  const text = description();
  assert.match(text, /^\*\*Identificación\*\*\n• Usuario: raycoleck\n• ID: `481512865795145730`\n• Apodo: Apodo/);
  assert.match(text, /\*\*Cuenta\*\*\n• Creada el: <t:\d+:D> \(<t:\d+:R>\)\n• Ingresó al servidor: <t:\d+:D> \(<t:\d+:R>\)/);
  assert.match(text, /\*\*Roles\*\*\n• Rol destacado: <@&r2>\n• Listado de roles: <@&r2> \| <@&r1>/);
  assert.match(text, /\*\*Permisos clave\*\*\nGestionar mensajes$/);
});

test('someone who is not in the server only gets what the account has', () => {
  const text = description({ member: null });
  assert.match(text, /\*\*Identificación\*\*/);
  assert.match(text, /\*\*Cuenta\*\*\n• Creada el:/);
  for (const missing of ['Apodo', 'Ingresó', 'Roles', 'Permisos', 'Boosteando', 'Silenciado']) assert.equal(text.includes(missing), false, missing);
});

test('the status section shows the state with its circle and the phone, and what they are doing', () => {
  const text = description({ presence: online });
  assert.match(text, new RegExp(`\\*\\*Actividad\\*\\*\\n• Estado: Online ${EMOJIS.online} ${EMOJIS.mobile}\\n• Jugando a: Minecraft`));
  assert.equal(description({ presence: null }).includes('Actividad'), false);
});

test('boost, an active timeout and a bot are told, an expired timeout is not', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  const text = description({
    now,
    user: user({ bot: true }),
    member: member({ boostingSince: new Date('2025-01-01T00:00:00Z'), timeoutUntil: new Date('2026-11-20T00:00:00Z') }),
  });
  assert.match(text, /• Tipo: Bot/);
  assert.match(text, /• Boosteando desde: <t:\d+:D>/);
  assert.match(text, /• Silenciado hasta: <t:\d+:R>/);
  assert.equal(description({ now, member: member({ timeoutUntil: new Date('2026-11-18T00:00:00Z') }) }).includes('Silenciado'), false);
});

test('a long list of roles falls back to how many there are, as Noa did', () => {
  const roles = Array.from({ length: 100 }, (_, i) => ({ id: String(100_000_000_000_000_000n + BigInt(i)), color: 0 }));
  assert.ok(roleList(roles.slice(0, 3)).includes(' | '));
  assert.equal(roleList(roles), '100 roles');
  assert.ok(ROLE_LIST_MAX >= 1000);
  assert.match(description({ member: member({ roles }) }), /• Listado de roles: 100 roles/);
  assert.match(description({ member: member({ roles: [] }) }), /• Sin roles/);
});

test('administrators are shown as such, and ordinary members show only their key permissions', () => {
  assert.deepEqual(permissionLabels(['Administrator', 'ManageGuild']), ['Administrador (todos los permisos)']);
  assert.deepEqual(permissionLabels(['SendMessages', 'KickMembers', 'ManageGuild']), ['Gestionar servidor', 'Expulsar miembros']);
  assert.deepEqual(permissionLabels(['SendMessages']), []);
  assert.equal(description({ member: member({ permissions: ['SendMessages'] }) }).includes('Permisos clave'), false);
});

test('the color follows the status, then the highest role, then the account, then a pastel', () => {
  const base = { user: user(), member: member(), random: () => 0 };
  assert.equal(userColor({ ...base, presence: online }), COLORS.success);
  assert.equal(userColor({ ...base, presence: { ...online, status: 'idle' } }), COLORS.warning);
  assert.equal(userColor({ ...base, presence: { ...online, status: 'dnd' } }), COLORS.error);
  assert.equal(userColor({ ...base, presence: { ...online, status: 'offline' } }), 0xff0000);
  assert.equal(userColor({ ...base, presence: null }), 0xff0000);
  assert.equal(userColor({ ...base, presence: null, member: member({ roleColor: 0 }), user: user({ accentColor: 0x123456 }) }), 0x123456);
  assert.equal(userColor({ ...base, presence: null, member: null }), PASTELS[0]);
});

test('the author is the display name with the picture, and the banner is the image', () => {
  const json = userEmbed(input({ user: user({ bannerUrl: 'https://cdn.example/banner.png' }), member: member({ avatarUrl: 'https://cdn.example/server.png' }) })).toJSON();
  assert.equal(json.author?.name, 'Apodo');
  assert.equal(json.author?.icon_url, 'https://cdn.example/server.png');
  assert.equal(json.image?.url, 'https://cdn.example/banner.png');
  assert.equal(userEmbed(input({ member: null })).toJSON().author?.name, 'Rayco');
});

test('--badges lists the public badges, the server booster, or says there are none, and never claims Nitro', () => {
  const none = description({ badges: true });
  assert.match(none, /\*\*Insignias\*\*\nSin insignias/);
  assert.equal(NO_BADGES, 'Sin insignias');

  const some = description({
    badges: true,
    user: user({ flags: ['Staff', 'HypeSquadOnlineHouse2', 'ActiveDeveloper', 'Spammer', 'Quarantined', 'MFASMS'] }),
    member: member({ boostingSince: new Date('2025-01-01T00:00:00Z') }),
  });
  assert.match(some, /🛡️ Staff de Discord/);
  assert.match(some, /🟠 HypeSquad Brilliance/);
  assert.match(some, /🛠️ Desarrollador activo/);
  assert.match(some, /💎 Impulsor del servidor/);
  for (const hidden of ['Spammer', 'Quarantined', 'MFA', 'Nitro']) assert.equal(some.includes(hidden), false, hidden);

  assert.deepEqual(badgeLines({ flags: ['VerifiedBot'] }), ['✔️ Bot verificado']);
  assert.equal(description({ badges: true, member: null, user: user({ flags: ['Partner'] }) }).includes('Impulsor'), false);
});

test('the avatar embed is Noa\'s: the title links to the picture, a Google line and the picture big', () => {
  const formats = { png: 'https://cdn/a.png', jpg: 'https://cdn/a.jpg', webp: 'https://cdn/a.webp', gif: null };
  const message = avatarMessage({ displayName: 'Javi', imageUrl: 'https://cdn/a.png?size=2048', formats, fromServer: false, hasServerAvatar: false, random: () => 0 });
  const embed = message.embeds![0] as any;
  const json = embed.toJSON();

  assert.equal(json.title, 'Avatar de Javi');
  assert.equal(json.url, 'https://cdn/a.png?size=2048');
  assert.equal(json.image.url, 'https://cdn/a.png?size=2048');
  assert.equal(json.description, `[Búscalo en Google](https://lens.google.com/uploadbyurl?url=${encodeURIComponent('https://cdn/a.png?size=2048')})`);
  assert.equal(json.footer, undefined);

  const buttons = (message.components![0] as any).toJSON().components;
  assert.deepEqual(buttons.map((b: any) => b.label), ['PNG', 'JPG', 'WebP']);
  assert.ok(buttons.every((b: any) => b.style === 5 && b.url));
});

test('an animated avatar adds a GIF link, and a server avatar says so and how to see the account\'s', () => {
  const formats = { png: 'https://cdn/a.png', jpg: 'https://cdn/a.jpg', webp: 'https://cdn/a.webp', gif: 'https://cdn/a.gif' };
  const server = avatarMessage({ displayName: 'Javi', imageUrl: 'https://cdn/a.gif', formats, fromServer: true, hasServerAvatar: true });
  assert.deepEqual((server.components![0] as any).toJSON().components.map((b: any) => b.label), ['PNG', 'JPG', 'WebP', 'GIF']);
  assert.match((server.embeds![0] as any).toJSON().footer.text, /Avatar del servidor.*--global/);

  const account = avatarMessage({ displayName: 'Javi', imageUrl: 'https://cdn/a.png', formats, fromServer: false, hasServerAvatar: true });
  assert.equal((account.embeds![0] as any).toJSON().footer.text, 'Avatar de la cuenta');
});

test('pages: a list is split, an empty list is one empty page, and a bad page number is clamped', () => {
  assert.deepEqual(paginate([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(paginate([], 2), [[]]);
  assert.equal(clampPage(-3, 4), 0);
  assert.equal(clampPage(99, 4), 3);
  assert.equal(clampPage(Number.NaN, 4), 0);
  assert.equal(clampPage(2.9, 4), 2);
  assert.equal(clampPage(5, 0), 0);
});

test('the page buttons are back, a disabled "3/7" and next, each with its own id, and disappear for one page', () => {
  const makeId = (page: number, slot: string) => `server:page:roles:${page}:${slot}`;
  assert.equal(pageRow(makeId, 0, 1), null);

  const middle = (pageRow(makeId, 2, 7)!.toJSON() as any).components;
  assert.deepEqual(middle.map((b: any) => b.label), ['◀', '3/7', '▶']);
  assert.deepEqual(middle.map((b: any) => b.disabled ?? false), [false, true, false]);
  assert.equal(new Set(middle.map((b: any) => b.custom_id)).size, 3);
  assert.equal(middle[0].custom_id, 'server:page:roles:1:prev');
  assert.equal(middle[2].custom_id, 'server:page:roles:3:next');

  const first = (pageRow(makeId, 0, 7)!.toJSON() as any).components;
  assert.equal(first[0].disabled, true);
  assert.equal(new Set(first.map((b: any) => b.custom_id)).size, 3);
  const last = (pageRow(makeId, 6, 7)!.toJSON() as any).components;
  assert.equal(last[2].disabled, true);
});

test('the pastel is one of Noa\'s shades, chosen by the random source', () => {
  assert.equal(pastel(() => 0), PASTELS[0]);
  assert.equal(pastel(() => 0.999999), PASTELS[PASTELS.length - 1]);
  assert.ok(PASTELS.includes(pastel() as any));
});

test('dates come with their age, and a snowflake gives the day it was made', () => {
  assert.match(dateWithAge(new Date('2020-05-05T00:00:00Z')), /^<t:\d+:D> \(<t:\d+:R>\)$/);
  assert.equal(snowflakeDate('175928847299117063').toISOString(), '2016-04-30T11:18:25.796Z');
});

test('status: text with circle and phone, colors, and what they are doing', () => {
  assert.equal(statusText({ status: 'idle', mobile: false, activities: [] }), `Ausente ${EMOJIS.idle}`);
  assert.equal(statusText({ status: 'dnd', mobile: true, activities: [] }), `No molestar ${EMOJIS.dnd} ${EMOJIS.mobile}`);
  assert.equal(statusColor('offline'), null);
  assert.equal(statusColor('online'), COLORS.success);

  assert.equal(activityText([{ type: 0, name: 'Minecraft', state: null }]), 'Jugando a: Minecraft');
  assert.equal(activityText([{ type: 2, name: 'Spotify', state: null }]), 'Escuchando: Spotify');
  assert.equal(activityText([{ type: 4, name: 'Custom Status', state: 'de vacaciones' }]), 'Estado personalizado: de vacaciones');
  assert.equal(activityText([{ type: 4, name: 'Custom Status', state: null }]), null);
  assert.equal(activityText([]), null);
});

test('the row of circles counts each status, streaming and phones, and the rest are offline', () => {
  const presences: Array<PresenceInfo | null> = [
    online,
    { status: 'online', mobile: false, activities: [{ type: 1, name: 'Twitch', state: null }] },
    { status: 'idle', mobile: true, activities: [] },
    { status: 'dnd', mobile: false, activities: [] },
    { status: 'offline', mobile: false, activities: [] },
    null,
  ];
  const counts = countPresences(presences, 10);
  assert.deepEqual(counts, { online: 2, idle: 1, dnd: 1, streaming: 1, offline: 6, mobile: 2 });
  assert.equal(presenceRow(counts), `${EMOJIS.online} 2 · ${EMOJIS.idle} 1 · ${EMOJIS.dnd} 1 · ${EMOJIS.streaming} 1 · ${EMOJIS.offline} 6 · ${EMOJIS.mobile} 2`);
});

test('server limits follow the boost tier and never go out of the table', () => {
  assert.deepEqual([0, 1, 2, 3].map(emojiLimit), [50, 100, 150, 250]);
  assert.equal(emojiLimit(9), 250);
  assert.equal(emojiLimit(-1), 50);
  assert.deepEqual([0, 1, 2, 3].map(stickerLimit), [5, 15, 30, 60]);
  assert.deepEqual(featureLabels(['COMMUNITY', 'SOMETHING_INTERNAL', 'VANITY_URL']), ['Comunidad', 'URL personalizada']);
});
