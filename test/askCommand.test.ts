import './support';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Message } from 'discord.js';
import { CommandRegistry } from '../src/core/registry';
import { createMessageHandler } from '../src/handlers/messageCreate';
import { parsePrefixArgs } from '../src/core/prefixParser';
import { askFromMention } from '../src/features/ask/mention';

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

  it('ignores everything that is not an ask', () => {
    assert.equal(askFromMention(`<@${BOT}> ping`, BOT), null);
    assert.equal(askFromMention(`<@${BOT}> asking about it`, BOT), null);
    assert.equal(askFromMention(`<@${BOT}>`, BOT), null);
    assert.equal(askFromMention(`hola <@${BOT}> ask algo`, BOT), null, 'the mention must come first');
    assert.equal(askFromMention('<@999999999999999999> ask algo', BOT), null, 'a mention of someone else');
    assert.equal(askFromMention('ask algo', BOT), null);
    assert.equal(askFromMention(`<@${BOT}> ask algo`, undefined), null);
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

  it('resolves the ask command from a mention, and nothing else from one', async () => {
    assert.deepEqual(await handle(`<@${BOT}> ask hola`), ['ask']);
    assert.deepEqual(await handle(`<@${BOT}> ping`), []);
    assert.deepEqual(await handle('!ask hola'), ['ask']);
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
