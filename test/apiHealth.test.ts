import { API_BASE, json } from './support';
import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { EMOJIS } from '../src/config/emojis';
import { ApiClient } from '../src/lib/api/client';
import { apiLines, infoEmbed, type InfoData } from '../src/features/info/infoView';

afterEach(() => mock.restoreAll());

/** Answers the next call with `answer` (an Error is a network failure) and records every call. */
const stub = (answer: Response | Error) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    if (answer instanceof Error) throw answer;
    return answer.clone();
  });
  return calls;
};

const client = () => new ApiClient(API_BASE, 'pk_secret_key');

test('a healthy API is online, with its version and how long it took', async () => {
  const calls = stub(json(200, { status: 'ok', version: '2.0.0' }));
  const health = await client().health();

  assert.equal(health.online, true);
  assert.equal(health.version, '2.0.0');
  assert.ok(typeof health.latencyMs === 'number' && health.latencyMs >= 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${API_BASE}/v1/health`);
});

test('the probe is public: no key is sent, and a redirect is not followed', async () => {
  const calls = stub(json(200, { status: 'ok', version: '2.0.0' }));
  await client().health();

  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get('x-api-key'), null);
  assert.equal(JSON.stringify(calls[0].init).includes('pk_secret_key'), false);
  assert.equal(calls[0].init.redirect, 'manual');
});

test('a missing version is still online', async () => {
  stub(json(200, { status: 'ok' }));
  assert.deepEqual({ ...(await client().health()), latencyMs: null }, { online: true, version: null, latencyMs: null });
});

test('anything wrong is offline, never an error, and is tried once', async () => {
  const wrong: Array<Response | Error> = [
    json(500, { error: { code: 'internal_error' } }),
    json(503, {}),
    json(200, { status: 'degraded', version: '2.0.0' }),
    json(200, null),
    new Response('<html>not json</html>', { status: 200 }),
    new Error('network'),
    Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
  ];
  for (const answer of wrong) {
    mock.restoreAll();
    const calls = stub(answer);
    assert.deepEqual(await client().health(), { online: false, version: null, latencyMs: null });
    assert.equal(calls.length, 1, 'no retries');
  }
});

test('the probe has its own short timeout', async () => {
  const calls = stub(json(200, { status: 'ok', version: '2.0.0' }));
  await client().health(1234);
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test('the API field says online with version and latency, or only that it has no connection', () => {
  assert.deepEqual(apiLines({ online: true, version: '2.0.0', latencyMs: 80 }), [
    `Estado: ${EMOJIS.online} **En línea**`,
    'Versión: **v2.0.0**',
    'Latencia: **80ms**',
  ]);
  assert.deepEqual(apiLines({ online: true, version: null, latencyMs: null }), [`Estado: ${EMOJIS.online} **En línea**`]);
  assert.deepEqual(apiLines({ online: false, version: null, latencyMs: null }), [`Estado: ${EMOJIS.offline} **Sin conexión**`]);
});

const info = (api: InfoData['api']): InfoData => ({
  botName: 'Panita Bot',
  avatarUrl: 'https://cdn.example/bot.png',
  version: '2.1.0',
  developer: 'Javithor360',
  stats: { guilds: 2, users: 150, channels: 67, commands: 58 },
  programming: { discordjs: '14.26.4', node: 'v22.14.0', memoryMb: 92, uptime: '1h 0m 0s', apiMs: 105 },
  links: { web: 'https://www.panitacraft.com/', donate: 'https://paypal.example', discord: 'https://discord.gg/x' },
  api,
});

test('the API is its own field in the bot info, apart from the Discord latency in the description', () => {
  const json = infoEmbed(info({ online: true, version: '2.0.0', latencyMs: 80 }), () => 0).toJSON();
  const field = json.fields!.find(f => f.name === 'API')!;
  assert.equal(field.value, `Estado: ${EMOJIS.online} **En línea**\nVersión: **v2.0.0**\nLatencia: **80ms**`);
  assert.ok(json.description!.includes('Latencia Discord: 105ms'));
  assert.equal(json.description!.includes('Panita API'), false);

  const down = infoEmbed(info({ online: false, version: null, latencyMs: null })).toJSON();
  assert.equal(down.fields!.find(f => f.name === 'API')!.value, `Estado: ${EMOJIS.offline} **Sin conexión**`);
});
