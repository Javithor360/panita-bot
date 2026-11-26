import './support';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  avoidLine,
  createRecentJokes,
  OPENING_CHARS,
  openingOf,
  RECENT_JOKES,
  RECENT_JOKES_TTL_MS,
} from '../src/features/ask/creativity';
import { createAskLimits } from '../src/features/ask/limits';
import { createAskService } from '../src/services/ask';
import type { AnswerRequest, OpenAiClient } from '../src/services/openai';

describe('the opening of an answer', () => {
  it('is its first sentence', () => {
    assert.equal(openingOf('Un 9.5/10: tiene nombre de jefe final. El resto es música épica.'), 'Un 9.5/10: tiene nombre de jefe final.');
    assert.equal(openingOf('¿En serio? Pues sí. Y más.'), '¿En serio?');
  });

  it('has no emoji codes of the server, line breaks or extra spaces', () => {
    assert.equal(openingOf('Jaja  :feliz:\nqué bueno :llorando: eso.'), 'Jaja qué bueno eso.');
  });

  it('is cut when it is long, and empty when there is nothing', () => {
    const long = openingOf('a'.repeat(400));
    assert.equal(long.length, OPENING_CHARS);
    assert.ok(long.endsWith('…'));
    assert.equal(openingOf('   '), '');
    assert.equal(openingOf(':feliz:'), '');
  });
});

describe('the memory of recent jokes', () => {
  const make = (max = RECENT_JOKES) => {
    let clock = 1_000;
    const recent = createRecentJokes(max, RECENT_JOKES_TTL_MS, () => clock);
    return { recent, advance: (ms: number) => { clock += ms; } };
  };

  it('lists the newest first', () => {
    const { recent } = make();
    recent.remember('Uno. Resto.');
    recent.remember('Dos. Resto.');
    assert.deepEqual(recent.list(), ['Dos.', 'Uno.']);
  });

  it('keeps only the last few', () => {
    const { recent } = make(3);
    for (const word of ['a', 'b', 'c', 'd', 'e']) recent.remember(`${word}.`);
    assert.deepEqual(recent.list(), ['e.', 'd.', 'c.']);
    assert.equal(RECENT_JOKES, 8);
  });

  it('does not list the same opening twice, and moves a repeated one to the front', () => {
    const { recent } = make();
    recent.remember('Uno.');
    recent.remember('Dos.');
    recent.remember('Uno. Otra cosa.');
    assert.deepEqual(recent.list(), ['Uno.', 'Dos.']);
  });

  it('forgets a joke after an hour', () => {
    const { recent, advance } = make();
    recent.remember('Viejo.');
    advance(RECENT_JOKES_TTL_MS - 1);
    assert.deepEqual(recent.list(), ['Viejo.']);
    advance(2);
    assert.deepEqual(recent.list(), []);
  });

  it('ignores an answer with nothing to keep', () => {
    const { recent } = make();
    recent.remember('');
    recent.remember(':feliz:');
    assert.deepEqual(recent.list(), []);
  });
});

describe('what is told to the model about them', () => {
  it('lists them as things not to repeat, in any form', () => {
    const line = avoidLine(['Un 9.5/10.', 'Nombre de jefe final.'])!;
    assert.match(line, /^\[ALREADY USED RECENTLY: do not repeat these jokes, images or openings in any form/);
    assert.ok(line.includes('"Un 9.5/10." | "Nombre de jefe final."'));
  });

  it('says nothing when there are none', () => {
    assert.equal(avoidLine([]), null);
  });
});

describe('/ask with the memory of jokes', () => {
  const make = (answers: string[]) => {
    const requests: AnswerRequest[] = [];
    const client: OpenAiClient = {
      configured: true,
      async answer(request) { requests.push(request); return answers.shift() ?? 'Jaja'; },
      async route() { return { lookups: [] }; },
      async flagged() { return false; },
      async flaggedEach(texts) { return texts.map(() => false); },
    };
    const service = createAskService({
      client,
      knowledge: 'K',
      blockedTerms: [],
      limits: createAskLimits({ cooldownMs: 0, replyCooldownMs: 0, dailyPerUser: 100, dailyGlobal: 100, maxInFlight: 10 }),
      safetyIdOf: () => 'anon',
      random: () => 0,
    });
    return { service, requests };
  };

  const OPINION = 'del 1 al 10 que tan chad es fiendrox?';

  it('tells the model the opening of the last opinion answer when it is asked for the next one', async () => {
    const { service, requests } = make(['Un 9.5/10: tiene nombre de jefe final. Más texto.', 'Otra cosa.']);
    await service.ask('1', OPINION);
    await service.ask('2', '¿qué opinas de Ana?');

    assert.ok(!requests[0].input.includes('ALREADY USED'), 'nothing to avoid the first time');
    assert.ok(requests[1].input.includes('[ALREADY USED RECENTLY'));
    assert.ok(requests[1].input.includes('"Un 9.5/10: tiene nombre de jefe final."'));
    assert.ok(!requests[1].input.includes('Más texto'), 'only the opening');
  });

  it('shares the memory between members, since the repetition is across them', async () => {
    const { service, requests } = make(['Primera broma.', 'Segunda broma.', 'Tercera.']);
    await service.ask('1', OPINION);
    await service.ask('2', OPINION);
    await service.ask('3', OPINION);
    assert.ok(requests[2].input.includes('"Primera broma." | "Segunda broma."') || requests[2].input.includes('"Segunda broma." | "Primera broma."'));
    assert.ok(requests[2].input.indexOf('"Segunda broma."') < requests[2].input.indexOf('"Primera broma."'), 'the newest first');
  });

  it('does not remember the answers to other questions, and does not list anything for them', async () => {
    const { service, requests } = make(['Abre mañana.', 'Otra.']);
    await service.ask('1', '¿cuándo abre Enriquecraft 666?');
    await service.ask('2', OPINION);
    assert.ok(!requests[1].input.includes('ALREADY USED'));
    assert.ok(!requests[1].input.includes('Abre mañana'));

    await service.ask('3', '¿cuál es la IP?');
    assert.ok(!requests[2].input.includes('ALREADY USED'), 'a factual question never gets the list');
  });

  it('puts the list after the angle, right before the message', async () => {
    const { service, requests } = make(['Una broma.', 'Otra.']);
    await service.ask('1', OPINION);
    await service.ask('2', OPINION);
    const input = requests[1].input;
    assert.ok(input.indexOf('[STYLE ROLL') < input.indexOf('[ALREADY USED'));
    assert.ok(input.indexOf('[ALREADY USED') < input.indexOf("[MEMBER'S MESSAGE]"));
  });
});
