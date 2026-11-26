import './support';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { createOpenAiClient, OpenAiError } from '../src/services/openai';

const BASE = 'https://openai.test.invalid/v1';
const SECRET = 'sk-test-secret';

const client = (apiKey: string | null = SECRET) =>
  createOpenAiClient({ apiKey: apiKey ?? undefined, model: 'test-model', baseUrl: BASE, timeoutMs: 1000 });

interface Call { url: string; init: RequestInit }

/** Answers each call with the next response (the last one repeats; an Error is a network failure). */
const stub = (...answers: Array<Response | Error>) => {
  const calls: Call[] = [];
  let next = 0;
  mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const answer = answers[Math.min(next++, answers.length - 1)];
    if (answer instanceof Error) throw answer;
    return answer.clone();
  });
  return calls;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const message = (text: string) => json(200, { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] });

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof OpenAiError, `expected an OpenAiError, got ${String(error)}`);
    return error.failure;
  }
  assert.fail('expected the call to fail');
};

afterEach(() => mock.restoreAll());

describe('OpenAI client', () => {
  it('sends only text, with the key in the header and nothing stored', async () => {
    const calls = stub(message('Hola'));
    const text = await client().answer({ instructions: 'rules', input: 'hi', safetyId: 'abc' });

    assert.equal(text, 'Hola');
    assert.equal(calls[0].url, `${BASE}/responses`);
    assert.equal((calls[0].init.headers as Record<string, string>).authorization, `Bearer ${SECRET}`);
    const body = JSON.parse(String(calls[0].init.body));
    assert.deepEqual(
      { model: body.model, instructions: body.instructions, input: body.input, store: body.store, safety_identifier: body.safety_identifier },
      { model: 'test-model', instructions: 'rules', input: 'hi', store: false, safety_identifier: 'abc' },
    );
    assert.equal(body.tools, undefined, 'the model is never given tools');
    assert.ok(!JSON.stringify(body).includes(SECRET), 'the key is not part of the body');
  });

  it('joins the text parts and ignores other output items', async () => {
    stub(json(200, {
      output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', content: [{ type: 'output_text', text: 'uno' }, { type: 'output_text', text: 'dos' }] },
      ],
    }));
    assert.equal(await client().answer({ instructions: '', input: 'x', safetyId: 'a' }), 'uno\ndos');
  });

  it('returns a refusal as text', async () => {
    stub(json(200, { output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No puedo.' }] }] }));
    assert.equal(await client().answer({ instructions: '', input: 'x', safetyId: 'a' }), 'No puedo.');
  });

  it('fails as empty when the answer has no text', async () => {
    stub(json(200, { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }));
    assert.equal(await failure(client().answer({ instructions: '', input: 'x', safetyId: 'a' })), 'empty');
  });

  it('does not call out without a key', async () => {
    const calls = stub(message('nope'));
    assert.equal(client(null).configured, false);
    assert.equal(await failure(client(null).answer({ instructions: '', input: 'x', safetyId: 'a' })), 'not_configured');
    assert.equal(calls.length, 0);
  });

  it('tells a spending limit apart from a rate limit', async () => {
    stub(json(429, { error: { code: 'project_spend_limit_exceeded' } }));
    assert.equal(await failure(client().answer({ instructions: '', input: 'x', safetyId: 'a' })), 'quota');
    mock.restoreAll();
    stub(json(429, { error: { code: 'rate_limit_exceeded' } }));
    assert.equal(await failure(client().answer({ instructions: '', input: 'x', safetyId: 'a' })), 'rate_limited');
  });

  it('maps server errors, rejections and network failures', async () => {
    stub(json(503, {}));
    assert.equal(await failure(client().answer({ instructions: '', input: 'x', safetyId: 'a' })), 'unavailable');
    mock.restoreAll();
    stub(json(403, { error: { code: 'insufficient_permissions' } }));
    assert.equal(await failure(client().answer({ instructions: '', input: 'x', safetyId: 'a' })), 'rejected');
    mock.restoreAll();
    stub(new TypeError('fetch failed'));
    assert.equal(await failure(client().answer({ instructions: '', input: 'x', safetyId: 'a' })), 'unavailable');
  });

  it('maps a timeout', async () => {
    stub(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    assert.equal(await failure(client().answer({ instructions: '', input: 'x', safetyId: 'a' })), 'timeout');
  });

  it('never puts the key or the question in an error message', async () => {
    stub(json(400, { error: { code: 'invalid_request' } }));
    try {
      await client().answer({ instructions: 'rules', input: 'my private question', safetyId: 'a' });
      assert.fail('expected the call to fail');
    } catch (error) {
      const text = String((error as Error).message);
      assert.ok(!text.includes(SECRET) && !text.includes('private'));
    }
  });

  it('reads the verdict of the moderation', async () => {
    const calls = stub(json(200, { results: [{ flagged: true }] }), json(200, { results: [{ flagged: false }] }));
    assert.equal(await client().flagged('bad'), true);
    assert.equal(await client().flagged('fine'), false);
    assert.equal(calls[0].url, `${BASE}/moderations`);
  });

  it('moderates several texts in one call and answers once for each, in order', async () => {
    const calls = stub(json(200, { results: [{ flagged: false }, { flagged: true }, { flagged: false }] }));
    assert.deepEqual(await client().flaggedEach(['uno', 'dos', 'tres']), [false, true, false]);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${BASE}/moderations`);
    assert.deepEqual(JSON.parse(String(calls[0].init.body)).input, ['uno', 'dos', 'tres']);
  });

  it('makes no call for no texts', async () => {
    const calls = stub(json(200, { results: [] }));
    assert.deepEqual(await client().flaggedEach([]), []);
    assert.equal(calls.length, 0);
  });

  it('does not guess when the moderation answers another number of results', async () => {
    stub(json(200, { results: [{ flagged: false }] }));
    assert.equal(await failure(client().flaggedEach(['uno', 'dos'])), 'empty');
  });
});
