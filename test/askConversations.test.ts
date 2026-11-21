import './support';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { createConversations, CONVERSATION_TTL_MS, MAX_TURNS, type Turn } from '../src/features/ask/conversations';
import { createOpenAiClient } from '../src/services/openai';

const turn = (n: number): Turn => ({ question: `pregunta ${n}`, answer: `respuesta ${n}` });

describe('conversation memory', () => {
  const make = () => {
    let clock = 1_000;
    const conversations = createConversations(CONVERSATION_TTL_MS, MAX_TURNS, () => clock);
    return { conversations, advance: (ms: number) => { clock += ms; } };
  };

  it('remembers the exchanges of an answer, oldest first', () => {
    const { conversations } = make();
    conversations.remember('M1', [turn(1), turn(2)]);
    assert.deepEqual(conversations.recall('M1'), [turn(1), turn(2)]);
  });

  it('knows nothing about a message that is not an answer of the assistant', () => {
    const { conversations } = make();
    assert.deepEqual(conversations.recall('other'), []);
    assert.deepEqual(conversations.recall(null), []);
    assert.deepEqual(conversations.recall(undefined), []);
  });

  it('keeps only the last six exchanges', () => {
    const { conversations } = make();
    conversations.remember('M', [1, 2, 3, 4, 5, 6, 7, 8].map(turn));
    assert.deepEqual(conversations.recall('M'), [3, 4, 5, 6, 7, 8].map(turn));
  });

  it('forgets a conversation after ten minutes', () => {
    const { conversations, advance } = make();
    conversations.remember('M', [turn(1)]);
    advance(CONVERSATION_TTL_MS - 1);
    assert.equal(conversations.recall('M').length, 1);
    advance(1);
    assert.deepEqual(conversations.recall('M'), []);
  });

  it('gives a copy, so a caller cannot change what is remembered', () => {
    const { conversations } = make();
    conversations.remember('M', [turn(1)]);
    conversations.recall('M').push(turn(9));
    assert.deepEqual(conversations.recall('M'), [turn(1)]);
  });

  it('cuts a long answer so a long talk never makes a long request', () => {
    const { conversations } = make();
    conversations.remember('M', [{ question: 'q', answer: 'a'.repeat(1900) }]);
    const [kept] = conversations.recall('M');
    assert.equal(kept.answer.length, 1200);
    assert.ok(kept.answer.endsWith('…'));
  });
});

describe('OpenAI request with history', () => {
  afterEach(() => mock.restoreAll());

  const send = async (history?: Turn[]) => {
    let body: any;
    mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }] }), { status: 200 });
    });
    const client = createOpenAiClient({ apiKey: 'sk-test', model: 'm', baseUrl: 'https://openai.test.invalid/v1' });
    await client.answer({ instructions: 'rules', input: 'y luego?', history, safetyId: 'a' });
    return body;
  };

  it('sends plain text when there is no history', async () => {
    assert.equal((await send()).input, 'y luego?');
    assert.equal((await send([])).input, 'y luego?');
  });

  it('sends the earlier exchanges as turns, then the new question, and keeps the rules apart', async () => {
    const body = await send([turn(1), turn(2)]);
    assert.deepEqual(body.input, [
      { role: 'user', content: 'pregunta 1' },
      { role: 'assistant', content: 'respuesta 1' },
      { role: 'user', content: 'pregunta 2' },
      { role: 'assistant', content: 'respuesta 2' },
      { role: 'user', content: 'y luego?' },
    ]);
    assert.equal(body.instructions, 'rules');
    assert.equal(body.store, false);
  });
});
