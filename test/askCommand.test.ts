import './support';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Message } from 'discord.js';
import { CommandRegistry } from '../src/core/registry';
import { createMessageHandler } from '../src/handlers/messageCreate';
import { parsePrefixArgs } from '../src/core/prefixParser';
import { conversations, createConversations } from '../src/features/ask/conversations';
import { askFromMention, askFromReply } from '../src/features/ask/mention';

const BOT = '123456789012345678';

describe('@mention trigger', () => {
  it('turns "@bot ask <question>" into the prefix command', () => {
    assert.equal(askFromMention(`<@${BOT}> ask ¿Qué es Panitacraft?`, BOT), '!ask ¿Qué es Panitacraft?');
    assert.equal(askFromMention(`<@!${BOT}>   ASK   hola`, BOT), '!ask hola');
    assert.equal(askFromMention(`  <@${BOT}> pregunta cómo me uno`, BOT), '!ask cómo me uno');
  });

  it('keeps line breaks of the question', () => {
    assert.equal(askFromMention(`<@${BOT}> ask una\ndos`, BOT), '!ask una\ndos');
  });

  it('starts the command even with no question, so the usage is shown', () => {
    assert.equal(askFromMention(`<@${BOT}> ask`, BOT), '!ask ');
  });

  it('takes whatever follows the mention as the question, with no need for the word ask', () => {
    assert.equal(askFromMention(`<@${BOT}> hola, ¿cómo estás?`, BOT), '!ask hola, ¿cómo estás?');
    assert.equal(askFromMention(`<@${BOT}>hola`, BOT), '!ask hola', 'even glued to the mention');
    assert.equal(askFromMention(`<@${BOT}> asking about it`, BOT), '!ask asking about it', 'ask only counts as a whole word');
    assert.equal(askFromMention(`<@${BOT}> ping`, BOT), '!ask ping', 'it is a question, not a command');
    assert.equal(askFromMention(`<@${BOT}> ask ask`, BOT), '!ask ask');
  });

  it('does nothing for a mention with nothing after it, and shows the usage for the bare word ask', () => {
    assert.equal(askFromMention(`<@${BOT}>`, BOT), null);
    assert.equal(askFromMention(`  <@!${BOT}>   `, BOT), null);
    assert.equal(askFromMention(`<@${BOT}> ask`, BOT), '!ask ');
  });

  it('ignores a message that does not start with a mention of the bot', () => {
    assert.equal(askFromMention(`hola <@${BOT}> ask algo`, BOT), null, 'the mention must come first');
    assert.equal(askFromMention('<@999999999999999999> ask algo', BOT), null, 'a mention of someone else');
    assert.equal(askFromMention('ask algo', BOT), null);
    assert.equal(askFromMention(`<@${BOT}> ask algo`, undefined), null);
  });
});

describe('reply to an answer', () => {
  const talks = createConversations();
  talks.remember('ANSWER', [{ question: 'hola', answer: 'ey' }]);

  it('continues the talk with what was written, no mention and no command needed', () => {
    assert.equal(askFromReply('¿y qué más?', 'ANSWER', talks), '!ask ¿y qué más?');
    assert.equal(askFromReply('  jaja  ', 'ANSWER', talks), '!ask jaja');
  });

  it('ignores a reply to anything that is not an answer of the assistant, or to nothing', () => {
    assert.equal(askFromReply('¿y qué más?', 'OTHER', talks), null);
    assert.equal(askFromReply('¿y qué más?', null, talks), null);
    assert.equal(askFromReply('¿y qué más?', undefined, talks), null);
  });

  it('leaves a command alone, and an empty message too', () => {
    assert.equal(askFromReply('!ip', 'ANSWER', talks), null);
    assert.equal(askFromReply('   ', 'ANSWER', talks), null);
  });

  it('stops after the conversation expires', () => {
    let clock = 0;
    const old = createConversations(1000, 4, () => clock);
    old.remember('A', [{ question: 'q', answer: 'a' }]);
    assert.equal(askFromReply('hola', 'A', old), '!ask hola');
    clock = 1000;
    assert.equal(askFromReply('hola', 'A', old), null);
  });
});

describe('message handler', () => {
  const handle = async (content: string, author = { bot: false }) => {
    const resolved: string[] = [];
    const registry = { resolve: (name: string) => (resolved.push(name), undefined) } as never;
    const handler = createMessageHandler(registry);
    const message = { author, inGuild: () => true, content, client: { user: { id: BOT } } } as unknown as Message;
    await handler(message);
    return resolved;
  };

  it('resolves the ask command from a mention, with or without the word ask, and only that command', async () => {
    assert.deepEqual(await handle(`<@${BOT}> ask hola`), ['ask']);
    assert.deepEqual(await handle(`<@${BOT}> hola`), ['ask']);
    assert.deepEqual(await handle(`<@${BOT}> ping`), ['ask'], 'a mention never runs another command');
    assert.deepEqual(await handle(`<@${BOT}>`), []);
    assert.deepEqual(await handle('!ask hola'), ['ask']);
  });

  it('resolves ask for a reply to a remembered answer, from anyone, and for nothing else', async () => {
    conversations.remember('REMEMBERED', [{ question: 'hola', answer: 'ey' }]);
    const reply = async (content: string, messageId: string | null) => {
      const resolved: string[] = [];
      const registry = { resolve: (name: string) => (resolved.push(name), undefined) } as never;
      const message = {
        author: { bot: false, id: 'someone-else' },
        inGuild: () => true,
        content,
        reference: messageId ? { messageId } : null,
        client: { user: { id: BOT } },
      } as unknown as Message;
      await createMessageHandler(registry)(message);
      return resolved;
    };

    assert.deepEqual(await reply('¿y luego?', 'REMEMBERED'), ['ask']);
    assert.deepEqual(await reply('¿y luego?', 'NOT-AN-ANSWER'), []);
    assert.deepEqual(await reply('¿y luego?', null), []);
    assert.deepEqual(await reply('!tps', 'REMEMBERED'), ['tps'], 'a command in a reply is still that command');
  });

  it('never answers a bot', async () => {
    assert.deepEqual(await handle(`<@${BOT}> ask hola`, { bot: true }), []);
  });
});

describe('/ask command', () => {
  const registry = new CommandRegistry();
  const command = registry.resolve('ask')!;

  it('is registered with its prefix aliases', () => {
    assert.equal(registry.resolve('pregunta'), command);
    assert.equal(registry.resolve('preguntar'), command);
    assert.equal(command.data.name, 'ask');
  });

  it('takes the rest of a prefix message as the question', () => {
    const parsed = parsePrefixArgs('¿Qué es\nPanitacraft?', registry.schemaOf(command), { hasFallback: false, attachmentCount: 0 });
    assert.equal(parsed.kind, 'ok');
    if (parsed.kind === 'ok') assert.deepEqual(parsed.values.get('prompt'), { type: 'string', value: '¿Qué es\nPanitacraft?' });
  });

  it('asks for the question when there is none', () => {
    const parsed = parsePrefixArgs('', registry.schemaOf(command), { hasFallback: false, attachmentCount: 0 });
    assert.equal(parsed.kind, 'error');
  });
});
