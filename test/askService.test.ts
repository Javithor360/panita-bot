import './support';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { UserError } from '../src/core/errors';
import { createAskLimits } from '../src/features/ask/limits';
import { ASK_MESSAGES, createAskService, type AskDeps } from '../src/services/ask';
import { OpenAiError, type AnswerRequest, type OpenAiClient } from '../src/services/openai';

const KNOWLEDGE = 'Panitacraft es una comunidad. Web: https://www.panitacraft.com/';

interface FakeOptions {
  answer?: string | Error;
  flagged?: boolean | Error;
  configured?: boolean;
}

const fakeClient = ({ answer = 'Hola', flagged = false, configured = true }: FakeOptions = {}) => {
  const requests: AnswerRequest[] = [];
  const moderated: string[] = [];
  const client: OpenAiClient = {
    configured,
    async answer(request) {
      requests.push(request);
      if (answer instanceof Error) throw answer;
      return answer;
    },
    async flagged(text) {
      moderated.push(text);
      if (flagged instanceof Error) throw flagged;
      return flagged;
    },
  };
  return { client, requests, moderated };
};

const make = (options: FakeOptions = {}, overrides: Partial<AskDeps> = {}) => {
  const fake = fakeClient(options);
  const service = createAskService({
    client: fake.client,
    knowledge: KNOWLEDGE,
    blockedTerms: ['secretword'],
    limits: createAskLimits({ cooldownMs: 0, dailyPerUser: 100, dailyGlobal: 100, maxInFlight: 10 }),
    safetyIdOf: userId => `anon-${userId.length}`,
    ...overrides,
  });
  return { service, ...fake };
};

const userError = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof UserError, `expected a UserError, got ${String(error)}`);
    return error.message;
  }
  assert.fail('expected a UserError');
};

afterEach(() => mock.restoreAll());

describe('/ask service', () => {
  it('answers with the rules and knowledge in the instructions and only the question as input', async () => {
    const { service, requests } = make({ answer: '¡Hola!' });
    assert.equal((await service.ask('123456789012345678', '  ¿Qué   es Panitacraft? ')).text, '¡Hola!');

    assert.equal(requests.length, 1);
    assert.equal(requests[0].input, '¿Qué es Panitacraft?');
    assert.ok(requests[0].instructions.includes(KNOWLEDGE));
    assert.ok(!requests[0].instructions.includes('Qué es Panitacraft?'), 'the question never gets into the instructions');
  });

  it('sends an anonymous id, never the Discord id', async () => {
    const { service, requests } = make();
    await service.ask('123456789012345678', 'hola');
    assert.ok(!requests[0].safetyId.includes('123456789012345678'));
  });

  it('moderates the question before asking the model', async () => {
    const { service, requests, moderated } = make({ flagged: true });
    assert.equal(await userError(service.ask('1', 'something bad')), ASK_MESSAGES.flagged);
    assert.deepEqual(moderated, ['something bad']);
    assert.equal(requests.length, 0);
  });

  it('says it cannot answer when the moderation cannot run, and does not call the model', async () => {
    const logged: string[] = [];
    mock.method(console, 'error', (message: string) => logged.push(message));
    const { service, requests } = make({ flagged: new OpenAiError('rejected', 'HTTP 403'), answer: 'sigue' });
    assert.equal(await userError(service.ask('1', 'hola')), ASK_MESSAGES.unavailable);
    assert.equal(requests.length, 0, 'an unchecked question is never answered');
    assert.equal(logged.length, 1, 'the cause is logged on every failure');
    assert.ok(!logged[0].includes('hola'));
  });

  it('asks the member to retry when the moderation only timed out, and does not count the question', async () => {
    mock.method(console, 'warn', () => {});
    const { service } = make(
      { flagged: new OpenAiError('timeout') },
      { limits: createAskLimits({ cooldownMs: 0, dailyPerUser: 1, dailyGlobal: 100, maxInFlight: 10 }) },
    );
    assert.equal(await userError(service.ask('1', 'hola')), ASK_MESSAGES.failed);
    assert.equal(await userError(service.ask('1', 'hola')), ASK_MESSAGES.failed, 'the failed one was refunded');
  });

  it('answers a blocked term without the model', async () => {
    const { service, requests, moderated } = make();
    assert.equal((await service.ask('1', '¿Qué es SecretWord?')).text, ASK_MESSAGES.unannounced);
    assert.equal(requests.length, 0);
    assert.equal(moderated.length, 0);
  });

  it('replaces an answer that has a blocked term', async () => {
    const { service } = make({ answer: 'Sí, el secretword sale pronto' });
    assert.equal((await service.ask('1', 'hola')).text, ASK_MESSAGES.noAnswer);
  });

  it('cleans the answer: no pings and no unknown links', async () => {
    const { service } = make({ answer: '@everyone mira https://evil.example y https://www.panitacraft.com/' });
    const { text } = await service.ask('1', 'hola');
    assert.ok(!text.includes('@everyone') && !text.includes('evil.example'));
    assert.ok(text.includes('https://www.panitacraft.com/'));
  });

  it('turns the photo marker into an action and never shows it', async () => {
    const { service } = make({ answer: '¡Claro, mira esta! 📸 [[photo]]' });
    assert.deepEqual(await service.ask('1', 'muéstrame una foto'), { text: '¡Claro, mira esta! 📸', photo: true });
  });

  it('gives a text of its own when the model only asked for the photo', async () => {
    const { service } = make({ answer: '[[photo]]' });
    assert.deepEqual(await service.ask('1', 'una foto'), { text: ASK_MESSAGES.photoOnly, photo: true });
  });

  it('does not send a photo with an answer that was replaced for a blocked term', async () => {
    const { service } = make({ answer: 'secretword [[photo]]' });
    assert.deepEqual(await service.ask('1', 'una foto'), { text: ASK_MESSAGES.noAnswer, photo: false });
  });

  it('asks for no photo in a normal answer, or in the reply to a blocked question', async () => {
    assert.equal((await make({ answer: 'Hola' }).service.ask('1', 'hola')).photo, false);
    assert.equal((await make().service.ask('1', 'secretword')).photo, false);
  });

  it('validates the question before spending anything', async () => {
    const { service, requests } = make();
    assert.equal(await userError(service.ask('1', '   ')), ASK_MESSAGES.empty);
    assert.equal(await userError(service.ask('1', 'a'.repeat(501))), ASK_MESSAGES.tooLong);
    assert.equal(requests.length, 0);
  });

  it('says it is unavailable without a key and calls nothing', async () => {
    const { service, requests, moderated } = make({ configured: false });
    assert.equal(await userError(service.ask('1', 'hola')), ASK_MESSAGES.unavailable);
    assert.equal(requests.length + moderated.length, 0);
  });

  it('applies the limits, and an invalid question does not use them up', async () => {
    const { service } = make({}, { limits: createAskLimits({ cooldownMs: 60_000, dailyPerUser: 100, dailyGlobal: 100, maxInFlight: 10 }) });
    await userError(service.ask('1', ''));
    assert.equal((await service.ask('1', 'hola')).text, 'Hola');
    assert.equal(await userError(service.ask('1', 'otra')), ASK_MESSAGES.cooldown);
  });

  it('shows a friendly message when the provider fails, and does not count the question', async () => {
    mock.method(console, 'warn', () => {});
    const { service } = make(
      { answer: new OpenAiError('timeout') },
      { limits: createAskLimits({ cooldownMs: 0, dailyPerUser: 1, dailyGlobal: 100, maxInFlight: 10 }) },
    );
    assert.equal(await userError(service.ask('1', 'hola')), ASK_MESSAGES.failed);
    // The failed one was refunded, so the only question of the day is still free
    assert.equal(await userError(service.ask('1', 'hola')), ASK_MESSAGES.failed);
  });

  it('reports a rejected key or an exhausted spending limit as unavailable, and logs the cause', async () => {
    const logged: string[] = [];
    mock.method(console, 'error', (message: string) => logged.push(message));
    for (const failure of ['rejected', 'quota'] as const) {
      const { service } = make({ answer: new OpenAiError(failure, 'HTTP 4xx') });
      assert.equal(await userError(service.ask('1', 'hola')), ASK_MESSAGES.unavailable);
    }
    assert.equal(logged.length, 2);
    assert.ok(logged.every(line => !line.includes('hola')), 'the question is never logged');
  });

  it('frees its place in the limits after every outcome', async () => {
    mock.method(console, 'warn', () => {});
    const limits = createAskLimits({ cooldownMs: 0, dailyPerUser: 100, dailyGlobal: 100, maxInFlight: 1 });
    const failing = make({ answer: new OpenAiError('timeout') }, { limits });
    await userError(failing.service.ask('1', 'uno'));
    const flagged = make({ flagged: true }, { limits });
    await userError(flagged.service.ask('1', 'dos'));
    const blocked = make({}, { limits });
    await blocked.service.ask('1', 'secretword');
    const fine = make({}, { limits });
    assert.equal((await fine.service.ask('1', 'tres')).text, 'Hola');
  });
});
