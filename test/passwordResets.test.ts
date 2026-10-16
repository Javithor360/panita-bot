import { apiError, ok, silenceApiLogs, stubFetch } from './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/lib/api/errors';
import { MAX_CUSTOM_ID_LENGTH, decodeCustomId } from '../src/core/customId';
import { deliverReset, isDmsClosed, type DeliveryTargets, type Recipient } from '../src/features/passwordReset/delivery';
import { attemptReset } from '../src/features/passwordReset/components';
import {
  buildChannelMessage,
  buildDmMessage,
  buildResetModal,
  endMessage,
  RESET_ACTIONS,
  RESET_MESSAGES,
} from '../src/features/passwordReset/view';
import {
  completeReset,
  ignoreReset,
  listPendingResets,
  reportDelivery,
  ResetNotAvailableError,
  ResetNotReadyError,
} from '../src/services/passwordResets';
import { InvalidActivationError, NotActivatedError } from '../src/services/users';

beforeEach(() => silenceApiLogs());
afterEach(() => mock.restoreAll());

const ID = '812345678901234567';
// The longest id a request can plausibly have: a UUID
const REQUEST = '3f1c2b9e-7a44-4d0e-9b57-0c1d2e3f4a5b';

// --- service ---

test('the pending list is read without retries', async () => {
  const pending = [{ id: REQUEST, discord_id: ID, delivery: 'dm' }];
  const calls = stubFetch(ok(pending));

  assert.deepEqual(await listPendingResets(), pending);
  assert.deepEqual(calls.map(c => `${c.method} ${c.path}`), ['GET /v1/discord/password-resets/pending']);

  mock.restoreAll();
  silenceApiLogs();
  const failing = stubFetch(apiError(503, 'unavailable'));
  await assert.rejects(listPendingResets(), (error: unknown) => error instanceof ApiError && error.status === 503);
  assert.equal(failing.length, 1);
});

test('a delivery is reported with its status', async () => {
  const calls = stubFetch(ok({ status: 'dms_closed' }));

  await reportDelivery(REQUEST, 'dms_closed');

  assert.deepEqual(calls, [{ method: 'POST', path: `/v1/discord/password-resets/${REQUEST}/delivery`, body: { status: 'dms_closed' } }]);
});

test('completing sends the member and the password to the request, once', async () => {
  const calls = stubFetch(apiError(503, 'unavailable'));

  await assert.rejects(completeReset(REQUEST, ID, 'secret-pass!'), ApiError);

  assert.equal(calls.length, 1, 'a POST that carries a password is never retried');
  assert.deepEqual(calls[0], {
    method: 'POST',
    path: `/v1/discord/password-resets/${REQUEST}/complete`,
    body: { discord_id: ID, password: 'secret-pass!' },
  });
});

test('completing maps the expected rejections', async () => {
  const cases: Array<[Response, unknown]> = [
    [apiError(410, 'gone', { reason: 'expired' }), ResetNotAvailableError],
    [apiError(404, 'not_found'), ResetNotAvailableError],
    [apiError(409, 'conflict', { reason: 'not_delivered' }), ResetNotReadyError],
    [apiError(409, 'conflict', { reason: 'not_activated' }), NotActivatedError],
    [apiError(400, 'validation_error', { reason: 'length' }), InvalidActivationError],
    [apiError(400, 'validation_error', { reason: 'special' }), InvalidActivationError],
  ];
  for (const [answer, expected] of cases) {
    mock.restoreAll();
    silenceApiLogs();
    stubFetch(answer);
    await assert.rejects(completeReset(REQUEST, ID, 'x'), expected as ErrorConstructor);
  }
});

test('completing lets other failures through for the router to report', async () => {
  stubFetch(apiError(400, 'validation_error', { reason: 'something_else' }));
  await assert.rejects(completeReset(REQUEST, ID, 'x'), (error: unknown) => error instanceof ApiError && error.status === 400);
});

test('ignoring posts the member and maps a gone request', async () => {
  const calls = stubFetch(ok({ status: 'ignored' }));
  await ignoreReset(REQUEST, ID);
  assert.deepEqual(calls, [{ method: 'POST', path: `/v1/discord/password-resets/${REQUEST}/ignore`, body: { discord_id: ID } }]);

  mock.restoreAll();
  silenceApiLogs();
  stubFetch(apiError(410, 'gone', { reason: 'resolved' }));
  await assert.rejects(ignoreReset(REQUEST, ID), ResetNotAvailableError);
});

test('attemptReset turns every expected answer into an attempt', async () => {
  stubFetch(ok({ status: 'completed' }));
  assert.equal(await attemptReset(REQUEST, ID, 'secret-pass!'), 'completed');

  const cases: Array<[Response, string]> = [
    [apiError(410, 'gone'), 'unavailable'],
    [apiError(409, 'conflict', { reason: 'not_delivered' }), 'not_ready'],
    [apiError(409, 'conflict', { reason: 'not_activated' }), 'not_activated'],
    [apiError(400, 'validation_error', { reason: 'length' }), 'length'],
    [apiError(400, 'validation_error', { reason: 'special' }), 'special'],
  ];
  for (const [answer, attempt] of cases) {
    mock.restoreAll();
    silenceApiLogs();
    stubFetch(answer);
    assert.equal(await attemptReset(REQUEST, ID, 'x'), attempt);
  }

  mock.restoreAll();
  silenceApiLogs();
  stubFetch(apiError(503, 'unavailable'));
  await assert.rejects(attemptReset(REQUEST, ID, 'x'), (error: unknown) => error instanceof ApiError && error.transient);
});

// --- messages and components ---

test('the DM names what to press and where to check sessions, and has two owned buttons', () => {
  const message = buildDmMessage(REQUEST, ID);

  assert.match(message.content, /Solicitud para restablecer tu contraseña/);
  assert.match(message.content, /10 minutos/);
  assert.match(message.content, /`\/sessions`/);

  const buttons = message.components[0].toJSON().components as Array<{ label: string; custom_id: string }>;
  assert.deepEqual(buttons.map(b => b.label), ['Restablecer', 'Ignorar']);
  for (const { custom_id } of buttons) {
    assert.ok(custom_id.length <= MAX_CUSTOM_ID_LENGTH, `${custom_id.length} characters`);
    assert.equal(decodeCustomId(custom_id)?.namespace, 'register');
    assert.equal(decodeCustomId(custom_id)?.owner, ID, 'only the member may press it');
    assert.deepEqual(decodeCustomId(custom_id)?.args, [REQUEST]);
  }
  assert.deepEqual(
    buttons.map(b => decodeCustomId(b.custom_id)?.action),
    [RESET_ACTIONS.reset, RESET_ACTIONS.ignore],
  );
});

test('the channel message pings only the member and says nothing secret', () => {
  const message = buildChannelMessage(REQUEST, ID);

  assert.match(message.content, new RegExp(`<@${ID}>`));
  assert.deepEqual(message.allowedMentions, { users: [ID] });
  assert.doesNotMatch(message.content, /contraseña es|nueva contraseña/i);
  assert.equal(message.components.length, 1);
});

test('the form has one password field, titled and labelled as plain text', () => {
  const form = buildResetModal(REQUEST, ID).toJSON();

  assert.equal(form.title, RESET_MESSAGES.modalTitle);
  assert.equal(form.components.length, 1, 'no repeat field');
  const input = (form.components[0] as { components: Array<{ custom_id: string; label: string; min_length: number; max_length: number }> }).components[0];
  assert.equal(input.custom_id, 'input_password');
  assert.match(input.label, /se ve al escribir/);
  assert.ok(input.label.length <= 45, 'Discord allows 45 characters in a label');
  assert.deepEqual([input.min_length, input.max_length], [6, 32]);
  assert.ok(form.custom_id.length <= MAX_CUSTOM_ID_LENGTH);
  assert.equal(decodeCustomId(form.custom_id)?.action, RESET_ACTIONS.submit);
  assert.equal(decodeCustomId(form.custom_id)?.owner, ID);
});

test('a used request message is neutral in the channel and explicit in the DM', () => {
  assert.equal(endMessage('channel', 'completed'), 'Solicitud atendida.');
  assert.equal(endMessage('dm', 'completed'), RESET_MESSAGES.completed);
  assert.match(endMessage('dm', 'completed'), /`\/sessions`/);
  for (const end of ['completed', 'ignored', 'unavailable'] as const) {
    assert.doesNotMatch(endMessage('channel', end), /<@|contraseña/);
  }
});

// --- delivery ---

const dmsClosed = Object.assign(new Error('Cannot send messages to this user'), { code: 50007 });

const targets = (overrides: Partial<{ user: Recipient; channel: Recipient | null }> = {}) => {
  const sent: string[] = [];
  const recipient = (name: string): Recipient => ({ send: async message => void sent.push(`${name}:${message.content.includes(`<@${ID}>`) ? 'mention' : 'plain'}`) });
  const value: DeliveryTargets = {
    fetchUser: async () => overrides.user ?? recipient('dm'),
    fetchChannel: async () => (overrides.channel === undefined ? recipient('channel') : overrides.channel),
  };
  return { value, sent };
};

test('a DM that goes through is delivered', async () => {
  const { value, sent } = targets();

  assert.equal(await deliverReset({ id: REQUEST, discord_id: ID, delivery: 'dm' }, value), 'delivered');
  assert.deepEqual(sent, ['dm:plain']);
});

test('closed DMs are reported as such, not as a failure', async () => {
  const { value } = targets({ user: { send: async () => { throw dmsClosed; } } });

  assert.equal(await deliverReset({ id: REQUEST, discord_id: ID, delivery: 'dm' }, value), 'dms_closed');
  assert.equal(isDmsClosed(dmsClosed), true);
  assert.equal(isDmsClosed(new Error('boom')), false);
  assert.equal(isDmsClosed(null), false);
});

test('any other DM failure is thrown, so the poller can try again', async () => {
  const boom = new Error('boom');
  const { value } = targets({ user: { send: async () => { throw boom; } } });

  await assert.rejects(deliverReset({ id: REQUEST, discord_id: ID, delivery: 'dm' }, value), boom);
});

test('the channel gets the public message', async () => {
  const { value, sent } = targets();

  assert.equal(await deliverReset({ id: REQUEST, discord_id: ID, delivery: 'channel' }, value), 'delivered');
  assert.deepEqual(sent, ['channel:mention']);
});

test('a channel that is missing or refuses is a final failure', async () => {
  const errors: unknown[] = [];
  const logger = { error: (...args: unknown[]) => void errors.push(args) };

  const missing = targets({ channel: null });
  assert.equal(await deliverReset({ id: REQUEST, discord_id: ID, delivery: 'channel' }, missing.value, logger), 'failed');

  const refusing = targets({ channel: { send: async () => { throw new Error('Missing Access'); } } });
  assert.equal(await deliverReset({ id: REQUEST, discord_id: ID, delivery: 'channel' }, refusing.value, logger), 'failed');
  assert.equal(errors.length, 1, 'the refusal is logged');
});
