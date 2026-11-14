import './support';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tezzlarDays } from '../src/data/tezzlar';
import { buildTezzlarKnowledge, plain } from '../src/features/ask/tezzlarKnowledge';

describe('plain text of Discord markdown', () => {
  it('drops the quote marker, bold, escapes, bullets and padding', () => {
    const padding = String.fromCodePoint(0x2800);
    const text = `>>> **➔ Título**\nTexto con \\- guion\n${padding}◈ Punto *énfasis*`;
    assert.equal(plain(text), '- Título\nTexto con - guion\n- Punto énfasis');
  });

  it('keeps ordinary hyphens and numbers', () => {
    assert.equal(plain('Día 3 - 2x de daño (1.5x)'), 'Día 3 - 2x de daño (1.5x)');
  });
});

describe('Tezzlar III knowledge', () => {
  const text = buildTezzlarKnowledge();

  it('has every day that has content, in order', () => {
    const written = [...text.matchAll(/^### Día (\d+)$/gm)].map(match => Number(match[1]));
    assert.ok(written.length > 20, 'most days have something new');
    assert.deepEqual(written, [...written].sort((a, b) => a - b));
    for (const day of written) assert.ok(tezzlarDays[day], `day ${day} exists in the data`);
  });

  it('writes a section that repeats from the day before only once', () => {
    const mission = 'Conseguir Full Diamante';
    assert.equal(text.split(mission).length - 1, 1, 'the same mission is not repeated on days 2 and 3');
    assert.ok(text.includes('Zombi Apicultor'), 'what is new on a day is there');
  });

  it('covers the lists and the commands of the server', () => {
    for (const heading of ['encantamientos', 'comida con valores cambiados', 'comida nueva', 'recetas', 'minieventos', 'comandos del servidor']) {
      assert.ok(text.includes(heading), heading);
    }
    assert.ok(text.includes('/rewards claim'));
  });

  it('has no Discord markdown or embed padding left, and is a reasonable size', () => {
    for (const leftover of ['>>>', '**', '\\-', String.fromCodePoint(0x2800)]) {
      assert.ok(!text.includes(leftover), `left over: ${JSON.stringify(leftover)}`);
    }
    assert.ok(text.length < 60_000, `${text.length} characters is too much to send with every question`);
  });
});
