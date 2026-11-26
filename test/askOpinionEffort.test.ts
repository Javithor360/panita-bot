import './support';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { createAskLimits } from '../src/features/ask/limits';
import { createAskService } from '../src/services/ask';
import { createOpenAiClient, type AnswerRequest, type OpenAiClient } from '../src/services/openai';

afterEach(() => mock.restoreAll());

const BASE = 'https://openai.test.invalid/v1';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const text = (value: string) => json(200, { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: value }] }] });

const stub = (...answers: Response[]) => {
  const bodies: any[] = [];
  let next = 0;
  mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return answers[Math.min(next++, answers.length - 1)].clone();
  });
  return bodies;
};

describe('the effort of one request', () => {
  const client = (config: Partial<Parameters<typeof createOpenAiClient>[0]> = {}) =>
    createOpenAiClient({ apiKey: 'sk-test', model: 'm', baseUrl: BASE, timeoutMs: 1000, logger: { warn: () => {} }, ...config });

  it('takes the one of the request instead of the one of the client', async () => {
    const bodies = stub(text('Hola'));
    await client({ reasoningEffort: 'low' }).answer({ instructions: 'r', input: 'a', safetyId: 'a', effort: 'medium' });
    assert.deepEqual(bodies[0].reasoning, { effort: 'medium' });
  });

  it('uses the one of the client when the request has none', async () => {
    const bodies = stub(text('Hola'));
    await client({ reasoningEffort: 'low' }).answer({ instructions: 'r', input: 'a', safetyId: 'a' });
    assert.deepEqual(bodies[0].reasoning, { effort: 'low' });
  });

  it('can ask for thinking even when the client has none set', async () => {
    const bodies = stub(text('Hola'));
    await client().answer({ instructions: 'r', input: 'a', safetyId: 'a', effort: 'medium' });
    assert.deepEqual(bodies[0].reasoning, { effort: 'medium' });
  });

  it('is dropped, like any effort, once the model has refused them', async () => {
    const refusal = json(400, { error: { code: 'unsupported_value', type: 'invalid_request_error', param: 'reasoning.effort' } });
    const bodies = stub(refusal, text('Hola'), text('Otra'));
    const openAi = client();
    await openAi.answer({ instructions: 'r', input: 'a', safetyId: 'a', effort: 'medium' });
    await openAi.answer({ instructions: 'r', input: 'b', safetyId: 'a', effort: 'medium' });
    assert.deepEqual(bodies.map(body => body.reasoning), [{ effort: 'medium' }, undefined, undefined]);
  });

  it('goes down from the effort of the request when the thinking used up the answer', async () => {
    const cutShort = json(200, { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'reasoning', summary: [] }] });
    const bodies = stub(cutShort, text('Ya sí'));
    assert.equal(await client({ reasoningEffort: 'low' }).answer({ instructions: 'r', input: 'a', safetyId: 'a', effort: 'high' }), 'Ya sí');
    assert.deepEqual(bodies.map(body => body.reasoning), [{ effort: 'high' }, { effort: 'medium' }]);
  });
});

describe('/ask with more thinking for opinions', () => {
  const make = (opinionEffort?: 'medium' | 'high') => {
    const requests: AnswerRequest[] = [];
    const fake: OpenAiClient = {
      configured: true,
      async answer(request) { requests.push(request); return 'Jaja'; },
      async route() { return { lookups: [] }; },
      async flagged() { return false; },
      async flaggedEach(texts) { return texts.map(() => false); },
    };
    const service = createAskService({
      client: fake,
      knowledge: 'K',
      blockedTerms: [],
      limits: createAskLimits({ cooldownMs: 0, replyCooldownMs: 0, dailyPerUser: 100, dailyGlobal: 100, maxInFlight: 10 }),
      safetyIdOf: () => 'anon',
      random: () => 0,
      ...(opinionEffort ? { opinionEffort } : {}),
    });
    return { service, requests };
  };

  it('asks for the opinion effort on an opinion or a rating', async () => {
    const { service, requests } = make('medium');
    await service.ask('1', 'del 1 al 10 que tan chad es fiendrox?');
    assert.equal(requests[0].effort, 'medium');
  });

  it('asks for nothing special on a factual question or small talk, which keep the effort of the client', async () => {
    const { service, requests } = make('high');
    await service.ask('1', '¿cuándo abre Enriquecraft 666?');
    await service.ask('1', 'hola, ¿cómo estás?');
    assert.equal(requests[0].effort, undefined);
    assert.equal(requests[1].effort, undefined);
  });

  it('asks for nothing special when no opinion effort is set (same as the client)', async () => {
    const { service, requests } = make();
    await service.ask('1', '¿qué opinas de Ana?');
    assert.equal(requests[0].effort, undefined);
  });
});
