import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageType } from 'discord.js';
import { giveDefaultRoles, DEFAULT_ROLES_REASON } from '../src/features/welcome/roles';
import { createWelcome, welcomeText, type JoinMessage } from '../src/features/welcome/welcome';

const member = (held: string[], fail = false) => {
  const calls: Array<{ ids: string[]; reason?: string }> = [];
  return {
    calls,
    member: {
      id: '111',
      roles: {
        cache: { has: (id: string) => held.includes(id) },
        add: async (ids: string[], reason?: string) => {
          if (fail) throw new Error('Missing Permissions');
          calls.push({ ids, reason });
        },
      },
    },
  };
};

test('a new member gets the three default roles in one call', async () => {
  const { member: target, calls } = member([]);
  const given = await giveDefaultRoles(target, ['a', 'b', 'c']);
  assert.deepEqual(given, ['a', 'b', 'c']);
  assert.deepEqual(calls, [{ ids: ['a', 'b', 'c'], reason: DEFAULT_ROLES_REASON }]);
});

test('roles the member already has are not asked for again', async () => {
  const { member: target, calls } = member(['b']);
  assert.deepEqual(await giveDefaultRoles(target, ['a', 'b', 'c']), ['a', 'c']);
  assert.deepEqual(calls[0].ids, ['a', 'c']);
});

test('nothing is sent when the member has every default role or there are none', async () => {
  const { member: target, calls } = member(['a']);
  assert.deepEqual(await giveDefaultRoles(target, ['a']), []);
  assert.deepEqual(await giveDefaultRoles(target, []), []);
  assert.equal(calls.length, 0);
});

test('a refusal of Discord reaches the caller to be logged', async () => {
  const { member: target } = member([], true);
  await assert.rejects(giveDefaultRoles(target, ['a']), /Missing Permissions/);
});

const joinMessage = (override: Partial<JoinMessage> = {}, refuseSticker = false) => {
  const replies: Array<Parameters<JoinMessage['reply']>[0]> = [];
  const message: JoinMessage = {
    type: MessageType.UserJoin,
    author: { id: '111', bot: false },
    reply: async payload => {
      if (refuseSticker && payload.stickers) throw new Error('Invalid sticker');
      replies.push(payload);
    },
    ...override,
  };
  return { message, replies };
};

const quiet = { log: () => {}, error: () => {} };

test('the join message is answered with one of the stickers, picked at random', async () => {
  const ids = ['10', '20', '30'];
  const picked: Array<string | undefined> = [];
  for (const random of [0, 0.5, 0.99, 1]) {
    const { message, replies } = joinMessage();
    await createWelcome({ stickerIds: ids, random: () => random, logger: quiet })(message);
    assert.equal(replies.length, 1);
    picked.push(replies[0].stickers?.[0]);
  }
  // `1` is outside [0, 1) but must still land on a sticker
  assert.deepEqual(picked, ['10', '20', '30', '30']);
});

test('a sticker reply carries no text', async () => {
  const { message, replies } = joinMessage();
  await createWelcome({ stickerIds: ['999'], logger: quiet })(message);
  assert.deepEqual(replies[0].stickers, ['999']);
  assert.equal(replies[0].content, undefined);
});

test('without a sticker the new member gets a text that pings only them', async () => {
  const { message, replies } = joinMessage();
  await createWelcome({ stickerIds: [], logger: quiet })(message);
  assert.equal(replies[0].content, welcomeText('111'));
  assert.deepEqual(replies[0].allowedMentions.users, ['111']);
  assert.deepEqual(replies[0].allowedMentions.parse, []);
});

test('when Discord refuses the sticker, the text is sent instead', async () => {
  const { message, replies } = joinMessage({}, true);
  await createWelcome({ stickerIds: ['999'], logger: quiet })(message);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].content, welcomeText('111'));
});

test('other messages and bots are ignored', async () => {
  const welcome = createWelcome({ stickerIds: ['999'], logger: quiet });
  const normal = joinMessage({ type: MessageType.Default });
  const bot = joinMessage({ author: { id: '5', bot: true } });
  await welcome(normal.message);
  await welcome(bot.message);
  assert.equal(normal.replies.length + bot.replies.length, 0);
});
