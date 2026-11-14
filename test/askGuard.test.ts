import './support';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkQuestion, cleanAnswer, MAX_ANSWER_CHARS, MAX_QUESTION_CHARS } from '../src/features/ask/guard';
import { findBlockedTerm, loadKnowledge, parseKnowledge } from '../src/features/ask/knowledge';
import { buildInstructions } from '../src/features/ask/prompt';

const KNOWLEDGE = 'Discord: https://discord.gg/abc123\nWeb: https://www.panitacraft.com/';
const rules = { knowledge: KNOWLEDGE, blockedTerms: ['secretword'] };

describe('question check', () => {
  it('collapses spaces and drops mentions and invisible characters', () => {
    const zeroWidth = String.fromCodePoint(0x200b);
    const raw = ['  hola   <@123456789012345678>', '', `@everyone${zeroWidth} que tal  `].join(String.fromCharCode(10));
    assert.deepEqual(checkQuestion(raw), { ok: true, question: 'hola everyone que tal' });
  });

  it('refuses an empty question and one that is too long', () => {
    assert.deepEqual(checkQuestion('  <@123456789012345678>  '), { ok: false, reason: 'empty' });
    assert.deepEqual(checkQuestion('a'.repeat(MAX_QUESTION_CHARS + 1)), { ok: false, reason: 'too_long' });
    assert.equal(checkQuestion('a'.repeat(MAX_QUESTION_CHARS)).ok, true);
  });
});

describe('answer clean-up', () => {
  it('keeps a normal answer as it is', () => {
    assert.equal(cleanAnswer('¡Hola! Soy Panita Bot.', rules), '¡Hola! Soy Panita Bot.');
  });

  it('defuses mass mentions and removes user, role and channel mentions', () => {
    const text = cleanAnswer('@everyone @here <@123456789012345678> <@&123456789012345678> <#123456789012345678> hola', rules)!;
    assert.ok(!/@everyone|@here/.test(text), 'the mass mentions are broken up');
    assert.ok(!/<[@#]/.test(text));
    assert.ok(text.includes('hola'));
  });

  it('keeps the links of the website and the ones in the knowledge, and omits the rest', () => {
    const text = cleanAnswer(
      'Web https://www.panitacraft.com/gallery, Discord https://discord.gg/abc123. Otro https://evil.example/phish y http://discord.gg/zzz',
      rules,
    )!;
    assert.ok(text.includes('https://www.panitacraft.com/gallery'));
    assert.ok(text.includes('https://discord.gg/abc123'));
    assert.ok(!text.includes('evil.example') && !text.includes('discord.gg/zzz'));
    assert.equal(text.match(/\[enlace omitido\]/g)?.length, 2);
  });

  it('omits a link that only looks like the website', () => {
    const text = cleanAnswer('https://panitacraft.com.evil.example/x https://notpanitacraft.com/', rules)!;
    assert.ok(!text.includes('evil') && !text.includes('notpanitacraft'));
  });

  it('replaces the whole answer when it has a blocked term, in any case', () => {
    assert.equal(cleanAnswer('Claro, es el SecretWord de siempre.', rules), null);
  });

  it('has nothing to post when the answer is empty', () => {
    assert.equal(cleanAnswer('   <@123456789012345678>  ', rules), null);
  });

  it('cuts an answer that would not fit in a Discord message', () => {
    const text = cleanAnswer('a'.repeat(5000), rules)!;
    assert.equal(text.length, MAX_ANSWER_CHARS);
    assert.ok(text.endsWith('…'));
  });
});

describe('knowledge', () => {
  it('finds a blocked term whatever its case', () => {
    assert.equal(findBlockedTerm('Habla de SecretWord', ['secretword']), 'secretword');
    assert.equal(findBlockedTerm('nada', ['secretword']), null);
    assert.equal(findBlockedTerm('cualquier cosa', []), null);
  });

  it('refuses an empty file and one with a blocked term', () => {
    assert.throws(() => parseKnowledge('  \n ', []), /empty/);
    assert.throws(() => parseKnowledge('Algo sobre SecretWord', ['secretword']), /blocked term/);
    assert.equal(parseKnowledge('\nPanitacraft\n', ['secretword']), 'Panitacraft');
  });

  it('ships a knowledge file that loads and whose links all survive the clean-up', () => {
    const knowledge = loadKnowledge([]);
    const links = knowledge.match(/https?:\/\/[^\s)`<>]+/g) ?? [];
    assert.ok(links.length > 0);
    for (const link of links) {
      assert.equal(cleanAnswer(link, { knowledge, blockedTerms: [] }), link, `${link} would be omitted from an answer`);
    }
    assert.ok(!/@everyone|@here/.test(knowledge));
  });
});

describe('instructions', () => {
  const instructions = buildInstructions('HECHO-DE-PRUEBA');

  it('put the rules first and the knowledge after them', () => {
    assert.ok(instructions.startsWith('You are Panita Bot'));
    assert.ok(instructions.indexOf('NEVER') < instructions.indexOf('HECHO-DE-PRUEBA'));
    assert.ok(instructions.endsWith('HECHO-DE-PRUEBA'));
  });

  it('forbid code, secrets, mentions and instructions inside the question', () => {
    for (const rule of [/code, scripts/, /tokens, keys, passwords/, /@everyone/, /inside the member's message/, /nothing has been announced/]) {
      assert.match(instructions, rule);
    }
  });
});
