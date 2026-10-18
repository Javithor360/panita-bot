import './support';
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { BridgeQueryError, BridgeUnavailableError } from '../src/features/minecraft/link';
import { BridgeServer, type BridgeServerOptions } from '../src/features/minecraft/server';
import type { ModFrame } from '../src/features/minecraft/protocol';

const KEY = 'a-long-random-bridge-key';
const hello = { type: 'hello', protocol: 1, modVersion: '0.0.1', minecraftVersion: '26.3', startedAt: '2026-10-12T10:00:00Z', maxPlayers: 20 };
const player = { uuid: 'dd12be42-52a9-4a91-a8a1-11c01849e498', name: 'Javithor360', nickname: null, premium: true, skin: null };
const silent = { log: () => {}, error: () => {} };

const open: Array<{ close(): void }> = [];
const track = <T extends { close(): void }>(thing: T): T => {
  open.push(thing);
  return thing;
};

afterEach(() => {
  while (open.length) open.pop()!.close();
});

const start = async (options: Partial<BridgeServerOptions> = {}) => {
  const http: Server = createServer((_, response) => response.end('alive'));
  const bridge = new BridgeServer({ key: KEY, channels: () => ['global'], logger: silent, ...options });
  bridge.attach(http);
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  track({ close: () => http.closeAllConnections() });
  track({ close: () => http.close() });
  track(bridge);
  return { bridge, url: `ws://127.0.0.1:${(http.address() as AddressInfo).port}/bridge` };
};

interface Client {
  socket: WebSocket;
  frames: unknown[];
  closed: Promise<number>;
  next(): Promise<unknown>;
}

/** Connects and collects what the bot sends. */
const connect = async (url: string, headers: Record<string, string> = { Authorization: `Bearer ${KEY}` }, options: object = {}): Promise<Client> => {
  const socket = new WebSocket(url, { headers, ...options });
  track({ close: () => socket.terminate() });
  const frames: unknown[] = [];
  const waiting: Array<(frame: unknown) => void> = [];
  socket.on('message', data => {
    const frame = JSON.parse(data.toString());
    const resolve = waiting.shift();
    if (resolve) resolve(frame);
    else frames.push(frame);
  });
  const closed = new Promise<number>(resolve => socket.on('close', code => resolve(code)));
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
    socket.once('unexpected-response', (_, response) => reject(new Error(`status ${response.statusCode}`)));
  });
  return {
    socket,
    frames,
    closed,
    next: () => (frames.length ? Promise.resolve(frames.shift()) : new Promise(resolve => waiting.push(resolve))),
  };
};

const connected = async (url: string) => {
  const client = await connect(url);
  client.socket.send(JSON.stringify(hello));
  assert.deepEqual(await client.next(), { type: 'welcome', protocol: 1, channels: ['global'], features: ['media'] });
  return client;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('refuses a connection with a wrong or missing key, and only counts it', async () => {
  const { bridge, url } = await start();

  await assert.rejects(connect(url, { Authorization: 'Bearer nope' }), /status 401/);
  await assert.rejects(connect(url, {}), /status 401/);
  await assert.rejects(connect(url, { Authorization: KEY }), /status 401/);
  assert.equal(bridge.status().rejectedConnections, 3);
  assert.equal(bridge.connected, false);
});

test('answers 404 to an upgrade of another path', async () => {
  const { url } = await start();

  await assert.rejects(connect(url.replace('/bridge', '/other')), /status 404/);
});

test('welcomes a mod that says hello with the chat channels the bot bridges', async () => {
  const { bridge, url } = await start({ channels: () => ['global', 'staff'] });
  const client = await connect(url);

  client.socket.send(JSON.stringify(hello));

  assert.deepEqual(await client.next(), { type: 'welcome', protocol: 1, channels: ['global', 'staff'], features: ['media'] });
  assert.equal(bridge.connected, true);
  assert.equal(bridge.status().hello?.modVersion, '0.0.1');
});

test('keeps the icon of the server from its hello, also while it is away, and drops it when a later hello has none', async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('icon')]);
  const { bridge, url } = await start();
  assert.equal(bridge.serverIcon, null);

  const first = await connect(url);
  first.socket.send(JSON.stringify({ ...hello, icon: png.toString('base64') }));
  await first.next();
  assert.ok(bridge.serverIcon?.equals(png));

  first.socket.close();
  await first.closed;
  assert.ok(bridge.serverIcon?.equals(png), 'still there while the server is away');

  await connected(url);
  assert.equal(bridge.serverIcon, null, 'a mod that no longer sends one has none');
});

test('tells when the server connects and when it is lost, but not about a connection that was replaced or never said hello', async () => {
  const { bridge, url } = await start({ helloMs: 60 });
  const events: string[] = [];
  bridge.onConnection(event => void events.push(event.type === 'connected' ? `connected ${event.hello.startedAt}` : 'disconnected'));

  const silent = await connect(url);
  await silent.closed;
  assert.deepEqual(events, [], 'a connection that never said hello was never the server');

  const first = await connected(url);
  assert.deepEqual(events, ['connected 2026-10-12T10:00:00Z']);

  const second = await connected(url);
  await first.closed;
  assert.deepEqual(events, ['connected 2026-10-12T10:00:00Z', 'connected 2026-10-12T10:00:00Z'], 'replacing is not a loss');

  second.socket.close();
  await second.closed;
  await sleep(20);
  assert.deepEqual(events.slice(2), ['disconnected']);
});

test('a handler of connection events that fails does not stop the others', async () => {
  const errors: unknown[][] = [];
  const { bridge, url } = await start({ logger: { log: () => {}, error: (...args: unknown[]) => void errors.push(args) } });
  const seen: string[] = [];
  bridge.onConnection(() => {
    throw new Error('boom');
  });
  bridge.onConnection(event => void seen.push(event.type));

  await connected(url);

  assert.deepEqual(seen, ['connected']);
  assert.equal(errors.length, 1);
});

test('closes a mod with another protocol after telling it so', async () => {
  const { bridge, url } = await start();
  const client = await connect(url);

  client.socket.send(JSON.stringify({ ...hello, protocol: 2 }));

  assert.deepEqual(await client.next(), { type: 'error', code: 'protocol', message: 'protocol 1 expected' });
  assert.equal(await client.closed, 4002);
  assert.equal(bridge.connected, false);
});

test('closes a connection whose first frame is not a hello, or that never says hello', async () => {
  const { url } = await start({ helloMs: 60 });
  const wrong = await connect(url);
  wrong.socket.send(JSON.stringify({ type: 'event', kind: 'started' }));
  assert.equal(await wrong.closed, 4003);

  const silentClient = await connect(url);
  assert.equal(await silentClient.closed, 4003);
});

test('keeps one connection: a new mod replaces the old one', async () => {
  const { bridge, url } = await start();
  const first = await connected(url);

  const second = await connected(url);

  assert.equal(await first.closed, 4000);
  assert.equal(bridge.connected, true);
  second.socket.close();
});

test('hands the frames of the mod to the handlers, but not the replies or the hello again', async () => {
  const { bridge, url } = await start();
  const received: ModFrame[] = [];
  bridge.onFrame(frame => received.push(frame));
  const client = await connected(url);

  client.socket.send(JSON.stringify(hello));
  client.socket.send(JSON.stringify({ type: 'reply', id: 'nobody', ok: true, data: {} }));
  client.socket.send(JSON.stringify({ type: 'chat', channel: 'global', player, text: 'hola', emote: false }));
  client.socket.send(JSON.stringify({ type: 'unknown-yet' }));
  client.socket.send(JSON.stringify({ type: 'event', kind: 'started' }));
  await sleep(100);

  assert.deepEqual(
    received.map(frame => frame.type),
    ['chat', 'event'],
  );
});

test('closes a connection that sends something that is not a valid frame', async () => {
  const { url } = await start();
  const client = await connected(url);

  client.socket.send('this is not json');

  assert.deepEqual(await client.next(), { type: 'error', code: 'frame', message: 'not json' });
  assert.equal(await client.closed, 4003);
});

test('closes a connection that sends a frame over the size limit', async () => {
  const { url } = await start();
  const client = await connected(url);

  client.socket.send(JSON.stringify({ type: 'event', kind: 'broadcast', text: 'x'.repeat(20_000) }));

  assert.equal(await client.closed, 1009);
});

test('drops the frames above the rate limit and warns once', async () => {
  const { bridge, url } = await start({ maxFramesPerSecond: 5 });
  const received: ModFrame[] = [];
  bridge.onFrame(frame => received.push(frame));
  const client = await connected(url);

  for (let i = 0; i < 12; i++) client.socket.send(JSON.stringify({ type: 'event', kind: 'started' }));
  assert.deepEqual(await client.next(), { type: 'error', code: 'rate', message: 'too many frames' });
  await sleep(100);

  // The hello took one place in the window
  assert.equal(received.length, 4);
  assert.equal(bridge.status().framesDropped, 8);
  assert.equal(client.frames.length, 0);
});

test('asks the mod and resolves with its answer', async () => {
  const { bridge, url } = await start();
  const client = await connected(url);

  const answer = bridge.request('tps');
  const query = (await client.next()) as { type: string; id: string; what: string };
  assert.equal(query.type, 'query');
  assert.equal(query.what, 'tps');
  client.socket.send(JSON.stringify({ type: 'reply', id: query.id, ok: true, data: { tps: 19.5, mspt: 14 } }));

  assert.deepEqual(await answer, { tps: 19.5, mspt: 14 });
});

test('rejects a question the mod answers with an error, or with data of the wrong shape', async () => {
  const { bridge, url } = await start();
  const client = await connected(url);

  const failed = bridge.request('status');
  const first = (await client.next()) as { id: string };
  client.socket.send(JSON.stringify({ type: 'reply', id: first.id, ok: false, error: 'unknown' }));
  await assert.rejects(failed, BridgeQueryError);

  const wrong = bridge.request('tps');
  const second = (await client.next()) as { id: string };
  client.socket.send(JSON.stringify({ type: 'reply', id: second.id, ok: true, data: { tps: 'fast' } }));
  await assert.rejects(wrong, /not valid/);
});

test('rejects a question the mod does not answer in time', async () => {
  const { bridge, url } = await start({ queryTimeoutMs: 50 });
  await connected(url);

  await assert.rejects(bridge.request('tps'), BridgeQueryError);
});

test('rejects a question while nobody is connected, and when the mod disconnects while it waits', async () => {
  const { bridge, url } = await start();
  await assert.rejects(bridge.request('tps'), BridgeUnavailableError);
  assert.equal(bridge.send({ type: 'query', id: 'x', what: 'tps' }), false);

  const client = await connected(url);
  const pending = bridge.request('tps');
  await client.next();
  client.socket.close();

  await assert.rejects(pending, BridgeUnavailableError);
});

test('drops a connection that stops answering the pings', async () => {
  const { bridge, url } = await start({ pingMs: 25, deadAfterMs: 80 });
  const client = await connect(url, { Authorization: `Bearer ${KEY}` }, { autoPong: false });
  client.socket.send(JSON.stringify(hello));
  await client.next();

  await client.closed;

  assert.equal(bridge.connected, false);
});

test('keeps a connection that answers the pings', async () => {
  const { bridge, url } = await start({ pingMs: 25, deadAfterMs: 80 });
  await connected(url);

  await sleep(250);

  assert.equal(bridge.connected, true);
});

test('knows the features of the mod that is connected, and none for a mod that announced none or while it is away', async () => {
  const { bridge, url } = await start();
  assert.deepEqual(bridge.features, []);

  const plain = await connect(url);
  plain.socket.send(JSON.stringify(hello));
  await plain.next();
  assert.deepEqual(bridge.features, [], 'an older mod announces nothing');

  const modded = await connect(url);
  modded.socket.send(JSON.stringify({ ...hello, features: ['media', 'later_one'] }));
  await modded.next();
  assert.deepEqual(bridge.features, ['media', 'later_one']);

  modded.socket.close();
  await modded.closed;
  assert.deepEqual(bridge.features, [], 'nothing is promised for a mod that is away');
});
