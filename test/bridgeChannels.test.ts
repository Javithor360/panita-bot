import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelMapOf } from '../src/features/minecraft/channels';
import { DEFAULT_AVATAR_CRACKED, DEFAULT_AVATAR_PREMIUM, avatarFromTemplate } from '../src/lib/minecraft';

test('joins the channels that are set and leaves out the others', () => {
  const channels = channelMapOf({ global: '111111111111111111' });

  assert.deepEqual(channels.chatChannels(), ['global']);
  assert.equal(channels.discordIdOf('global'), '111111111111111111');
  assert.equal(channels.discordIdOf('staff'), undefined);
  assert.equal(channels.chatChannelOf('111111111111111111'), 'global');
  assert.equal(channels.chatChannelOf('999999999999999999'), undefined);
  assert.equal(channels.main, '111111111111111111');
});

test('joins the staff channel too when it is set', () => {
  const channels = channelMapOf({ global: '111111111111111111', staff: '222222222222222222' });

  assert.deepEqual(channels.chatChannels(), ['global', 'staff']);
  assert.deepEqual(channels.discordIds(), ['111111111111111111', '222222222222222222']);
});

test('nothing is joined when no channel is set', () => {
  const channels = channelMapOf({});

  assert.deepEqual(channels.chatChannels(), []);
  assert.equal(channels.main, undefined);
});

const subject = { uuid: 'dd12be42-52a9-4a91-a8a1-11c01849e498', name: 'Javithor360', nickname: 'Javi Pro' };

test('builds a head address from a template, with the UUID without dashes and the names encoded', () => {
  assert.equal(avatarFromTemplate(DEFAULT_AVATAR_PREMIUM, subject), 'https://mc-heads.net/avatar/dd12be4252a94a91a8a111c01849e498/128');
  assert.equal(avatarFromTemplate('https://heads.test/{name}/{nickname}.png', subject), 'https://heads.test/Javithor360/Javi%20Pro.png');
});

test('the nickname falls back to the real name', () => {
  assert.equal(avatarFromTemplate('https://heads.test/{nickname}', { ...subject, nickname: null }), 'https://heads.test/Javithor360');
});

test('the head of a player with a PIN is a fixed one by default', () => {
  assert.equal(avatarFromTemplate(DEFAULT_AVATAR_CRACKED, subject), 'https://mc-heads.net/avatar/MHF_Steve/128');
});
