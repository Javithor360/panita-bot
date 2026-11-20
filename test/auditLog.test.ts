import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLogEvent, Collection, type Guild } from 'discord.js';
import { createAuditLog, type AuditAction } from '../src/features/auditLog/handlers';
import { createBotActions } from '../src/features/moderation/recent';

const NOW = 1_700_000_000_000;
const GUILD = { id: 'home', memberCount: 42 } as unknown as Guild;
const OTHER_GUILD = { id: 'other', memberCount: 1 } as unknown as Guild;

const user = (id = '111', extra: Record<string, unknown> = {}) => ({
  id,
  username: 'ana',
  bot: false,
  createdAt: new Date(NOW - 86_400_000),
  displayAvatarURL: () => 'https://cdn.example/a.png',
  ...extra,
});

const harness = (audit: Partial<Record<AuditLogEvent, AuditAction>> = {}) => {
  const posts: Array<{ author?: string; fields: Record<string, string> }> = [];
  const botActions = createBotActions(60_000, () => NOW);
  const lookups: AuditLogEvent[] = [];

  const log = createAuditLog({
    post: async entry => {
      for (const embed of entry.embeds) {
        const json = embed.toJSON();
        posts.push({
          author: json.author?.name,
          fields: Object.fromEntries((json.fields ?? []).map(field => [field.name, field.value])),
        });
      }
    },
    modlogChannelId: 'log',
    isHomeGuild: guild => guild.id === 'home',
    botActions,
    findAction: async (_guild, type) => {
      lookups.push(type);
      return audit[type] ?? null;
    },
    sleep: async () => {},
    now: () => NOW,
  });
  return { log, posts, botActions, lookups };
};

const message = (override: Record<string, unknown> = {}) => ({
  guild: GUILD,
  channelId: 'general',
  author: user(),
  webhookId: null,
  content: 'hola a todos',
  attachments: new Collection<string, { name: string }>(),
  createdAt: new Date(NOW - 60_000),
  editedTimestamp: null,
  url: 'https://discord.com/channels/home/general/1',
  ...override,
}) as any;

test('a deleted message is logged with its author, channel and text', async () => {
  const { log, posts } = harness();
  await log.messageDelete(message({ attachments: new Collection([['1', { name: 'foto.png' }]]) }));

  assert.equal(posts.length, 1);
  assert.match(posts[0].author!, /^Mensaje borrado · ana$/);
  assert.equal(posts[0].fields.Autor, '<@111> (`111`)');
  assert.equal(posts[0].fields.Canal, '<#general>');
  assert.match(posts[0].fields.Contenido, /hola a todos/);
  assert.equal(posts[0].fields.Adjuntos, '`foto.png`');
});

test('a deleted message the bot never saw is logged without text, and the code block cannot be closed from inside', async () => {
  const { log, posts } = harness();
  await log.messageDelete(message({ author: null, content: null }));
  assert.equal(posts[0].fields.Autor, 'Desconocido');
  assert.match(posts[0].fields.Contenido, /contenido no disponible/);

  await log.messageDelete(message({ content: 'a ``` b' }));
  assert.equal(posts[1].fields.Contenido.match(/```/g)?.length, 2);
});

test('bots, webhooks, the log channel, other servers and bot commands are not logged', async () => {
  const { log, posts } = harness();
  await log.messageDelete(message({ author: user('9', { bot: true }) }));
  await log.messageDelete(message({ webhookId: '5' }));
  await log.messageDelete(message({ channelId: 'log' }));
  await log.messageDelete(message({ guild: OTHER_GUILD }));
  await log.messageDelete(message({ guild: null }));
  await log.messageDelete(message({ content: '!clear 10' }));
  assert.equal(posts.length, 0);
});

test('an edit is logged with before and after', async () => {
  const { log, posts } = harness();
  await log.messageUpdate(message({ content: 'antes' }), message({ content: 'después' }));

  assert.equal(posts.length, 1);
  assert.match(posts[0].author!, /^Mensaje editado/);
  assert.match(posts[0].fields.Antes, /antes/);
  assert.match(posts[0].fields.Después, /después/);
  assert.match(posts[0].fields.Canal, /ir al mensaje/);
});

test('an update that did not change the text is not an edit', async () => {
  const { log, posts } = harness();
  await log.messageUpdate(message({ content: 'igual' }), message({ content: 'igual' }));
  await log.messageUpdate(message({ content: 'a', author: user('9', { bot: true }) }), message({ content: 'b', author: user('9', { bot: true }) }));
  assert.equal(posts.length, 0);
});

test('an old message the bot never saw is logged only when Discord stamped the edit just now', async () => {
  const { log, posts } = harness();
  // A link preview updates the message without editing it
  await log.messageUpdate(message({ content: null }), message({ content: 'con preview', editedTimestamp: null }));
  assert.equal(posts.length, 0);

  await log.messageUpdate(message({ content: null }), message({ content: 'editado ahora', editedTimestamp: NOW - 1000 }));
  assert.equal(posts.length, 1);
  assert.match(posts[0].fields.Antes, /contenido no disponible/);

  await log.messageUpdate(message({ content: null }), message({ content: 'editado hace rato', editedTimestamp: NOW - 60_000 }));
  assert.equal(posts.length, 1);
});

test('a bulk delete is logged with its count, unless /clear just did it and logs it itself', async () => {
  const { log, posts, botActions } = harness();
  const messages = new Collection<string, any>([['1', {}], ['2', {}], ['3', {}]]);

  await log.messageDeleteBulk(messages, { id: 'general', guild: GUILD });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].author, '3 mensajes borrados');

  botActions.mark('clear', 'general');
  await log.messageDeleteBulk(messages, { id: 'general', guild: GUILD });
  await log.messageDeleteBulk(messages, { id: 'log', guild: GUILD });
  await log.messageDeleteBulk(messages, { id: 'general', guild: OTHER_GUILD });
  assert.equal(posts.length, 1);
});

test('a new member is logged with the age of the account', async () => {
  const { log, posts } = harness();
  await log.memberAdd({ guild: GUILD, user: user() } as any);
  await log.memberAdd({ guild: OTHER_GUILD, user: user() } as any);

  assert.equal(posts.length, 1);
  assert.match(posts[0].author!, /^Miembro nuevo/);
  assert.match(posts[0].fields['Cuenta creada'], /^<t:\d+:R>$/);
});

const leaving = (id = '111') => ({
  id,
  guild: GUILD,
  user: user(id),
  joinedAt: new Date(NOW - 3_600_000),
  roles: { cache: new Collection<string, { id: string }>([['home', { id: 'home' }], ['r1', { id: 'r1' }]]) },
}) as any;

test('a member who leaves is logged with their roles, without @everyone', async () => {
  const { log, posts } = harness();
  await log.memberRemove(leaving());

  assert.equal(posts.length, 1);
  assert.match(posts[0].author!, /^Miembro salió/);
  assert.equal(posts[0].fields.Roles, '<@&r1>');
});

test('a member removed by the bot is not logged again', async () => {
  const { log, posts, botActions } = harness();
  botActions.mark('kick', '111');
  botActions.mark('ban', '222');
  await log.memberRemove(leaving('111'));
  await log.memberRemove(leaving('222'));
  assert.equal(posts.length, 0);
});

test('a kick done by hand is logged as a kick with who did it', async () => {
  const { log, posts } = harness({ [AuditLogEvent.MemberKick]: { executorId: '999', reason: 'Spam' } });
  await log.memberRemove(leaving());

  assert.equal(posts.length, 1);
  assert.match(posts[0].author!, /^Expulsión/);
  assert.equal(posts[0].fields.Moderador, '<@999>');
  assert.equal(posts[0].fields.Razón, 'Spam');
});

test('the departure that comes with a ban is left to the ban', async () => {
  const { log, posts } = harness({ [AuditLogEvent.MemberBanAdd]: { executorId: '999', reason: null } });
  await log.memberRemove(leaving());
  assert.equal(posts.length, 0);
});

test('a ban done by hand is logged with who did it and the reason Discord holds', async () => {
  const { log, posts } = harness({ [AuditLogEvent.MemberBanAdd]: { executorId: '999', reason: 'Raid' } });
  await log.banAdd({ guild: GUILD, user: user(), reason: null } as any);

  assert.equal(posts.length, 1);
  assert.match(posts[0].author!, /^Baneo/);
  assert.equal(posts[0].fields.Moderador, '<@999>');
  assert.equal(posts[0].fields.Razón, 'Raid');
});

test('a ban the bot did is not logged again, and without the audit log the moderator is unknown', async () => {
  const { log, posts, botActions } = harness();
  botActions.mark('ban', '111');
  await log.banAdd({ guild: GUILD, user: user('111'), reason: 'x' } as any);
  assert.equal(posts.length, 0);

  await log.banAdd({ guild: GUILD, user: user('222'), reason: 'Spam' } as any);
  assert.equal(posts[0].fields.Moderador, 'No se pudo saber');
  assert.equal(posts[0].fields.Razón, 'Spam');
});

test('an unban is logged unless the bot did it', async () => {
  const { log, posts, botActions } = harness({ [AuditLogEvent.MemberBanRemove]: { executorId: '999', reason: null } });
  await log.banRemove({ guild: GUILD, user: user('111') } as any);
  assert.match(posts[0].author!, /^Baneo quitado/);
  assert.equal(posts[0].fields.Moderador, '<@999>');

  botActions.mark('unban', '222');
  await log.banRemove({ guild: GUILD, user: user('222') } as any);
  assert.equal(posts.length, 1);
});

const timed = (until: number | null, extra: Record<string, unknown> = {}) =>
  ({ id: '111', guild: GUILD, user: user(), partial: false, communicationDisabledUntilTimestamp: until, ...extra }) as any;

test('a timeout set by hand is logged with its end and who set it', async () => {
  const { log, posts } = harness({ [AuditLogEvent.MemberUpdate]: { executorId: '999', reason: 'Calma' } });
  await log.memberUpdate(timed(null), timed(NOW + 600_000));

  assert.equal(posts.length, 1);
  assert.match(posts[0].author!, /^Silencio · ana$/);
  assert.equal(posts[0].fields.Moderador, '<@999>');
  assert.match(posts[0].fields.Termina, /^<t:\d+:R>$/);
});

test('a timeout lifted by hand is logged', async () => {
  const { log, posts } = harness();
  await log.memberUpdate(timed(NOW + 600_000), timed(null));
  assert.match(posts[0].author!, /^Silencio quitado/);
});

test('timeouts the bot applied, unchanged ones, ones that ended by themselves and partial members are not logged', async () => {
  const { log, posts, botActions } = harness();
  await log.memberUpdate(timed(null), timed(null));
  await log.memberUpdate(timed(NOW - 1000), timed(null));
  await log.memberUpdate(timed(null, { partial: true }), timed(NOW + 600_000));
  await log.memberUpdate(timed(null), timed(NOW + 600_000, { user: user('111', { bot: true }) }));
  botActions.mark('timeout', '111');
  await log.memberUpdate(timed(null), timed(NOW + 600_000));
  assert.equal(posts.length, 0);
});

test('nothing is looked up in the audit log for events that are not logged', async () => {
  const { log, lookups, botActions } = harness();
  botActions.mark('kick', '111');
  await log.memberRemove(leaving('111'));
  assert.deepEqual(lookups, []);
});
