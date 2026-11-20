import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EmbedBuilder } from 'discord.js';
import { createModlog } from '../src/features/moderation/modlog';

const entry = () => ({ embeds: [new EmbedBuilder().setDescription('x')] });

const harness = (options: { channelId?: string; channel?: 'ok' | 'missing' | 'throws' } = {}) => {
  const sent: unknown[] = [];
  const logs: string[] = [];
  const errors: string[] = [];
  const state = { channel: options.channel ?? 'ok', sendFails: false };

  const modlog = createModlog({
    channelId: 'channelId' in options ? options.channelId : '123456789012345678',
    fetchChannel: async () => {
      if (state.channel === 'missing') return null;
      if (state.channel === 'throws') throw new Error('Unknown Channel');
      return {
        send: async payload => {
          if (state.sendFails) throw new Error('Missing Permissions');
          sent.push(payload);
        },
      };
    },
    logger: { log: message => logs.push(String(message)), error: message => errors.push(String(message)) },
  });
  return { modlog, sent, logs, errors, state };
};

test('an entry is sent to the log channel without mentioning anyone', async () => {
  const { modlog, sent } = harness();
  const payload = entry();

  await modlog.post(payload);

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], { embeds: payload.embeds, allowedMentions: { parse: [] } });
  assert.equal(modlog.enabled, true);
});

test('without a log channel nothing is sent and the bot says so once', async () => {
  const { modlog, sent, logs } = harness({ channelId: undefined });

  await modlog.post(entry());
  await modlog.post(entry());

  assert.equal(modlog.enabled, false);
  assert.equal(sent.length, 0);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /MODLOG_CHANNEL_ID is not set/);
});

test('a channel that does not exist is reported once, never thrown', async () => {
  const { modlog, errors } = harness({ channel: 'missing' });

  await modlog.post(entry());
  await modlog.post(entry());

  assert.equal(errors.length, 1);
});

test('a channel that fails to load or refuses the message is reported once per streak', async () => {
  const loading = harness({ channel: 'throws' });
  await loading.modlog.post(entry());
  await loading.modlog.post(entry());
  assert.equal(loading.errors.length, 1);

  const refusing = harness();
  refusing.state.sendFails = true;
  await refusing.modlog.post(entry());
  await refusing.modlog.post(entry());
  assert.equal(refusing.errors.length, 1);

  // Once it works again, the next failure is worth a new line
  refusing.state.sendFails = false;
  await refusing.modlog.post(entry());
  assert.equal(refusing.sent.length, 1);
  refusing.state.sendFails = true;
  await refusing.modlog.post(entry());
  assert.equal(refusing.errors.length, 2);
});
