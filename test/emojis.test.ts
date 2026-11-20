import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSETS, EMOJIS as FROM_CONSTANTS } from '../src/config/constants';
import { EMOJI_DEFS, EMOJIS, emojiOf, emojiUrl, type EmojiKey } from '../src/config/emojis';

const keys = Object.keys(EMOJI_DEFS) as EmojiKey[];

test('every emoji renders as valid markup, animated ones with the a prefix', () => {
  for (const key of keys) {
    assert.match(EMOJIS[key], /^<a?:[A-Za-z0-9_]{2,32}:\d{17,20}>$/, key);
    assert.equal(EMOJIS[key].startsWith('<a:'), 'animated' in EMOJI_DEFS[key], key);
  }
});

test('ids are unique, so two keys never show the same emoji by mistake', () => {
  const ids = keys.map(key => EMOJI_DEFS[key].id);
  assert.equal(new Set(ids).size, ids.length);
});

test('the four emojis that existed before render exactly what they did', () => {
  assert.equal(EMOJIS.llamushroom, '<:llamushroom:1513402349920714852>');
  assert.equal(EMOJIS.jaimePog, '<:jaimePog:723406415917613056>');
  // The key and the emoji's real name differ
  assert.equal(EMOJIS.noAutorizo, '<:noautorizo:1116806520265506866>');
  assert.equal(EMOJIS.tezzlar3, '<a:tezzlar3:1513802514884067409>');
});

test('the new emojis are in the dictionary', () => {
  assert.equal(EMOJIS.check, '<:check:1573128048881049683>');
  assert.equal(EMOJIS.cross, '<:cross:1573128033160798339>');
  assert.equal(EMOJIS.boost, '<a:boost:1573127909298938008>');
  for (const key of ['online', 'idle', 'offline', 'mobile', 'dev', 'stats'] as const) assert.ok(EMOJIS[key], key);
});

test('constants keeps exporting the same dictionary', () => {
  assert.equal(FROM_CONSTANTS, EMOJIS);
});

test('emojiOf gives the object a button needs', () => {
  assert.deepEqual(emojiOf('check'), { id: '1573128048881049683', name: 'check', animated: false });
  assert.deepEqual(emojiOf('boost'), { id: '1573127909298938008', name: 'boost', animated: true });
});

test('emojiUrl points at the right image, a gif for the animated ones', () => {
  assert.equal(emojiUrl('check'), 'https://cdn.discordapp.com/emojis/1573128048881049683.webp?size=96');
  assert.equal(emojiUrl('boost', 64), 'https://cdn.discordapp.com/emojis/1573127909298938008.gif?size=64');
  assert.equal(ASSETS.llamushroomIcon, 'https://cdn.discordapp.com/emojis/1513402349920714852.webp?size=96');
});
