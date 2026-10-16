import { apiError, ok, silenceApiLogs, stubFetch } from './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { passwordResetComponents } from '../src/features/passwordReset/components';
import { PASSWORD_RULE_MESSAGES } from '../src/lib/registration';
import { RESET_MESSAGES } from '../src/features/passwordReset/view';
import registerCommand from '../src/commands/general/register';

beforeEach(() => silenceApiLogs());
afterEach(() => mock.restoreAll());

const ID = '812345678901234567';
const REQUEST = '3f1c2b9e-7a44-4d0e-9b57-0c1d2e3f4a5b';

/** A fake interaction that records, in order, what the handler answered. */
const fakeInteraction = ({ inGuild, password = 'secret-pass!' }: { inGuild: boolean; password?: string }) => {
  const log: Array<[string, unknown]> = [];
  const record = (name: string) => async (arg?: unknown) => void log.push([name, arg]);
  const interaction = {
    user: { id: ID },
    inGuild: () => inGuild,
    fields: { getTextInputValue: () => password },
    message: { edit: async (arg: unknown) => void log.push(['message.edit', arg]) },
    reply: record('reply'),
    showModal: record('showModal'),
    deferUpdate: record('deferUpdate'),
    deferReply: record('deferReply'),
    editReply: record('editReply'),
    followUp: record('followUp'),
  };
  return { interaction: interaction as never, log, names: () => log.map(([name]) => name) };
};

const submit = passwordResetComponents.resetsubmit;
const ignore = passwordResetComponents.resetignore;
const open = passwordResetComponents.reset;

test('the reset components are part of /register, which is their namespace', () => {
  for (const action of ['reset', 'resetsubmit', 'resetignore']) {
    assert.ok(registerCommand.components[action], action);
  }
  // The ones /register already had are still there
  for (const action of ['status', 'use', 'other', 'password', 'submit', 'pwsubmit']) {
    assert.ok(registerCommand.components[action], action);
  }
});

test('"Restablecer" opens the form straight away, without asking the API', async () => {
  const calls = stubFetch(ok({}));
  const { interaction, names } = fakeInteraction({ inGuild: false });

  await open.run(interaction as never, [REQUEST]);

  assert.deepEqual(names(), ['showModal']);
  assert.equal(calls.length, 0);
});

test('in a DM a good password edits the request message and removes the buttons', async () => {
  const calls = stubFetch(ok({ status: 'completed' }));
  const { interaction, log, names } = fakeInteraction({ inGuild: false });

  await submit.run(interaction as never, [REQUEST]);

  assert.deepEqual(names(), ['deferUpdate', 'editReply']);
  assert.deepEqual(log[1][1], { content: RESET_MESSAGES.completed, components: [] });
  assert.deepEqual(calls[0].body, { discord_id: ID, password: 'secret-pass!' });
});

test('in the channel a good password is answered privately and the public message goes neutral', async () => {
  stubFetch(ok({ status: 'completed' }));
  const { interaction, log, names } = fakeInteraction({ inGuild: true });

  await submit.run(interaction as never, [REQUEST]);

  assert.deepEqual(names(), ['deferReply', 'message.edit', 'editReply']);
  assert.deepEqual(log[0][1], { flags: 64 }, 'the acknowledgement is ephemeral');
  assert.deepEqual(log[1][1], { content: 'Solicitud atendida.', components: [] });
  assert.deepEqual(log[2][1], { content: RESET_MESSAGES.completed });
});

test('a password the API refuses keeps the request open and says why, privately', async () => {
  stubFetch(apiError(400, 'validation_error', { reason: 'special' }));
  const channel = fakeInteraction({ inGuild: true });
  await submit.run(channel.interaction as never, [REQUEST]);

  assert.deepEqual(channel.names(), ['deferReply', 'editReply'], 'the public message is untouched');
  assert.deepEqual(channel.log[1][1], { content: PASSWORD_RULE_MESSAGES.special });

  mock.restoreAll();
  silenceApiLogs();
  stubFetch(apiError(400, 'validation_error', { reason: 'length' }));
  const dm = fakeInteraction({ inGuild: false });
  await submit.run(dm.interaction as never, [REQUEST]);

  assert.deepEqual(dm.names(), ['deferUpdate', 'followUp'], 'the buttons stay on the request message');
  assert.deepEqual(dm.log[1][1], { content: PASSWORD_RULE_MESSAGES.length });
});

test('an expired request closes the message in both places', async () => {
  stubFetch(apiError(410, 'gone', { reason: 'expired' }));
  const dm = fakeInteraction({ inGuild: false });
  await submit.run(dm.interaction as never, [REQUEST]);
  assert.deepEqual(dm.log[1][1], { content: RESET_MESSAGES.unavailable, components: [] });

  mock.restoreAll();
  silenceApiLogs();
  stubFetch(apiError(410, 'gone', { reason: 'expired' }));
  const channel = fakeInteraction({ inGuild: true });
  await submit.run(channel.interaction as never, [REQUEST]);
  assert.deepEqual(channel.names(), ['deferReply', 'message.edit', 'editReply']);
  assert.deepEqual(channel.log[1][1], { content: 'Esta solicitud ya no está disponible.', components: [] });
  assert.deepEqual(channel.log[2][1], { content: RESET_MESSAGES.unavailable });
});

test('the password never reaches a reply or an edit', async () => {
  stubFetch(ok({ status: 'completed' }));
  const channel = fakeInteraction({ inGuild: true, password: 'hunter2-top-secret!' });
  await submit.run(channel.interaction as never, [REQUEST]);

  assert.doesNotMatch(JSON.stringify(channel.log), /hunter2/);
});

test('an API outage is thrown for the router to report, and the request stays open', async () => {
  stubFetch(apiError(503, 'unavailable'));
  const { interaction, names } = fakeInteraction({ inGuild: false });

  await assert.rejects(submit.run(interaction as never, [REQUEST]));

  assert.deepEqual(names(), ['deferUpdate'], 'nothing was edited away');
});

test('"Ignorar" cancels and edits the message without buttons', async () => {
  const calls = stubFetch(ok({ status: 'ignored' }));
  const dm = fakeInteraction({ inGuild: false });
  await ignore.run(dm.interaction as never, [REQUEST]);

  assert.deepEqual(dm.names(), ['deferUpdate', 'editReply']);
  assert.deepEqual(dm.log[1][1], { content: RESET_MESSAGES.ignored, components: [] });
  assert.deepEqual(calls[0].body, { discord_id: ID });

  mock.restoreAll();
  silenceApiLogs();
  stubFetch(ok({ status: 'ignored' }));
  const channel = fakeInteraction({ inGuild: true });
  await ignore.run(channel.interaction as never, [REQUEST]);
  assert.deepEqual(channel.log[1][1], { content: 'Solicitud cancelada.', components: [] });
});

test('"Ignorar" on a request that is gone still removes the buttons', async () => {
  stubFetch(apiError(410, 'gone', { reason: 'resolved' }));
  const { interaction, log } = fakeInteraction({ inGuild: false });

  await ignore.run(interaction as never, [REQUEST]);

  assert.deepEqual(log[1][1], { content: RESET_MESSAGES.unavailable, components: [] });
});

test('a component without a request id answers that it is no longer available', async () => {
  const { interaction, names } = fakeInteraction({ inGuild: false });
  for (const handler of [open, ignore, submit]) await handler.run(interaction as never, []);

  assert.deepEqual(names(), ['reply', 'reply', 'reply']);
});

test('a request not recorded as delivered yet asks to press again, keeping the buttons', async () => {
  stubFetch(apiError(409, 'conflict', { reason: 'not_delivered' }));
  const submitted = fakeInteraction({ inGuild: false });
  await submit.run(submitted.interaction as never, [REQUEST]);
  assert.deepEqual(submitted.names(), ['deferUpdate', 'followUp']);
  assert.deepEqual(submitted.log[1][1], { content: RESET_MESSAGES.notReady });

  mock.restoreAll();
  silenceApiLogs();
  stubFetch(apiError(409, 'conflict', { reason: 'not_delivered' }));
  const ignored = fakeInteraction({ inGuild: false });
  await ignore.run(ignored.interaction as never, [REQUEST]);
  assert.deepEqual(ignored.names(), ['deferUpdate', 'followUp'], 'the message is not edited away');
});
