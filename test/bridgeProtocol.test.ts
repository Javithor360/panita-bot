import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FRAME_BYTES, MAX_ICON_BYTES, parseModFrame, readQueryData, withoutControlCharacters } from '../src/features/minecraft/protocol';

const player = { uuid: 'dd12be42-52a9-4a91-a8a1-11c01849e498', name: 'Javithor360', nickname: null, premium: true };
const hello = { type: 'hello', protocol: 1, modVersion: '0.0.1', minecraftVersion: '26.3', startedAt: '2026-10-12T10:00:00Z', maxPlayers: 20 };
const parse = (value: unknown) => parseModFrame(typeof value === 'string' ? value : JSON.stringify(value));

test('reads a hello', () => {
  assert.deepEqual(parse(hello), { ok: true, frame: hello });
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest of the image')]);

test('reads the icon of the server from a hello and keeps it as bytes', () => {
  const parsed = parse({ ...hello, icon: PNG.toString('base64') });

  assert.ok(parsed.ok && parsed.frame?.type === 'hello');
  assert.ok(parsed.ok && parsed.frame?.type === 'hello' && parsed.frame.icon?.equals(PNG));
});

test('drops an icon that is not a PNG, too big or not base64, and still accepts the hello', () => {
  const big = Buffer.concat([PNG, Buffer.alloc(10_000)]);
  const bad = [Buffer.from('not an image at all').toString('base64'), big.toString('base64'), 'not base64!', '', 12, null, '@@@@'];
  for (const icon of bad) {
    const parsed = parse({ ...hello, icon });
    assert.ok(parsed.ok, JSON.stringify(icon));
    assert.deepEqual(parsed.ok && parsed.frame, hello, 'the frame has no icon at all');
  }
});

test('accepts an icon of exactly the largest size', () => {
  const edge = Buffer.concat([PNG, Buffer.alloc(MAX_ICON_BYTES - PNG.length)]);

  const parsed = parse({ ...hello, icon: edge.toString('base64') });

  assert.ok(parsed.ok && parsed.frame?.type === 'hello' && parsed.frame.icon?.length === MAX_ICON_BYTES);
});

test('rejects a hello with the wrong shape', () => {
  for (const bad of [{ ...hello, protocol: '1' }, { ...hello, startedAt: 'yesterday' }, { ...hello, maxPlayers: -1 }, { type: 'hello' }]) {
    assert.equal(parse(bad).ok, false, JSON.stringify(bad));
  }
});

test('reads a chat line with a player who has a nickname or none', () => {
  const line = { type: 'chat', channel: 'global', player, text: 'hola', emote: false };

  assert.deepEqual(parse(line), { ok: true, frame: line });
  assert.deepEqual(parse({ ...line, player: { ...player, nickname: 'Javi' } }), { ok: true, frame: { ...line, player: { ...player, nickname: 'Javi' } } });
});

test('rejects a chat line that is empty, too long, in a bad channel or from a bad player', () => {
  const line = { type: 'chat', channel: 'global', player, text: 'hola', emote: false };
  const bad = [
    { ...line, text: '' },
    { ...line, text: 'x'.repeat(257) },
    { ...line, channel: 'Global Chat' },
    { ...line, emote: 'no' },
    { ...line, player: { ...player, name: 'not a name!' } },
    { ...line, player: { ...player, uuid: 'nope' } },
    { ...line, player: { ...player, premium: 1 } },
    { ...line, player: { ...player, nickname: '' } },
  ];
  for (const frame of bad) assert.equal(parse(frame).ok, false, JSON.stringify(frame));
});

test('reads events; those about a player need the player, the others do not', () => {
  assert.deepEqual(parse({ type: 'event', kind: 'death', player, text: 'Javi was slain by Zombie', key: 'death.attack.mob' }), {
    ok: true,
    frame: { type: 'event', kind: 'death', player, text: 'Javi was slain by Zombie', key: 'death.attack.mob' },
  });
  assert.deepEqual(parse({ type: 'event', kind: 'started' }), { ok: true, frame: { type: 'event', kind: 'started' } });
  assert.deepEqual(parse({ type: 'event', kind: 'broadcast', text: 'Reinicio en 5 minutos' }), {
    ok: true,
    frame: { type: 'event', kind: 'broadcast', text: 'Reinicio en 5 minutos' },
  });
  assert.equal(parse({ type: 'event', kind: 'join' }).ok, false);
  assert.equal(parse({ type: 'event', kind: 'explode', player }).ok, false);
  assert.equal(parse({ type: 'event', kind: 'death', player, text: 'x'.repeat(1025) }).ok, false);
});

test('reads a reply, ok with data or failed with an error', () => {
  assert.deepEqual(parse({ type: 'reply', id: 'a', ok: true, data: { tps: 20 } }), {
    ok: true,
    frame: { type: 'reply', id: 'a', ok: true, data: { tps: 20 }, error: undefined },
  });
  assert.deepEqual(parse({ type: 'reply', id: 'a', ok: false, error: 'unknown' }), {
    ok: true,
    frame: { type: 'reply', id: 'a', ok: false, data: undefined, error: 'unknown' },
  });
  assert.equal(parse({ type: 'reply', id: 'a', ok: true }).ok, false);
  assert.equal(parse({ type: 'reply', ok: true, data: {} }).ok, false);
});

test('skips a type it does not know and ignores extra fields', () => {
  assert.deepEqual(parse({ type: 'telemetry', anything: 1 }), { ok: true, frame: null });
  const frame = parse({ ...hello, future: true });
  assert.equal(frame.ok && frame.frame?.type, 'hello');
});

test('rejects what is not a frame', () => {
  for (const raw of ['not json', '[]', '"hello"', '{}', '{"type":1}', 'null']) {
    assert.equal(parse(raw).ok, false, raw);
  }
});

test('rejects a frame over the size limit', () => {
  const huge = JSON.stringify({ type: 'event', kind: 'broadcast', text: 'x'.repeat(MAX_FRAME_BYTES) });

  assert.deepEqual(parse(huge), { ok: false, reason: 'too large' });
});

test('takes the control characters out of a text', () => {
  assert.equal(withoutControlCharacters('hola\u0000 mun\u001bdo\n!'), 'hola mundo!');
});

test('reads the answers of the queries and rejects the ones with another shape', () => {
  assert.deepEqual(readQueryData('tps', { tps: 19.8, mspt: 12.5 }), { tps: 19.8, mspt: 12.5 });
  assert.equal(readQueryData('tps', { tps: 'fast', mspt: 12 }), null);
  assert.equal(readQueryData('tps', undefined), null);
  assert.deepEqual(readQueryData('playerlist', { online: [{ name: 'Javi', nickname: null }, { name: 'Tez' }], max: 20 }), {
    online: [
      { name: 'Javi', nickname: null },
      { name: 'Tez', nickname: null },
    ],
    max: 20,
  });
  assert.equal(readQueryData('playerlist', { online: [{ name: 'bad name' }], max: 20 }), null);
  assert.equal(readQueryData('playerlist', { online: 'no', max: 20 }), null);
  assert.deepEqual(readQueryData('status', { online: 2, max: 20, tps: 20, mspt: 8, uptimeSeconds: 3600, version: '26.3' }), {
    online: 2,
    max: 20,
    tps: 20,
    mspt: 8,
    uptimeSeconds: 3600,
    version: '26.3',
  });
  const status = { online: 2, max: 20, tps: 20, mspt: 8, uptimeSeconds: 3600, version: '26.3' };
  assert.equal(readQueryData('status', { ...status, totalPlayers: 87 })?.totalPlayers, 87);
  for (const totalPlayers of ['87', -1, 1.5, null]) {
    assert.deepEqual(readQueryData('status', { ...status, totalPlayers }), status, `${totalPlayers} is ignored, not an error`);
  }
  assert.equal(readQueryData('status', { online: 2 }), null);
});
