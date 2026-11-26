import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLogEvent, GuildVerificationLevel, PermissionsBitField, type Guild } from 'discord.js';
import type { AuditAction } from '../src/features/auditLog/handlers';
import { createServerLog } from '../src/features/auditLog/serverHandlers';

const NOW = 1_700_000_000_000;
const GUILD = { id: 'home', name: 'Panitacraft' } as unknown as Guild;
const OTHER_GUILD = { id: 'other' } as unknown as Guild;

const harness = (audit: Partial<Record<AuditLogEvent, AuditAction>> = {}, voice: Partial<Record<number, AuditAction>> = {}) => {
  const posts: Array<{ author?: string; color?: number; fields: Record<string, string>; thumbnail?: string }> = [];
  const voiceLookups: Array<{ type: number; channelId?: string }> = [];
  const log = createServerLog({
    post: async entry => {
      for (const embed of entry.embeds) {
        const json = embed.toJSON();
        posts.push({
          author: json.author?.name,
          color: json.color,
          thumbnail: json.thumbnail?.url,
          fields: Object.fromEntries((json.fields ?? []).map(field => [field.name, field.value])),
        });
      }
    },
    modlogChannelId: 'log',
    isHomeGuild: guild => guild.id === 'home',
    botActions: { mark: () => {}, has: () => false },
    findAction: async (_guild, type) => audit[type] ?? null,
    findVoiceAction: async (_guild, type, channelId) => {
      voiceLookups.push({ type, channelId });
      return voice[type] ?? null;
    },
    sleep: async () => {},
    now: () => NOW,
  });
  return { log, posts, voiceLookups };
};

const user = (id = '111', bot = false) => ({ id, username: 'ana', bot, displayAvatarURL: () => 'https://cdn.example/a.png' });

const state = (override: Record<string, unknown> = {}) =>
  ({
    guild: GUILD,
    member: { id: '111', user: user() },
    channelId: null,
    serverMute: false,
    serverDeaf: false,
    streaming: false,
    ...override,
  }) as any;

// ── Voice ────────────────────────────────────────────────────────────────────────────────────────────────────────

test('voice: a member who joins a channel is logged with the channel', async () => {
  const { log, posts } = harness();
  await log.voiceStateUpdate(state(), state({ channelId: 'vc1' }));
  assert.equal(posts.length, 1);
  assert.match(posts[0].author!, /^Entró a voz · ana/);
  assert.equal(posts[0].fields.Canal, '<#vc1>');
});

test('voice: leaving by themselves is "Salió de voz"; a disconnect by a moderator names them', async () => {
  const self = harness();
  await self.log.voiceStateUpdate(state({ channelId: 'vc1' }), state());
  assert.match(self.posts[0].author!, /^Salió de voz/);

  const kicked = harness({}, { [AuditLogEvent.MemberDisconnect]: { executorId: '999', reason: null } });
  await kicked.log.voiceStateUpdate(state({ channelId: 'vc1' }), state());
  assert.match(kicked.posts[0].author!, /^Desconectado de voz/);
  assert.equal(kicked.posts[0].fields.Moderador, '<@999>');
});

test('voice: moving between channels says who moved the member, or that they went by themselves', async () => {
  const self = harness();
  await self.log.voiceStateUpdate(state({ channelId: 'vc1' }), state({ channelId: 'vc2' }));
  assert.match(self.posts[0].author!, /^Cambió de canal de voz/);
  assert.equal(self.posts[0].fields.De, '<#vc1>');
  assert.equal(self.posts[0].fields.A, '<#vc2>');
  assert.equal(self.posts[0].fields.Moderador, undefined);

  const moved = harness({}, { [AuditLogEvent.MemberMove]: { executorId: '999', reason: null } });
  await moved.log.voiceStateUpdate(state({ channelId: 'vc1' }), state({ channelId: 'vc2' }));
  assert.match(moved.posts[0].author!, /^Movido de canal de voz/);
  assert.equal(moved.posts[0].fields.Moderador, '<@999>');
  // The move is matched by the channel it ended in
  assert.deepEqual(moved.voiceLookups, [{ type: AuditLogEvent.MemberMove, channelId: 'vc2' }]);
});

test('voice: a server mute or deafen is logged with who did it; a self mute is not', async () => {
  const { log, posts } = harness({ [AuditLogEvent.MemberUpdate]: { executorId: '999', reason: null } });
  await log.voiceStateUpdate(state({ channelId: 'vc1' }), state({ channelId: 'vc1', serverMute: true }));
  await log.voiceStateUpdate(state({ channelId: 'vc1', serverDeaf: true }), state({ channelId: 'vc1' }));
  await log.voiceStateUpdate(state({ channelId: 'vc1' }), state({ channelId: 'vc1', selfMute: true }));

  assert.equal(posts.length, 2);
  assert.match(posts[0].author!, /^Muteo de voz · ana/);
  assert.equal(posts[0].fields.Moderador, '<@999>');
  assert.match(posts[1].author!, /^Ensordecimiento quitado/);
});

test('voice: a stream that starts and ends is logged, and the flags that come with a move are not', async () => {
  const { log, posts } = harness();
  await log.voiceStateUpdate(state({ channelId: 'vc1' }), state({ channelId: 'vc1', streaming: true }));
  await log.voiceStateUpdate(state({ channelId: 'vc1', streaming: true }), state({ channelId: 'vc1' }));
  // Leaving while streaming is one entry, not two
  await log.voiceStateUpdate(state({ channelId: 'vc1', streaming: true }), state({ streaming: false }));

  assert.deepEqual(posts.map(post => post.author!.split(' · ')[0]), ['Empezó una transmisión', 'Terminó su transmisión', 'Salió de voz']);
});

test('voice: bots and other servers are ignored', async () => {
  const { log, posts } = harness();
  await log.voiceStateUpdate(state(), state({ channelId: 'vc1', member: { id: '5', user: user('5', true) } }));
  await log.voiceStateUpdate(state({ guild: OTHER_GUILD }), state({ guild: OTHER_GUILD, channelId: 'vc1' }));
  assert.equal(posts.length, 0);
});

// ── Roles ────────────────────────────────────────────────────────────────────────────────────────────────────────

const role = (override: Record<string, unknown> = {}) =>
  ({
    guild: GUILD,
    id: 'r1',
    name: 'Miembro',
    hexColor: '#000000',
    hoist: false,
    mentionable: false,
    permissions: new PermissionsBitField(['SendMessages']),
    ...override,
  }) as any;

test('roles: creating and deleting one is logged with who did it', async () => {
  const { log, posts } = harness({
    [AuditLogEvent.RoleCreate]: { executorId: '999', reason: null },
    [AuditLogEvent.RoleDelete]: { executorId: '888', reason: null },
  });
  await log.roleCreate(role());
  await log.roleDelete(role());
  assert.match(posts[0].author!, /^Rol creado/);
  assert.equal(posts[0].fields['Creado por'], '<@999>');
  assert.match(posts[1].author!, /^Rol borrado/);
  assert.equal(posts[1].fields['Borrado por'], '<@888>');
});

test('roles: an edit lists the name, the color and the permissions that were added and removed', async () => {
  const { log, posts } = harness({ [AuditLogEvent.RoleUpdate]: { executorId: '999', reason: null } });
  await log.roleUpdate(
    role(),
    role({ name: 'Veterano', hexColor: '#ff0000', permissions: new PermissionsBitField(['ManageRoles']) }),
  );
  assert.equal(posts.length, 1);
  assert.equal(posts[0].fields.Nombre, 'Miembro → Veterano');
  assert.equal(posts[0].fields.Color, '#000000 → #ff0000');
  assert.equal(posts[0].fields['Permisos añadidos'], '`ManageRoles`');
  assert.equal(posts[0].fields['Permisos quitados'], '`SendMessages`');
  assert.equal(posts[0].fields['Editado por'], '<@999>');
});

test('roles: a change of position alone is not an entry', async () => {
  const { log, posts } = harness();
  await log.roleUpdate(role({ position: 1 }), role({ position: 4 }));
  assert.equal(posts.length, 0);
});

// ── Server ───────────────────────────────────────────────────────────────────────────────────────────────────────

const guild = (override: Record<string, unknown> = {}) =>
  ({
    id: 'home',
    name: 'Panitacraft',
    description: null,
    icon: 'abc',
    banner: null,
    splash: null,
    verificationLevel: GuildVerificationLevel.Low,
    explicitContentFilter: 0,
    defaultMessageNotifications: 1,
    mfaLevel: 0,
    systemChannelId: 'sys',
    rulesChannelId: null,
    publicUpdatesChannelId: null,
    afkChannelId: null,
    afkTimeout: 300,
    preferredLocale: 'es-ES',
    vanityURLCode: null,
    ownerId: 'owner',
    iconURL: () => 'https://cdn.example/icon.png',
    ...override,
  }) as any;

test('server: a change of name, icon and verification is logged with who did it', async () => {
  const { log, posts } = harness({ [AuditLogEvent.GuildUpdate]: { executorId: '999', reason: null } });
  await log.guildUpdate(guild(), guild({ name: 'Panita', icon: 'def', verificationLevel: GuildVerificationLevel.High }));
  assert.equal(posts.length, 1);
  assert.equal(posts[0].fields.Nombre, 'Panitacraft → Panita');
  assert.equal(posts[0].fields.Icono, 'cambió');
  assert.equal(posts[0].fields['Nivel de verificación'], 'Bajo → Alto');
  assert.equal(posts[0].fields['Editado por'], '<@999>');
  assert.equal(posts[0].thumbnail, 'https://cdn.example/icon.png');
});

test('server: an update that changes nothing the log tracks (a boost) is not an entry', async () => {
  const { log, posts } = harness();
  await log.guildUpdate(guild({ premiumSubscriptionCount: 1 }), guild({ premiumSubscriptionCount: 2 }));
  assert.equal(posts.length, 0);
});

// ── Emojis, stickers and sounds ──────────────────────────────────────────────────────────────────────────────────

const emoji = (override: Record<string, unknown> = {}) =>
  ({ guild: GUILD, id: 'e1', name: 'panita', roles: { cache: new Map() }, imageURL: () => 'https://cdn.example/e.png', ...override }) as any;

test('emojis: created, renamed and deleted', async () => {
  const { log, posts } = harness({
    [AuditLogEvent.EmojiCreate]: { executorId: '999', reason: null },
    [AuditLogEvent.EmojiUpdate]: { executorId: '999', reason: null },
    [AuditLogEvent.EmojiDelete]: { executorId: '888', reason: null },
  });
  await log.emojiCreate(emoji());
  await log.emojiUpdate(emoji(), emoji({ name: 'panita2' }));
  await log.emojiUpdate(emoji(), emoji());
  await log.emojiDelete(emoji());

  assert.deepEqual(posts.map(post => post.author), ['Emoji creado', 'Emoji editado', 'Emoji borrado']);
  assert.equal(posts[0].thumbnail, 'https://cdn.example/e.png');
  assert.equal(posts[1].fields.Nombre, 'panita → panita2');
  assert.equal(posts[1].fields.Emoji, '`panita2` (`e1`)');
  assert.equal(posts[2].fields['Borrado por'], '<@888>');
});

test('stickers: an edit lists what changed', async () => {
  const sticker = (override: Record<string, unknown> = {}) =>
    ({ guild: GUILD, id: 's1', name: 'hola', description: null, tags: '👋', url: 'https://cdn.example/s.png', ...override }) as any;
  const { log, posts } = harness();
  await log.stickerUpdate(sticker(), sticker({ name: 'saludo', description: 'Un saludo' }));
  assert.equal(posts[0].author, 'Sticker editado');
  assert.equal(posts[0].fields.Sticker, '`saludo` (`s1`)');
  assert.equal(posts[0].fields.Nombre, 'hola → saludo');
  assert.equal(posts[0].fields['Descripción'], '*(vacío)* → Un saludo');
});

test('sounds: created, edited and deleted; an edit without the previous version is skipped', async () => {
  const sound = (override: Record<string, unknown> = {}) =>
    ({ guild: GUILD, soundId: 'x1', name: 'aplauso', volume: 1, emoji: null, user: { id: '777' }, ...override }) as any;
  const { log, posts } = harness();
  await log.soundCreate(sound());
  await log.soundUpdate(null, sound({ volume: 0.5 }));
  await log.soundUpdate(sound(), sound({ volume: 0.5 }));
  await log.soundDelete(sound());

  assert.deepEqual(posts.map(post => post.author), ['Sonido creado', 'Sonido editado', 'Sonido borrado']);
  // Without an audit-log entry, the creator that Discord lists is the best answer
  assert.equal(posts[0].fields['Creado por'], '<@777>');
  assert.equal(posts[1].fields.Volumen, '100 % → 50 %');
});

test('other servers are ignored by every handler', async () => {
  const { log, posts } = harness();
  await log.roleCreate(role({ guild: OTHER_GUILD }));
  await log.emojiCreate(emoji({ guild: OTHER_GUILD }));
  await log.guildUpdate(guild({ id: 'other', name: 'a' }), guild({ id: 'other', name: 'b' }));
  assert.equal(posts.length, 0);
});
