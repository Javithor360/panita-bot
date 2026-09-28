import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeCustomId, encodeCustomId } from '../src/core/customId';

test('roundtrip with args and owner', () => {
  const id = encodeCustomId({ namespace: 'skin', action: 'view', args: ['Steve'], owner: '123456789012345678' });
  assert.equal(id, 'skin:view:Steve|123456789012345678');
  assert.deepEqual(decodeCustomId(id), { namespace: 'skin', action: 'view', args: ['Steve'], owner: '123456789012345678' });
});

test('roundtrip without owner', () => {
  const id = encodeCustomId({ namespace: 'ticket', action: 'create', args: ['soporte'] });
  assert.deepEqual(decodeCustomId(id), { namespace: 'ticket', action: 'create', args: ['soporte'] });
});

test('legacy ids are not decoded', () => {
  assert.equal(decodeCustomId('btn_ticket_close_prompt'), null);
  assert.equal(decodeCustomId('btn_gallery_reroll::123'), null);
});

test('rejects reserved characters and overlong ids', () => {
  assert.throws(() => encodeCustomId({ namespace: 'tag', action: 'x', args: ['a:b'] }));
  assert.throws(() => encodeCustomId({ namespace: 'tag', action: 'x', args: ['a|b'] }));
  assert.throws(() => encodeCustomId({ namespace: 'tag', action: 'x', args: ['a'.repeat(100)] }));
});
