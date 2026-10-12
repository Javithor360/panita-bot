import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeCustomId } from '../src/core/customId';
import {
  buildSessionsView,
  CLOSE_ALL_ACTION,
  CLOSE_ONE_ACTION,
  describeSession,
  SESSION_MESSAGES,
  SESSIONS_NAMESPACE,
} from '../src/features/login/sessionsView';
import type { BotSession } from '../src/services/sessions';

const OWNER = '812345678901234567';

const session = (overrides: Partial<BotSession> = {}): BotSession => ({
  id: '7d1f4c2a-5b3e-4a86-9c10-2f8e6b3d9a41',
  client: 'web',
  label: 'Web',
  created_at: '2026-10-11T15:00:00.000Z',
  last_used_at: '2026-10-11T16:20:00.000Z',
  expires_at: '2026-11-10T15:00:00.000Z',
  ...overrides,
});

test('a web session shows when it ends and a launcher session says it never does', () => {
  const web = describeSession(session());
  const launcher = describeSession(session({ label: 'Launcher', client: 'launcher', expires_at: null }));

  assert.match(web, /^\*\*Web\*\* · creada <t:\d+:R> · último uso <t:\d+:R> · vence <t:\d+:R>$/);
  assert.match(launcher, /^\*\*Launcher\*\* · creada .* · sin vencimiento$/);
  assert.doesNotMatch(launcher, /vence/);
});

test('an empty list says so and offers nothing to close', () => {
  const view = buildSessionsView([], OWNER);

  assert.equal(view.content, SESSION_MESSAGES.none);
  assert.deepEqual(view.embeds, []);
  assert.deepEqual(view.components, []);
});

test('an empty list after an action keeps the note', () => {
  assert.equal(buildSessionsView([], OWNER, 'Cerraste 2 sesiones.').content, 'Cerraste 2 sesiones.\nNo tienes sesiones abiertas.');
});

test('the list has one line per session and a menu with one option each', () => {
  const sessions = [session(), session({ id: '11111111-2222-4333-8444-555555555555', label: 'Launcher', client: 'launcher', expires_at: null })];
  const view = buildSessionsView(sessions, OWNER);

  assert.equal(view.embeds[0].description?.split('\n').length, 2);
  assert.equal(view.embeds[0].title, 'Tus sesiones abiertas (2)');

  const [menuRow, buttonRow] = view.components.map(row => row.toJSON());
  const menu = menuRow.components[0] as unknown as { options: Array<{ label: string; value: string; description: string }>; placeholder: string };
  assert.equal(menu.placeholder, 'Cerrar esta sesión…');
  assert.deepEqual(menu.options.map(o => o.value), sessions.map(s => s.id));
  assert.deepEqual(menu.options.map(o => o.label), ['1. Web', '2. Launcher']);
  assert.match(menu.options[0].description, /^Creada 2026-10-11 15:00 UTC · último uso 2026-10-11 16:20 UTC$/);
  assert.equal((buttonRow.components[0] as { label: string }).label, 'Cerrar todas');
});

test('the controls belong to the member who ran the command', () => {
  const view = buildSessionsView([session()], OWNER);
  const ids = view.components
    .map(row => (row.toJSON().components[0] as unknown as { custom_id: string }).custom_id)
    .map(id => decodeCustomId(id));

  assert.deepEqual(ids, [
    { namespace: SESSIONS_NAMESPACE, action: CLOSE_ONE_ACTION, args: [], owner: OWNER },
    { namespace: SESSIONS_NAMESPACE, action: CLOSE_ALL_ACTION, args: [], owner: OWNER },
  ]);
});

test('the menu fits the 20 sessions the API can return', () => {
  const sessions = Array.from({ length: 20 }, (_, i) => session({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }));
  const menu = buildSessionsView(sessions, OWNER).components[0].toJSON().components[0] as unknown as { options: unknown[] };

  assert.equal(menu.options.length, 20);
});

test('the texts say what was closed', () => {
  assert.equal(SESSION_MESSAGES.closed('Web'), 'Cerraste la sesión **Web**.');
  assert.equal(SESSION_MESSAGES.closedAll(1), 'Cerraste 1 sesión.');
  assert.equal(SESSION_MESSAGES.closedAll(3), 'Cerraste 3 sesiones.');
});
