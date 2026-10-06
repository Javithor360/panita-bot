import { afterEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../src/lib/api/client';
import { ApiError, isApiError } from '../src/lib/api/errors';

const KEY = 'pk_test_secret_key';
const BASE = 'https://api.example.test';

type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const ok = (data: unknown, extra: Record<string, unknown> = {}) => json(200, { data, ...extra });
const apiError = (status: number, code: string, details?: Record<string, unknown>) =>
  json(status, { error: { code, message: `${code} happened`, details } }, { 'x-request-id': 'req-123' });

/** Replaces `fetch` and returns the calls it received. */
const stubFetch = (impl: FetchImpl) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return impl(url, init);
  });
  return calls;
};

/** Answers with each response in turn (an Error is thrown as a network failure). */
const sequence = (...answers: Array<Response | Error>) => {
  let next = 0;
  return stubFetch(async () => {
    const answer = answers[Math.min(next++, answers.length - 1)];
    if (answer instanceof Error) throw answer;
    // A body can be read once, and the last answer repeats
    return answer.clone();
  });
};

const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };

const makeClient = ({ logger = silentLogger }: { logger?: typeof silentLogger } = {}) => {
  const sleeps: number[] = [];
  const client = new ApiClient(`${BASE}/`, KEY, {
    sleep: async ms => void sleeps.push(ms),
    random: () => 0,
    logger,
  });
  return { client, sleeps };
};

afterEach(() => mock.restoreAll());

describe('requests', () => {
  test('sends the key, builds the URL and parses the envelope', async () => {
    const calls = sequence(ok({ client: 'bot' }));
    const { client } = makeClient();

    const data = await client.get<{ client: string }>('/v1/whoami');

    assert.deepEqual(data, { client: 'bot' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${BASE}/v1/whoami`);
    assert.equal(calls[0].init.method, 'GET');
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers['X-Api-Key'], KEY);
    assert.equal(headers['Content-Type'], undefined);
    assert.equal(calls[0].init.body, undefined);
    assert.equal(calls[0].init.redirect, 'manual');
  });

  test('puts query values in the URL and skips undefined ones', async () => {
    const calls = sequence(ok([]));
    const { client } = makeClient();

    await client.get('/v1/tickets/open', { query: { creator_id: '123', guild_id: undefined, limit: 5 } });

    assert.equal(calls[0].url, `${BASE}/v1/tickets/open?creator_id=123&limit=5`);
  });

  test('always encodes path parameters', async () => {
    const calls = sequence(ok({}));
    const { client } = makeClient();

    await client.get('/v1/tags/{name}', { params: { name: '¿a/b?#' } });

    assert.equal(calls[0].url, `${BASE}/v1/tags/${encodeURIComponent('¿a/b?#')}`);
    assert.ok(!calls[0].url.includes('a/b'));
  });

  test('refuses a placeholder without a value', async () => {
    const calls = sequence(ok({}));
    const { client } = makeClient();

    await assert.rejects(client.get('/v1/tags/{name}'), /Missing value for \{name\}/);
    assert.equal(calls.length, 0);
  });

  test('sends JSON bodies with a content type', async () => {
    const calls = sequence(ok({ created: true }));
    const { client } = makeClient();

    await client.put('/v1/tags/{name}', { content: 'hola', media_urls: [] }, { params: { name: 'ip' } });

    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].init.body as string), { content: 'hola', media_urls: [] });
  });

  test('getEnvelope keeps meta', async () => {
    sequence(ok([1, 2], { meta: { count: 2, cursor: 9 } }));
    const { client } = makeClient();

    const result = await client.getEnvelope<number[], { count: number; cursor: number }>('/v1/discord/sync-events');

    assert.deepEqual(result, { data: [1, 2], meta: { count: 2, cursor: 9 } });
  });

  test('a null data value is a valid answer', async () => {
    sequence(ok(null));
    const { client } = makeClient();

    assert.equal(await client.get('/v1/tickets/open'), null);
  });

  test('a success body that is not the envelope is an error', async () => {
    sequence(json(200, { hello: 'world' }));
    const { client } = makeClient();

    await assert.rejects(client.get('/v1/x'), (error: unknown) => isApiError(error, 200, 'invalid_response'));
  });
});

describe('errors', () => {
  test('turns the API envelope into an ApiError', async () => {
    sequence(apiError(409, 'conflict', { field: 'ign' }));
    const { client } = makeClient();

    await assert.rejects(client.post('/v1/x', {}), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 409);
      assert.equal(error.code, 'conflict');
      assert.equal(error.message, 'conflict happened');
      assert.deepEqual(error.details, { field: 'ign' });
      assert.equal(error.requestId, 'req-123');
      return true;
    });
  });

  test('a non-JSON error body becomes http_<status>', async () => {
    sequence(new Response('Too Many Requests', { status: 429 }));
    const { client } = makeClient();

    await assert.rejects(client.post('/v1/x', {}), (error: unknown) => isApiError(error, 429, 'http_429'));
  });

  test('a JSON error body that is not the envelope becomes http_<status>', async () => {
    sequence(json(502, { message: 'bad gateway' }));
    const { client } = makeClient();

    await assert.rejects(client.post('/v1/x', {}), (error: unknown) => isApiError(error, 502, 'http_502'));
  });

  test('a redirect is not followed', async () => {
    sequence(new Response(null, { status: 301, headers: { location: 'https://evil.example/' } }));
    const { client } = makeClient();

    await assert.rejects(client.get('/v1/x'), (error: unknown) => isApiError(error, 301, 'http_301'));
  });

  test('a network failure is status 0 with code network', async () => {
    sequence(new TypeError('fetch failed'));
    const { client } = makeClient();

    await assert.rejects(client.post('/v1/x', {}), (error: unknown) => isApiError(error, 0, 'network'));
  });

  test('a call that does not answer in time is status 0 with code timeout', async () => {
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason))),
    );
    const { client } = makeClient();
    // AbortSignal.timeout does not keep the process alive; a real request's socket would, this stub has none
    const keepAlive = setTimeout(() => {}, 1_000);

    try {
      await assert.rejects(client.post('/v1/x', {}, { timeoutMs: 20 }), (error: unknown) => isApiError(error, 0, 'timeout'));
    } finally {
      clearTimeout(keepAlive);
    }
  });

  test('transient and retryable classification', () => {
    const transient = (status: number) => new ApiError(status, 'x', 'x').transient;
    const retryable = (status: number) => new ApiError(status, 'x', 'x').retryable;

    for (const status of [0, 429, 500, 502, 503, 504]) assert.equal(transient(status), true, `transient ${status}`);
    for (const status of [400, 401, 403, 404, 409]) assert.equal(transient(status), false, `transient ${status}`);
    for (const status of [0, 429, 502, 503, 504]) assert.equal(retryable(status), true, `retryable ${status}`);
    for (const status of [400, 401, 403, 404, 409, 500]) assert.equal(retryable(status), false, `retryable ${status}`);
  });
});

describe('retries', () => {
  test('an idempotent call is retried with exponential backoff and can recover', async () => {
    const calls = sequence(apiError(503, 'x'), apiError(503, 'x'), ok({ fine: true }));
    const { client, sleeps } = makeClient();

    assert.deepEqual(await client.get('/v1/x'), { fine: true });
    assert.equal(calls.length, 3);
    assert.deepEqual(sleeps, [300, 600]);
  });

  test('gives up after two retries', async () => {
    const calls = sequence(apiError(503, 'x'));
    const { client } = makeClient();

    await assert.rejects(client.get('/v1/x'), (error: unknown) => isApiError(error, 503));
    assert.equal(calls.length, 3);
  });

  test('retries network failures, timeouts-as-network and 429, 502, 504 for GET, PUT and DELETE', async () => {
    for (const [method, run] of [
      ['GET', (c: ApiClient) => c.get('/v1/x')],
      ['PUT', (c: ApiClient) => c.put('/v1/x', {})],
      ['DELETE', (c: ApiClient) => c.delete('/v1/x')],
    ] as const) {
      for (const failure of [new TypeError('fetch failed'), apiError(429, 'x'), apiError(502, 'x'), apiError(504, 'x')]) {
        mock.restoreAll();
        const calls = sequence(failure, ok({}));
        const { client } = makeClient();
        await run(client);
        assert.equal(calls.length, 2, `${method} after ${failure instanceof Error ? 'network' : failure.status}`);
      }
    }
  });

  test('never retries other client or server errors', async () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      mock.restoreAll();
      const calls = sequence(apiError(status, 'x'));
      const { client } = makeClient();
      await assert.rejects(client.get('/v1/x'));
      assert.equal(calls.length, 1, `status ${status}`);
    }
  });

  test('never retries POST or PATCH', async () => {
    for (const run of [(c: ApiClient) => c.post('/v1/tickets', {}), (c: ApiClient) => c.patch('/v1/x', {})]) {
      for (const failure of [new TypeError('fetch failed'), apiError(503, 'x'), apiError(429, 'x')]) {
        mock.restoreAll();
        const calls = sequence(failure, ok({}));
        const { client } = makeClient();
        await assert.rejects(run(client));
        assert.equal(calls.length, 1);
      }
    }
  });

  test('a call can opt in or out explicitly', async () => {
    let calls = sequence(apiError(503, 'x'), ok({}));
    await makeClient().client.patch('/v1/x', {}, { idempotent: true });
    assert.equal(calls.length, 2);

    mock.restoreAll();
    calls = sequence(apiError(503, 'x'), ok({}));
    await assert.rejects(makeClient().client.get('/v1/x', { idempotent: false }));
    assert.equal(calls.length, 1);
  });
});

describe('concurrency', () => {
  test('never has more than 6 requests in flight and still completes all of them', async () => {
    let inFlight = 0;
    let peak = 0;
    stubFetch(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 5));
      inFlight--;
      return ok({});
    });
    const { client } = makeClient();

    const results = await Promise.all(Array.from({ length: 20 }, () => client.get('/v1/x')));

    assert.equal(results.length, 20);
    assert.equal(peak, 6);
    assert.equal(inFlight, 0);
  });

  test('a failed call frees its slot', async () => {
    let inFlight = 0;
    let peak = 0;
    stubFetch(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 2));
      inFlight--;
      return apiError(404, 'not_found');
    });
    const { client } = makeClient();

    const results = await Promise.allSettled(Array.from({ length: 15 }, () => client.get('/v1/x')));

    assert.equal(results.filter(r => r.status === 'rejected').length, 15);
    assert.equal(peak, 6);
  });
});

describe('logging', () => {
  const capture = () => {
    const lines: Record<'log' | 'warn' | 'error', string[]> = { log: [], warn: [], error: [] };
    const logger = {
      log: (line: string) => void lines.log.push(line),
      warn: (line: string) => void lines.warn.push(line),
      error: (line: string) => void lines.error.push(line),
    };
    return { lines, logger };
  };

  test('logs the path template, status and request id, never the key, the body or the raw parameters', async () => {
    const { lines, logger } = capture();
    sequence(json(200, { data: { secret: 'response-secret' } }, { 'x-request-id': 'req-abc' }));
    const { client } = makeClient({ logger });

    await client.put('/v1/tags/{name}', { content: 'request-secret' }, { params: { name: 'param-secret' } });

    assert.equal(lines.log.length, 1);
    assert.match(lines.log[0], /^\[API\] PUT \/v1\/tags\/\{name\} 200 \d+ms req=req-abc$/);
    const everything = JSON.stringify(lines);
    for (const secret of [KEY, 'request-secret', 'response-secret', 'param-secret']) {
      assert.ok(!everything.includes(secret), `leaked ${secret}`);
    }
  });

  test('answers the caller handles are plain lines, real failures are errors', async () => {
    for (const [status, level] of [[404, 'log'], [409, 'log'], [400, 'log'], [401, 'error'], [403, 'error'], [500, 'error'], [503, 'error']] as const) {
      mock.restoreAll();
      const { lines, logger } = capture();
      sequence(apiError(status, 'x'));
      const { client } = makeClient({ logger });
      await assert.rejects(client.post('/v1/x', {}));
      assert.equal(lines[level].length, 1, `status ${status}`);
      assert.match(lines[level][0], new RegExp(`^\\[API\\] POST /v1/x ${status} code=x \\d+ms req=req-123$`));
    }
  });

  test('a network failure logs its code', async () => {
    const { lines, logger } = capture();
    sequence(new TypeError('fetch failed'));
    const { client } = makeClient({ logger });

    await assert.rejects(client.post('/v1/x', {}));

    assert.match(lines.error[0], /^\[API\] POST \/v1\/x network \d+ms$/);
  });

  test('warns about slow calls', async () => {
    const { lines, logger } = capture();
    let now = 0;
    mock.method(Date, 'now', () => now);
    stubFetch(async () => {
      now += 1_600;
      return ok({});
    });
    const { client } = makeClient({ logger });

    await client.get('/v1/x');

    assert.equal(lines.warn.length, 1);
    assert.match(lines.warn[0], /\(slow\)$/);
  });
});
