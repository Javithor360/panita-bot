import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMOJIS } from '../src/config/constants';
import { sanctionFor } from '../src/features/moderation/autoSanction';
import {
  caseEmbed,
  clearEmbed,
  clip,
  confirmation,
  denialMessage,
  dmEmbed,
  dmsTheMember,
  warningLine,
  type CaseAction,
  type Denial,
} from '../src/features/moderation/messages';
import { createBotActions } from '../src/features/moderation/recent';
import { formatDuration } from '../src/lib/format';
import type { Warning } from '../src/lib/api/types';

const fieldNames = (json: { fields?: Array<{ name: string }> }) => (json.fields ?? []).map(field => field.name);
const field = (json: { fields?: Array<{ name: string; value: string }> }, name: string) => json.fields?.find(f => f.name === name)?.value;

test('a case is headed [ACTION] name with the target, the moderator and the reason', () => {
  const json = caseEmbed({
    action: 'kick',
    subject: { id: '111', name: 'Ana', avatarUrl: 'https://cdn.example/a.png' },
    moderatorId: '222',
    reason: 'Spam',
  }).toJSON();

  assert.equal(json.author?.name, '[KICK] Ana');
  assert.equal(json.author?.icon_url, 'https://cdn.example/a.png');
  assert.deepEqual(fieldNames(json), ['Usuario', 'Moderador', 'Razón']);
  assert.equal(field(json, 'Usuario'), '<@111> (`111`)');
  assert.equal(field(json, 'Moderador'), '<@222>');
  assert.equal(field(json, 'Razón'), 'Spam');
});

test('a case without a reason says so, and the extra fields come before the reason', () => {
  const json = caseEmbed({
    action: 'mute',
    subject: { id: '1', name: 'Ana' },
    moderatorId: '2',
    extra: [{ name: 'Duración', value: '1h', inline: true }],
    footer: 'Advertencias activas: 2/5',
  }).toJSON();

  assert.deepEqual(fieldNames(json), ['Usuario', 'Moderador', 'Duración', 'Razón']);
  assert.equal(field(json, 'Razón'), 'Sin razón');
  assert.equal(json.footer?.text, 'Advertencias activas: 2/5');
  assert.equal(json.author?.icon_url, undefined);
});

test('a long reason or name is cut so Discord accepts the embed', () => {
  const json = caseEmbed({ action: 'ban', subject: { id: '1', name: 'x'.repeat(500) }, moderatorId: '2', reason: 'y'.repeat(5000) }).toJSON();
  assert.ok((json.author?.name.length ?? 0) <= 100);
  assert.ok((field(json, 'Razón')?.length ?? 0) <= 1024);
  assert.equal(clip('abc', 3), 'abc');
  assert.equal(clip('abcd', 3), 'ab…');
});

test('every action has a style, and only the sanctions that matter are sent by DM', () => {
  const actions: CaseAction[] = ['kick', 'ban', 'unban', 'mute', 'unmute', 'hide', 'unhide', 'warn', 'unwarn', 'clear'];
  for (const action of actions) {
    assert.match(caseEmbed({ action, subject: { id: '1', name: 'a' }, moderatorId: '2' }).toJSON().author!.name, /^\[[A-Z]+\] a$/);
  }
  assert.deepEqual(actions.filter(dmsTheMember), ['kick', 'ban', 'mute', 'warn']);
});

test('the DM of a warning shows the counter and what the warnings lead to', () => {
  const json = dmEmbed({ action: 'warn', guildName: 'Panitacraft', moderatorName: 'mod#0', reason: 'Spam', warnCount: 2 }).toJSON();
  assert.equal(json.author?.name, '¡Fuiste advertido!');
  assert.equal(json.footer?.text, 'Contador de advertencias: 2/5');
  assert.match(json.description ?? '', /3 advertencias/);
  assert.match(json.description ?? '', /5 serás expulsado/);
  assert.deepEqual(fieldNames(json), ['Servidor', 'Moderador', 'Razón']);
});

test('the DM of a mute shows how long it lasts', () => {
  const json = dmEmbed({ action: 'mute', guildName: 'P', moderatorName: 'm', durationMs: 3_600_000 }).toJSON();
  assert.equal(field(json, 'Duración'), `\`${formatDuration(3_600_000)}\``);
  assert.equal(field(json, 'Razón'), 'Sin razón');
});

test('the confirmation opens with the emoji of the action, bolds the name and escapes its markdown', () => {
  assert.equal(confirmation('kick', 'Ana', () => 0), `${EMOJIS.offline} **Ana** fue expulsado del servidor.`);
  assert.equal(confirmation('unban', 'Ana', () => 0).startsWith(EMOJIS.online), true);
  assert.equal(confirmation('mute', 'a*b_c', () => 0), `${EMOJIS.idle} **a\\*b\\_c** fue silenciado.`);
  assert.notEqual(confirmation('kick', 'Ana', () => 0), confirmation('kick', 'Ana', () => 0.99));
});

test('every refusal starts with the cross', () => {
  const reasons: Denial[] = [
    'self', 'bot', 'owner', 'staff', 'hierarchyModerator', 'hierarchyBot',
    'notInServer', 'notBanned', 'notMuted', 'notHidden', 'alreadyHidden', 'noWarns', 'noPermission',
  ];
  for (const reason of reasons) assert.equal(denialMessage(reason, () => 0).startsWith(`${EMOJIS.cross} `), true, reason);
});

test('the embed of a clear counts the messages and names the channel and the author when filtered', () => {
  const one = clearEmbed({ moderatorId: '2', channelId: '3', deleted: 1 }).toJSON();
  assert.equal(one.author?.name, '[CLEAR] 1 mensaje');
  assert.equal(field(one, 'Canal'), '<#3>');
  assert.equal(field(one, 'Mensajes de'), undefined);

  const many = clearEmbed({ moderatorId: '2', channelId: '3', deleted: 40, authorId: '9' }).toJSON();
  assert.equal(many.author?.name, '[CLEAR] 40 mensajes');
  assert.equal(field(many, 'Mensajes de'), '<@9>');
});

const warning = (override: Partial<Warning> = {}): Warning => ({
  id: 'w1',
  user_id: '1',
  moderator_id: '22',
  reason: 'Spam en #general',
  created_at: '2026-11-19T18:30:00.000Z',
  revoked_at: null,
  revoked_by: null,
  revoke_reason: null,
  ...override,
});

test('an active warning is numbered and a revoked one is struck through', () => {
  const active = warningLine(warning(), 2);
  assert.match(active, /^\*\*2\.\*\* Spam en #general · <@22> <t:\d+:R>$/);

  const revoked = warningLine(warning({ revoked_at: '2026-11-20T00:00:00.000Z' }), null);
  assert.match(revoked, /^~~Spam en #general~~ · <@22> <t:\d+:R> · quitada$/);
});

test('the text of a warning cannot break the list: markdown is escaped and long reasons are cut', () => {
  assert.match(warningLine(warning({ reason: '**hola**' }), 1), /\\\*\\\*hola\\\*\\\*/);
  assert.ok(warningLine(warning({ reason: 'x'.repeat(1000) }), 1).length < 250);
});

test('warnings earn a timeout at the 3rd and a kick at the 5th, and nothing in between', () => {
  assert.equal(sanctionFor(1), null);
  assert.equal(sanctionFor(2), null);
  assert.deepEqual(sanctionFor(3), { kind: 'timeout', ms: 3_600_000 });
  assert.equal(sanctionFor(4), null);
  assert.deepEqual(sanctionFor(5), { kind: 'kick' });
  assert.equal(sanctionFor(6), null);
  assert.equal(sanctionFor(0), null);
});

test('the bot remembers what it did for a while, per kind and per id', () => {
  let now = 0;
  const actions = createBotActions(1000, () => now);

  actions.mark('ban', '1');
  assert.equal(actions.has('ban', '1'), true);
  assert.equal(actions.has('ban', '2'), false);
  assert.equal(actions.has('kick', '1'), false);

  now = 999;
  assert.equal(actions.has('ban', '1'), true);
  now = 1000;
  assert.equal(actions.has('ban', '1'), false);
});
