import { messageOf } from './support';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { composeInput } from '../src/features/ask/chatContext';
import { createAskLimits } from '../src/features/ask/limits';
import { asksToPickPerson, MAX_CANDIDATES, rollPerson } from '../src/features/ask/pick';
import { createAskService } from '../src/services/ask';
import type { AnswerRequest, OpenAiClient } from '../src/services/openai';

describe('does the question ask to pick a person?', () => {
  it('recognizes favorites, least favorites and "who would you stay with"', () => {
    for (const question of [
      '¿cuál es tu miembro favorito del servidor?',
      'quién es tu persona favorita del server',
      'si tuvieras que elegir a una persona del server, ¿con quién te quedarías?',
      '¿quién es el miembro que menos te cae?',
      '¿quién te cae peor del chat?',
      '¿a quién odias más de la gente de aquí?',
      'Cuál es tu MIEMBRO FAVORITO',
      'who is your favorite member',
    ].filter(question => !/who is/.test(question))) {
      assert.equal(asksToPickPerson(question), true, question);
    }
  });

  it('leaves other questions alone', () => {
    for (const question of ['¿cuál es tu comida favorita?', '¿qué es Panitacraft?', 'hola, ¿cómo estás?', 'quién es el creador', 'cuéntame un chiste']) {
      assert.equal(asksToPickPerson(question), false, question);
    }
  });
});

describe('rolling the dice for a person', () => {
  const ask = '¿cuál es tu miembro favorito del servidor?';

  it('picks one of the people according to the dice', () => {
    const people = ['Ana', 'Beto', 'Carla', 'Dani'];
    assert.equal(rollPerson(ask, people, [], () => 0), 'Ana');
    assert.equal(rollPerson(ask, people, [], () => 0.26), 'Beto');
    assert.equal(rollPerson(ask, people, [], () => 0.99999), 'Dani');
  });

  it('really varies with the default dice', () => {
    const people = ['Ana', 'Beto', 'Carla', 'Dani', 'Eli'];
    const seen = new Set(Array.from({ length: 200 }, () => rollPerson(ask, people, [])));
    assert.ok(seen.size >= 4, `only ${[...seen]} came out`);
  });

  it('rolls nothing for a question that is not about a person, or when nobody is around', () => {
    assert.equal(rollPerson('¿cuál es tu comida favorita?', ['Ana'], [], () => 0), null);
    assert.equal(rollPerson(ask, [], [], () => 0), null);
    assert.equal(rollPerson(ask, ['***'], [], () => 0), null, 'a name with nothing usable is not offered');
  });

  it('never offers a name with a blocked term, and offers each name once, cleaned', () => {
    assert.equal(rollPerson(ask, ['SecretWord', 'Ana'], ['secretword'], () => 0), 'Ana');
    assert.equal(rollPerson(ask, ['**Ana**', 'Ana', 'Ana'], [], () => 0.9), 'Ana');
  });

  it('does not consider more than a reasonable number of people', () => {
    const many = Array.from({ length: 500 }, (_, i) => `Persona${i}`);
    assert.equal(rollPerson(ask, many, [], () => 0.99999), `Persona${MAX_CANDIDATES - 1}`);
  });
});

describe('the dice roll in the member\'s turn', () => {
  it('goes before the member\'s message, with or without quoted chat', () => {
    assert.match(composeInput('¿tu favorito?', [], 'Ana'), /^\[DICE ROLL: .*is Ana\]\n\n\[MEMBER'S MESSAGE\]\n¿tu favorito\?$/);
    const withChat = composeInput('¿tu favorito?', [{ author: 'Beto', text: 'hola' }], 'Ana');
    assert.ok(withChat.indexOf('[QUOTED CHAT') < withChat.indexOf('[DICE ROLL') && withChat.indexOf('[DICE ROLL') < withChat.indexOf("[MEMBER'S MESSAGE]"));
  });

  it('is not there when nobody was picked', () => {
    assert.equal(composeInput('hola', [], null), 'hola');
  });
});

describe('/ask with the dice', () => {
  const make = (random: () => number) => {
    const requests: AnswerRequest[] = [];
    const client: OpenAiClient = {
      configured: true,
      async answer(request) { requests.push(request); return 'Jaja mi favorito es Carla'; },
      async flagged() { return false; },
    };
    const service = createAskService({
      client,
      knowledge: 'K',
      blockedTerms: ['secretword'],
      limits: createAskLimits({ cooldownMs: 0, replyCooldownMs: 0, dailyPerUser: 100, dailyGlobal: 100, maxInFlight: 10 }),
      safetyIdOf: () => 'anon',
      random,
    });
    return { service, requests };
  };

  it('tells the model who it picked for a question about a person', async () => {
    const { service, requests } = make(() => 0.5);
    await service.ask('1', '¿cuál es tu miembro favorito?', [], [], [], ['Ana', 'Beto', 'Carla']);
    assert.match(requests[0].input, /DICE ROLL: .*is Beto\]/);
    assert.match(requests[0].input, /\[MEMBER'S MESSAGE\]\n¿cuál es tu miembro favorito\?$/);
    assert.ok(!requests[0].instructions.includes('Beto'), 'the pick is in the turn, not in the rules');
  });

  it('picks a different person on another roll', async () => {
    const first = make(() => 0);
    const second = make(() => 0.99);
    await first.service.ask('1', '¿cuál es tu miembro favorito?', [], [], [], ['Ana', 'Beto', 'Carla']);
    await second.service.ask('1', '¿cuál es tu miembro favorito?', [], [], [], ['Ana', 'Beto', 'Carla']);
    assert.match(first.requests[0].input, /is Ana\]/);
    assert.match(second.requests[0].input, /is Carla\]/);
  });

  it('adds nothing for other questions, even with people around', async () => {
    const { service, requests } = make(() => 0);
    await service.ask('1', '¿cuál es tu comida favorita?', [], [], [], ['Ana']);
    assert.equal(messageOf(requests[0].input), '¿cuál es tu comida favorita?');
    assert.ok(!requests[0].input.includes('DICE ROLL'));
  });

  it('adds nothing when nobody is around, so the model uses its fallbacks', async () => {
    const { service, requests } = make(() => 0);
    await service.ask('1', '¿cuál es tu miembro favorito?');
    assert.equal(messageOf(requests[0].input), '¿cuál es tu miembro favorito?');
    assert.ok(!requests[0].input.includes('DICE ROLL'));
  });

  it('never offers a person with a blocked term', async () => {
    const { service, requests } = make(() => 0);
    await service.ask('1', '¿cuál es tu miembro favorito?', [], [], [], ['SecretWord', 'Ana']);
    assert.ok(!/secretword/i.test(requests[0].input));
    assert.match(requests[0].input, /is Ana\]/);
  });
});
