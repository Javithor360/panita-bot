import { afterEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { ApiClient } from '../src/lib/api/client';
import { ApiError } from '../src/lib/api/errors';
import { verifyApiAccess } from '../src/lib/api/startup';
import { GENERIC_ERROR, SERVICE_UNAVAILABLE_ERROR, UserError, userMessageFor } from '../src/core/errors';

afterEach(() => mock.restoreAll());

const fakeClient = (result: () => Promise<unknown>) => ({ get: result }) as unknown as ApiClient;

const silenceConsole = () => ({
  log: mock.method(console, 'log', () => {}),
  warn: mock.method(console, 'warn', () => {}),
  error: mock.method(console, 'error', () => {}),
});

describe('verifyApiAccess', () => {
  test('accepts the bot key', async () => {
    const out = silenceConsole();
    assert.equal(await verifyApiAccess(fakeClient(async () => ({ client: 'bot' }))), true);
    assert.equal(out.log.mock.calls[0].arguments[0], '[API] Connected as bot');
  });

  test('rejects the key of another client', async () => {
    const out = silenceConsole();
    assert.equal(await verifyApiAccess(fakeClient(async () => ({ client: 'web' }))), false);
    assert.match(String(out.error.mock.calls[0].arguments[0]), /"web" client/);
  });

  test('rejects a key the API refuses, without printing it', async () => {
    const out = silenceConsole();
    for (const status of [401, 403]) {
      const ok = await verifyApiAccess(fakeClient(async () => { throw new ApiError(status, 'unauthenticated', 'x', undefined, 'req-1'); }));
      assert.equal(ok, false);
    }
    assert.match(String(out.error.mock.calls[0].arguments[0]), /req=req-1/);
  });

  test('starts anyway when the API is unreachable or failing', async () => {
    const out = silenceConsole();
    for (const error of [new ApiError(0, 'network', 'x'), new ApiError(0, 'timeout', 'x'), new ApiError(503, 'http_503', 'x'), new ApiError(500, 'internal_error', 'x')]) {
      assert.equal(await verifyApiAccess(fakeClient(async () => { throw error; })), true);
    }
    assert.equal(out.warn.mock.callCount(), 4);
    assert.equal(out.error.mock.callCount(), 0);
  });
});

describe('userMessageFor with API errors', () => {
  test('a transient failure shows the unavailable message', () => {
    silenceConsole();
    for (const status of [0, 429, 500, 502, 503, 504]) {
      assert.equal(userMessageFor(new ApiError(status, 'x', 'x'), 'tag', 'Slash'), SERVICE_UNAVAILABLE_ERROR, `status ${status}`);
    }
  });

  test('a rejected key or an unhandled 4xx shows the generic error and is logged', () => {
    const out = silenceConsole();
    for (const status of [400, 401, 403, 404]) {
      assert.equal(userMessageFor(new ApiError(status, 'x', 'x'), 'tag', 'Slash'), GENERIC_ERROR, `status ${status}`);
    }
    assert.equal(out.error.mock.callCount(), 4);
  });

  test('user errors still win', () => {
    assert.equal(userMessageFor(new UserError('hola'), 'tag', 'Slash'), 'hola');
  });
});
