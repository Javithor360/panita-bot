import './support';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { composeInput } from '../src/features/ask/chatContext';
import { ANGLES, angleLine, asksForOpinion, rollAngle } from '../src/features/ask/creativity';
import { createAskLimits } from '../src/features/ask/limits';
import { createAskService } from '../src/services/ask';
import type { AnswerRequest, OpenAiClient } from '../src/services/openai';

// ── Which questions get an angle ─────────────────────────────────────────────────────────────────────────────────

describe('questions that ask for an opinion', () => {
  it('recognizes ratings, opinions, comparisons and roasts, with or without accents', () => {
    for (const question of [
      'del 1 al 10 que tan chad es fiendrox?',
      'Del 1 al 10, ¿qué tan crack es Ana?',
      'qué tan gracioso es beto',
      '¿qué opinas de Ana?',
      'qué piensas de minecraft',
      '¿qué te parece el nuevo server?',
      'cómo ves a Beto',
      'califica a Ana',
      'puntúa a mi amigo',
      'quién es más pro, Ana o Beto?',
      'es más gracioso que Beto',
      'roastea a Ana',
      'Ana es un 7/10',
      'dame un ranking de los mejores',
    ]) {
      assert.equal(asksForOpinion(question), true, question);
    }
  });

  it('leaves factual questions and small talk without an angle', () => {
    for (const question of [
      '¿cuándo abre Enriquecraft 666?',
      '¿cuál es la IP del servidor?',
      '¿qué es Panita Client?',
      '¿cómo me uno al servidor?',
      'hola, ¿cómo estás?',
      '¿cuál es tu comida favorita?',
      '¿cuántos emblemas tiene Ana?',
      'puedes decir cuando abre Enriquecraft 666?',
    ]) {
      assert.equal(asksForOpinion(question), false, question);
    }
  });
});

// ── The angle ────────────────────────────────────────────────────────────────────────────────────────────────────

describe('the comedic angle', () => {
  it('has plenty of different angles, none empty or repeated', () => {
    assert.ok(ANGLES.length >= 20);
    assert.equal(new Set(ANGLES).size, ANGLES.length);
    for (const angle of ANGLES) assert.ok(angle.trim().length > 10, angle);
  });

  it('is rolled only for an opinion, and is null for any other question', () => {
    assert.ok(rollAngle('del 1 al 10 que tan chad es fiendrox?', () => 0));
    assert.equal(rollAngle('¿cuándo abre Enriquecraft 666?', () => 0), null);
  });

  it('follows the dice: every angle can come up, and the ends of the range are safe', () => {
    const question = '¿qué opinas de Ana?';
    const seen = new Set(ANGLES.map((_, index) => rollAngle(question, () => (index + 0.5) / ANGLES.length)));
    assert.equal(seen.size, ANGLES.length);
    assert.equal(rollAngle(question, () => 0), ANGLES[0]);
    assert.equal(rollAngle(question, () => 0.999999), ANGLES[ANGLES.length - 1]);
    assert.equal(rollAngle(question, () => 1), ANGLES[ANGLES.length - 1], 'a roll of exactly 1 still lands on an angle');
  });

  it('gives different answers on different rolls of the same question, which is the point', () => {
    const question = 'del 1 al 10 que tan chad es fiendrox?';
    const rolls = [0.05, 0.3, 0.55, 0.8].map(value => rollAngle(question, () => value));
    assert.equal(new Set(rolls).size, 4);
  });

  it('is told to the model as style only, obviously fiction, with the limits unchanged', () => {
    const line = angleLine('a pirate captain\'s log entry')!;
    assert.match(line, /^\[STYLE ROLL: /);
    assert.match(line, /pirate captain's log entry/);
    assert.match(line, /only the style/);
    assert.match(line, /obviously fiction/);
    assert.match(line, /the facts, the limits and what you may say about people stay exactly the same/);
    assert.equal(angleLine(null), null);
  });

  it('goes right before the message of the member, after the data', () => {
    const input = composeInput('¿qué opinas de Ana?', [], null, '[DATOS: x]', ['[TODAY: y]'], [angleLine('a movie trailer voice-over')]);
    const order = ['[TODAY: y]', '[DATOS: x]', '[STYLE ROLL', "[MEMBER'S MESSAGE]"].map(part => input.indexOf(part));
    assert.ok(order.every(position => position >= 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });

  it('leaves a plain question alone when there is no angle', () => {
    assert.equal(composeInput('hola', [], null, null, [], [null]), 'hola');
  });
});

// ── The service ──────────────────────────────────────────────────────────────────────────────────────────────────

describe('/ask with the comedic angle', () => {
  const make = (random: () => number) => {
    const requests: AnswerRequest[] = [];
    const client: OpenAiClient = {
      configured: true,
      async answer(request) { requests.push(request); return 'Jaja'; },
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
      random,
    });
    return { service, requests };
  };

  it('puts a rolled angle in the turn of an opinion question, before the message', async () => {
    const { service, requests } = make(() => 0);
    await service.ask('1', 'del 1 al 10 que tan chad es fiendrox?');
    assert.ok(requests[0].input.includes(`take this comedic angle: ${ANGLES[0]}`));
    assert.ok(requests[0].input.endsWith("[MEMBER'S MESSAGE]\ndel 1 al 10 que tan chad es fiendrox?"));
  });

  it('rolls again for every question, so the same question gets a different angle', async () => {
    const rolls = [0.1, 0.6];
    const { service, requests } = make(() => rolls.shift() ?? 0);
    await service.ask('1', 'del 1 al 10 que tan chad es fiendrox?');
    await service.ask('1', 'del 1 al 10 que tan chad es fiendrox?');
    const angleOf = (input: string) => /comedic angle: (.*?)\. It is only/.exec(input)?.[1];
    assert.notEqual(angleOf(requests[0].input), angleOf(requests[1].input));
  });

  it('adds no angle to a factual question', async () => {
    const { service, requests } = make(() => 0);
    await service.ask('1', '¿cuándo abre Enriquecraft 666?');
    assert.ok(!requests[0].input.includes('STYLE ROLL'));
  });

  it('keeps the angle out of what is remembered for the next reply', async () => {
    const { service } = make(() => 0);
    const answer = await service.ask('1', 'del 1 al 10 que tan chad es fiendrox?');
    assert.deepEqual(answer.turn, { question: 'del 1 al 10 que tan chad es fiendrox?', answer: 'Jaja' });
  });
});
