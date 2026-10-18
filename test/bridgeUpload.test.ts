import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { channelMapOf } from '../src/features/minecraft/channels';
import { RateLimiter } from '../src/features/minecraft/rateLimit';
import {
  MAX_UPLOAD_BYTES,
  MediaUploads,
  parseMultipart,
  readUploadMeta,
  sniffImage,
  type UploadTargets,
} from '../src/features/minecraft/upload';
import { mountUploadRoutes } from '../src/features/minecraft/uploadRoutes';
import type { HookFile, PostedFile } from '../src/features/minecraft/webhook';

const GLOBAL = '111111111111111111';
const KEY = 'a-bridge-key-of-enough-length';
const TEZ = { uuid: '11111111-2222-3333-4444-555555555555', name: 'Tezzlar', nickname: 'Tez', premium: false, skin: null };
const AVATARS = { premium: 'https://heads.test/{uuid}', cracked: 'https://heads.test/steve', skin: 'https://heads.test/skin/{skin}' };

// Images with only what a reader of the header needs

const png = (width: number, height: number, extra = 0) => {
  const head = Buffer.alloc(33 + extra);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head);
  head.writeUInt32BE(13, 8);
  head.write('IHDR', 12, 'latin1');
  head.writeUInt32BE(width, 16);
  head.writeUInt32BE(height, 20);
  return head;
};

const jpeg = (width: number, height: number) => {
  const head = Buffer.alloc(40);
  // Start of image, a small application segment (length 4 counts its own two bytes), then the frame header
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xc0]).copy(head);
  head.writeUInt16BE(11, 10);
  head[12] = 8;
  head.writeUInt16BE(height, 13);
  head.writeUInt16BE(width, 15);
  return head;
};

const webpLossy = (width: number, height: number) => {
  const head = Buffer.alloc(40);
  head.write('RIFF', 0, 'latin1');
  head.write('WEBP', 8, 'latin1');
  head.write('VP8 ', 12, 'latin1');
  head.writeUInt16LE(width, 26);
  head.writeUInt16LE(height, 28);
  return head;
};

test('reads the kind and the size of an image from its own bytes', () => {
  assert.deepEqual(sniffImage(png(1920, 1080)), { type: 'image/png', width: 1920, height: 1080 });
  assert.deepEqual(sniffImage(jpeg(640, 360)), { type: 'image/jpeg', width: 640, height: 360 });
  assert.deepEqual(sniffImage(webpLossy(800, 600)), { type: 'image/webp', width: 800, height: 600 });
});

test('refuses what is not an image it can read, or that has an impossible size', () => {
  assert.equal(sniffImage(Buffer.from('<html>not an image</html>'.padEnd(40))), null);
  assert.equal(sniffImage(Buffer.from('GIF89a'.padEnd(40))), null);
  assert.equal(sniffImage(png(0, 10)), null);
  assert.equal(sniffImage(png(20_000, 10)), null);
  assert.equal(sniffImage(Buffer.alloc(0)), null);
});

// Multipart

const multipart = (parts: { name: string; filename?: string; data: Buffer | string; type?: string }[], boundary = 'XBOUNDARYX') => {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${part.filename ? `; filename="${part.filename}"` : ''}\r\n`));
    if (part.type) chunks.push(Buffer.from(`Content-Type: ${part.type}\r\n`));
    chunks.push(Buffer.from('\r\n'), Buffer.isBuffer(part.data) ? part.data : Buffer.from(part.data), Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), type: `multipart/form-data; boundary=${boundary}` };
};

const meta = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ player: TEZ, channel: 'global', caption: 'mi base', destination: 'discord', ...over });

test('reads the parts of a multipart body, bytes intact', () => {
  const image = png(10, 10, 50);
  const { body, type } = multipart([
    { name: 'meta', data: meta(), type: 'application/json' },
    { name: 'file', filename: 'captura.png', data: image, type: 'image/png' },
  ]);
  const parts = parseMultipart(type, body);
  assert.equal(parts?.length, 2);
  assert.equal(parts?.[0].name, 'meta');
  assert.deepEqual(parts?.[1].data, image);
  assert.equal(parts?.[1].filename, 'captura.png');
});

test('refuses a multipart body that is not well formed', () => {
  assert.equal(parseMultipart(undefined, Buffer.from('x')), null);
  assert.equal(parseMultipart('application/json', Buffer.from('{}')), null);
  assert.equal(parseMultipart('multipart/form-data; boundary=B', Buffer.from('no boundary here')), null);
  assert.equal(parseMultipart('multipart/form-data; boundary=B', Buffer.from('--B\r\nContent-Disposition: form-data; name="a"\r\n\r\nunfinished')), null);
});

test('reads the metadata, cleaning the caption, and refuses a wrong shape', () => {
  const ok = readUploadMeta(Buffer.from(meta({ caption: '  hola\u0007​  mundo ' })));
  assert.equal(ok?.caption, 'hola  mundo');
  assert.equal(ok?.destination, 'discord');
  assert.equal(readUploadMeta(Buffer.from(meta({ caption: 'x'.repeat(500) })))?.caption.length, 200);
  assert.equal(readUploadMeta(Buffer.from(meta({ destination: 'everywhere' }))), null);
  assert.equal(readUploadMeta(Buffer.from(meta({ channel: 'Not A Channel' }))), null);
  assert.equal(readUploadMeta(Buffer.from(meta({ player: { name: 'x' } }))), null);
  assert.equal(readUploadMeta(Buffer.from('not json')), null);
});

// The service

interface Fakes {
  targets: UploadTargets;
  posted: { channelId: string; username: string; avatarUrl: string; content: string; file: HookFile }[];
  media: HookFile[];
  deleted: string[];
}

const fakes = (over: { mediaConfigured?: boolean; fail?: boolean } = {}): Fakes => {
  const state: Fakes = { posted: [], media: [], deleted: [], targets: undefined as unknown as UploadTargets };
  let counter = 100;
  const posted = (): PostedFile => ({ messageId: String(++counter), url: `https://cdn.discordapp.com/attachments/1/${counter}/captura.jpg` });
  state.targets = {
    postAsPlayer: async (channelId, post, file) => {
      if (over.fail) return null;
      state.posted.push({ channelId, ...post, file });
      return posted();
    },
    deleteFromChannel: async (_channelId, messageId) => {
      state.deleted.push(`channel:${messageId}`);
      return true;
    },
    media: {
      configured: over.mediaConfigured ?? true,
      post: async file => {
        state.media.push(file);
        return posted();
      },
      remove: async messageId => {
        state.deleted.push(`media:${messageId}`);
        return true;
      },
    },
  };
  return state;
};

const service = (state: Fakes, perPlayer = new RateLimiter(3, 60_000), overall = new RateLimiter(20, 60_000)) =>
  new MediaUploads({
    channels: channelMapOf({ global: GLOBAL }),
    targets: state.targets,
    avatars: AVATARS,
    perPlayer,
    overall,
    logger: { error: () => {} },
  });

const request = (image: Buffer, metadata = meta()) =>
  parseMultipart(
    ...((): [string, Buffer] => {
      const { body, type } = multipart([
        { name: 'meta', data: metadata, type: 'application/json' },
        { name: 'file', filename: 'captura.jpg', data: image, type: 'image/jpeg' },
      ]);
      return [type, body];
    })(),
  );

test('posts the image as the player through the webhook and answers with its address', async () => {
  const state = fakes();
  const result = await service(state).upload(request(jpeg(640, 360)));

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    url: 'https://cdn.discordapp.com/attachments/1/101/captura.jpg',
    type: 'image/jpeg',
    size: 40,
    width: 640,
    height: 360,
    messageId: '101',
  });
  assert.equal(state.posted.length, 1);
  assert.equal(state.posted[0].channelId, GLOBAL);
  assert.equal(state.posted[0].username, 'Tez');
  assert.equal(state.posted[0].content, 'mi base');
  assert.equal(state.posted[0].avatarUrl, 'https://heads.test/steve');
  assert.equal(state.posted[0].file.name, 'captura.jpg');
  assert.deepEqual(state.media, []);
});

test('the media destination goes only to the private channel', async () => {
  const state = fakes();
  const result = await service(state).upload(request(png(100, 100), meta({ destination: 'media' })));
  assert.equal(result.status, 200);
  assert.equal(state.media.length, 1);
  assert.deepEqual(state.posted, []);
});

test('a share only for the game chat is unavailable without a media channel', async () => {
  const result = await service(fakes({ mediaConfigured: false })).upload(request(png(100, 100), meta({ destination: 'media' })));
  assert.deepEqual(result, { status: 503, body: { error: 'unavailable' } });
});

test('refuses a body that is not what the contract says, in the order of the contract', async () => {
  const state = fakes();
  const uploads = service(state);
  assert.deepEqual((await uploads.upload(null)).body, { error: 'bad_request' });
  assert.deepEqual((await uploads.upload(request(jpeg(10, 10), 'not json'))).body, { error: 'bad_request' });
  assert.deepEqual((await uploads.upload(request(Buffer.alloc(MAX_UPLOAD_BYTES + 1, 1)))).body, { error: 'too_large' });
  assert.deepEqual((await uploads.upload(request(Buffer.from('plain text pretending to be an image')))).body, { error: 'type' });
  assert.deepEqual((await uploads.upload(request(jpeg(10, 10), meta({ channel: 'staff' })))).body, { error: 'channel' });
  assert.deepEqual(state.posted, []);
});

test('the type is told by the bytes, not by what the file says', async () => {
  const { body, type } = multipart([
    { name: 'meta', data: meta(), type: 'application/json' },
    { name: 'file', filename: 'captura.png', data: Buffer.from('<script>alert(1)</script>'.padEnd(64)), type: 'image/png' },
  ]);
  assert.deepEqual((await service(fakes()).upload(parseMultipart(type, body))).body, { error: 'type' });
});

test('limits each player and everyone together, and counts only what was posted', async () => {
  const state = fakes();
  const uploads = service(state, new RateLimiter(2, 60_000), new RateLimiter(3, 60_000));
  assert.equal((await uploads.upload(request(jpeg(10, 10)))).status, 200);
  assert.equal((await uploads.upload(request(jpeg(10, 10)))).status, 200);
  assert.deepEqual((await uploads.upload(request(jpeg(10, 10)))).body, { error: 'rate' });
  const other = meta({ player: { ...TEZ, uuid: '99999999-2222-3333-4444-555555555555', name: 'Other' } });
  assert.equal((await uploads.upload(request(jpeg(10, 10), other))).status, 200);
  assert.deepEqual((await uploads.upload(request(jpeg(10, 10), other))).body, { error: 'rate' });
  assert.equal(state.posted.length, 3);
});

test('answers unavailable when Discord could not take the image', async () => {
  assert.deepEqual((await service(fakes({ fail: true })).upload(request(jpeg(10, 10)))).body, { error: 'unavailable' });
});

test('only the player who shared an image can take it back', async () => {
  const state = fakes();
  const uploads = service(state);
  await uploads.upload(request(jpeg(10, 10)));

  assert.equal(await uploads.remove('101', '99999999-2222-3333-4444-555555555555'), 404);
  assert.equal(await uploads.remove('101', undefined), 404);
  assert.equal(await uploads.remove('999', TEZ.uuid), 404);
  assert.deepEqual(state.deleted, []);
  assert.equal(await uploads.remove('101', TEZ.uuid.toUpperCase()), 204);
  assert.deepEqual(state.deleted, ['channel:101']);
  assert.equal(await uploads.remove('101', TEZ.uuid), 404, 'it is gone');
});

test('forgets who shared an image after a day', async () => {
  let now = 1_000_000;
  const state = fakes();
  const uploads = new MediaUploads({
    channels: channelMapOf({ global: GLOBAL }),
    targets: state.targets,
    avatars: AVATARS,
    perPlayer: new RateLimiter(3, 60_000),
    overall: new RateLimiter(20, 60_000),
    logger: { error: () => {} },
    now: () => now,
  });
  await uploads.upload(request(jpeg(10, 10)));
  now += 24 * 60 * 60 * 1000 + 1;
  assert.equal(await uploads.remove('101', TEZ.uuid), 404);
});

// The HTTP side, with a real client

const withServer = async (run: (base: string, state: Fakes) => Promise<void>) => {
  const state = fakes();
  const app = express();
  mountUploadRoutes(app, service(state), header => header === `Bearer ${KEY}`);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, state);
  } finally {
    server.close();
    server.closeAllConnections();
  }
};

const form = (image: Buffer, metadata = meta()) => {
  const data = new FormData();
  data.set('meta', new Blob([metadata], { type: 'application/json' }));
  data.set('file', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), 'captura.jpg');
  return data;
};

test('over HTTP: refuses a missing or wrong key before reading anything', async () => {
  await withServer(async (base, state) => {
    for (const authorization of [undefined, 'Bearer wrong', KEY]) {
      const headers: Record<string, string> = authorization ? { authorization } : {};
      const response = await fetch(`${base}/bridge/media`, { method: 'POST', headers, body: form(jpeg(10, 10)) });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'auth' });
    }
    assert.deepEqual(state.posted, []);
  });
});

test('over HTTP: takes an image, answers its address, and lets its poster delete it', async () => {
  await withServer(async (base, state) => {
    const authorization = `Bearer ${KEY}`;
    const response = await fetch(`${base}/bridge/media`, { method: 'POST', headers: { authorization }, body: form(jpeg(640, 360)) });
    assert.equal(response.status, 200);
    const answer = (await response.json()) as { messageId: string; width: number };
    assert.equal(answer.width, 640);

    const stranger = await fetch(`${base}/bridge/media/${answer.messageId}`, {
      method: 'DELETE',
      headers: { authorization, 'x-player-uuid': '99999999-2222-3333-4444-555555555555' },
    });
    assert.equal(stranger.status, 404);
    const own = await fetch(`${base}/bridge/media/${answer.messageId}`, { method: 'DELETE', headers: { authorization, 'x-player-uuid': TEZ.uuid } });
    assert.equal(own.status, 204);
    assert.deepEqual(state.deleted, [`channel:${answer.messageId}`]);

    const noKey = await fetch(`${base}/bridge/media/${answer.messageId}`, { method: 'DELETE', headers: { 'x-player-uuid': TEZ.uuid } });
    assert.equal(noKey.status, 401);
  });
});

test('over HTTP: a body past the limit is refused as too large', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/bridge/media`, {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY}` },
      body: form(Buffer.alloc(MAX_UPLOAD_BYTES * 2, 1)),
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'too_large' });
  });
});

test('over HTTP: a body that is not multipart is a bad request', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/bridge/media`, {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 400);
  });
});
