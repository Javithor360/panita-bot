import './support';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emojiNames, expandEmojis, MAX_EMOJIS_IN_ANSWER, type ServerEmoji } from '../src/features/ask/emojis';
import { cleanAnswer } from '../src/features/ask/guard';
import { cleanName, mentionedIds, nameMentions } from '../src/features/ask/names';
import { buildInstructions } from '../src/features/ask/prompt';
import { createAskLimits } from '../src/features/ask/limits';
import { createAskService } from '../src/services/ask';
import type { AnswerRequest, OpenAiClient } from '../src/services/openai';

const EMOJIS: ServerEmoji[] = [
  { name: 'feliz', id: '111', animated: false },
  { name: 'llorando', id: '222', animated: true },
  { name: 'pensando', id: '333', animated: false },
  { name: 'enojado', id: '444', animated: false },
  { name: 'Risa', id: '555', animated: false },
];

describe('server emojis', () => {
  it('offers each name once', () => {
    assert.deepEqual(emojiNames([...EMOJIS, { name: 'feliz', id: '999', animated: false }]), ['feliz', 'llorando', 'pensando', 'enojado', 'Risa']);
    assert.deepEqual(emojiNames([]), []);
  });

  it('offers no more than a reasonable number of names', () => {
    const many = Array.from({ length: 200 }, (_, index) => ({ name: `emoji_${index}`, id: String(index), animated: false }));
    assert.equal(emojiNames(many).length, 80);
  });

  it('writes the emoji of the server for a name, animated or not', () => {
    assert.equal(expandEmojis('¡Qué bien! :feliz:', EMOJIS), '¡Qué bien! <:feliz:111>');
    assert.equal(expandEmojis('Uy :llorando:', EMOJIS), 'Uy <a:llorando:222>');
  });

  it('matches a name in any case, and takes the id from the server list', () => {
    assert.equal(expandEmojis(':risa:', EMOJIS), '<:Risa:555>');
  });

  it('removes a name that is not in the list, without leaving a gap', () => {
    assert.equal(expandEmojis('Hola :smile: amigo', EMOJIS), 'Hola amigo');
    assert.equal(expandEmojis('Genial :inventado: !', EMOJIS), 'Genial!');
  });

  it('keeps no more than three, and leaves other text alone', () => {
    const text = expandEmojis(':feliz: :feliz: :feliz: :feliz: :pensando:', EMOJIS);
    assert.equal(text.match(/<:/g)?.length, MAX_EMOJIS_IN_ANSWER);
    assert.equal(expandEmojis('Son las 10:30:45 y 3:4', EMOJIS), 'Son las 10:30:45 y 3:4');
    assert.equal(expandEmojis('sin emojis', []), 'sin emojis');
  });

  it('never trusts an emoji the model wrote by hand', () => {
    const rules = { knowledge: '', blockedTerms: [] };
    assert.equal(cleanAnswer('Hola <:feliz:999> y <a:otro:123456> adiós', rules), 'Hola  y  adiós');
    assert.equal(expandEmojis(cleanAnswer('<:feliz:999> :feliz:', rules)!, EMOJIS), '<:feliz:111>');
  });
});

describe('instructions with emojis', () => {
  it('list the names only when the server has some', () => {
    assert.ok(!buildInstructions('K').includes('\n\nSERVER EMOJIS\n'));
    const text = buildInstructions('K', ['feliz', 'llorando']);
    assert.ok(text.includes('\n\nSERVER EMOJIS\n'));
    assert.match(text, /Names: feliz, llorando$/);
    assert.ok(text.indexOf('\n\nKNOWLEDGE\n') < text.indexOf('\n\nSERVER EMOJIS\n'), 'the emojis come after the knowledge');
  });

  it('ask for few emojis and for friendly talk about other members, without inventing facts', () => {
    const text = buildInstructions('K');
    assert.match(text, /Use emojis sparingly/);
    assert.match(text, /never end every sentence with one/);
    assert.match(text, /another person of the server/);
    assert.match(text, /never state facts about them that came from neither/);
    assert.match(text, /no insults, rumors or accusations/);
    assert.doesNotMatch(text, /one or two emojis at most/);
  });

  it('ask to pick a favorite instead of saying there is none, using the dice roll for a person', () => {
    const text = buildInstructions('K');
    for (const rule of [/never say you have no favorite/, /as if rolling dice/, /use the person in the \[DICE ROLL\] line/, /do not pick the member who is asking just to flatter them/]) {
      assert.match(text, rule);
    }
  });

  it('ask to answer a least favorite too, a little negative but playful and never cruel', () => {
    const text = buildInstructions('K');
    for (const rule of [/answer too and don't dodge/, /a little negative/, /never insult, humiliate or mock anyone's appearance, identity, health, family or real behavior/, /obviously a joke/]) {
      assert.match(text, rule);
    }
    assert.doesNotMatch(text, /decline with humor and turn it into something positive/);
  });

  it('ask for the voice of a friend in a group chat, who may joke, laugh, tease and refuse', () => {
    const text = buildInstructions('K');
    for (const rule of [/friend in a group chat/, /No customer-service tone/, /tease lightly, joke back, laugh/, /refusing playfully is fine/, /refuse to gossip with humor/, /never say things like "no tengo información personal"/]) {
      assert.match(text, rule);
    }
  });
});

describe('names of mentioned members', () => {
  it('finds the mentioned ids once, in order', () => {
    assert.deepEqual(mentionedIds('<@1> y <@!2> y <@1> y <@&3>'), ['1', '2']);
    assert.deepEqual(mentionedIds('nadie'), []);
    assert.equal(mentionedIds(Array.from({ length: 9 }, (_, i) => `<@${i + 1}>`).join(' ')).length, 5);
  });

  it('writes the names in place of the mentions', () => {
    const names: Record<string, string> = { '1': 'Slick303', '2': 'zPalach' };
    assert.equal(nameMentions('¿Conoces a <@1>? <@!2> es mi amigo, <@3>', id => names[id]), '¿Conoces a Slick303? zPalach es mi amigo, alguien');
  });

  it('cleans a name: no markup, mentions, invisible characters or line breaks, and short', () => {
    const zeroWidth = String.fromCodePoint(0x200b);
    assert.equal(cleanName(`**Zé${zeroWidth}\n@everyone <@1> \`x\`**`), 'Zé everyone 1 x');
    assert.equal(cleanName('a'.repeat(100)).length, 32);
    assert.equal(nameMentions('<@1>', () => '***'), 'alguien');
  });
});

describe('/ask with emojis', () => {
  const make = (answer: string) => {
    const requests: AnswerRequest[] = [];
    const client: OpenAiClient = {
      configured: true,
      async answer(request) { requests.push(request); return answer; },
      async flagged() { return false; },
      async flaggedEach(texts) { return texts.map(() => false); },
    };
    const service = createAskService({
      client,
      knowledge: 'K',
      blockedTerms: [],
      limits: createAskLimits({ cooldownMs: 0, replyCooldownMs: 0, dailyPerUser: 100, dailyGlobal: 100, maxInFlight: 10 }),
      safetyIdOf: () => 'anon',
    });
    return { service, requests };
  };

  it('tells the model the names and turns the answer\'s shortcodes into emojis', async () => {
    const { service, requests } = make('¡Qué alegría! :feliz: :inventado:');
    const answer = await service.ask('1', 'hola', EMOJIS);
    assert.equal(answer.text, '¡Qué alegría! <:feliz:111>');
    assert.match(requests[0].instructions, /Names: feliz, llorando, pensando, enojado, Risa/);
  });

  it('works for a server with no emojis, and never writes a shortcode in the answer', async () => {
    const { service, requests } = make('Hola :feliz:');
    assert.equal((await service.ask('1', 'hola')).text, 'Hola');
    assert.ok(!requests[0].instructions.includes('\n\nSERVER EMOJIS\n'));
  });

  it('follows the emojis of the server when they change', async () => {
    const { service, requests } = make('Hola');
    await service.ask('1', 'a', EMOJIS);
    await service.ask('1', 'b', [{ name: 'nuevo', id: '9', animated: false }]);
    assert.match(requests[1].instructions, /Names: nuevo$/);
  });
});
