import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrefixArgs, type ParseResult, type ParsedValue } from '../src/core/prefixParser';
import ban from '../src/commands/moderation/ban';
import clear from '../src/commands/moderation/clear';
import hide from '../src/commands/moderation/hide';
import mute from '../src/commands/moderation/mute';
import unwarn from '../src/commands/moderation/unwarn';
import warn from '../src/commands/moderation/warn';
import { splitTimeAndReason } from '../src/features/moderation/duration';

/** The schema of a real command, so these tests break when its options change. */
const schemaOf = (command: { data: { toJSON(): { options?: unknown[] } } }) => (command.data.toJSON().options ?? []) as any[];

const values = (result: ParseResult) => {
  assert.equal(result.kind, 'ok', `expected ok, got ${JSON.stringify(result)}`);
  return (result as Extract<ParseResult, { kind: 'ok' }>).values;
};
const at = (result: ParseResult, name: string): ParsedValue | undefined => values(result).get(name);

const ANA = '<@123456789012345678>';

test('warn: the member, then everything else is the reason', () => {
  const result = parsePrefixArgs(`${ANA} spam en #general\nde nuevo`, schemaOf(warn));
  assert.deepEqual(at(result, 'usuario'), { type: 'user', id: '123456789012345678' });
  assert.deepEqual(at(result, 'razon'), { type: 'string', value: 'spam en #general\nde nuevo' });
});

test('warn: without a reason the parser asks for it', () => {
  const result = parsePrefixArgs(ANA, schemaOf(warn));
  assert.equal(result.kind === 'error' && result.reason, 'missing_option');
  assert.equal(result.kind === 'error' && result.option, 'razon');
});

test('ban: works with a plain id, which is how someone who left is banned', () => {
  const result = parsePrefixArgs('123456789012345678 spam de links', schemaOf(ban));
  assert.deepEqual(at(result, 'usuario'), { type: 'user', id: '123456789012345678' });
  assert.deepEqual(at(result, 'razon'), { type: 'string', value: 'spam de links' });
  assert.equal(at(result, 'dias'), undefined);
});

test('ban: a number before the reason is the days of messages to delete', () => {
  const result = parsePrefixArgs(`${ANA} 3 spam`, schemaOf(ban));
  assert.deepEqual(at(result, 'dias'), { type: 'integer', value: 3 });
  assert.deepEqual(at(result, 'razon'), { type: 'string', value: 'spam' });

  const tooMany = parsePrefixArgs(`${ANA} 9 spam`, schemaOf(ban));
  assert.equal(tooMany.kind === 'error' && tooMany.reason, 'out_of_range');
});

test('mute: a time then the reason, or just the reason', () => {
  const timed = parsePrefixArgs(`${ANA} 30m spam repetido`, schemaOf(mute));
  assert.deepEqual(at(timed, 'tiempo'), { type: 'string', value: '30m' });
  assert.deepEqual(at(timed, 'razon'), { type: 'string', value: 'spam repetido' });

  // The parser puts the first word in the time; the command moves it back to the reason
  const noTime = parsePrefixArgs(`${ANA} spam en general`, schemaOf(mute));
  assert.deepEqual(at(noTime, 'tiempo'), { type: 'string', value: 'spam' });
  assert.deepEqual(
    splitTimeAndReason((at(noTime, 'tiempo') as any).value, (at(noTime, 'razon') as any).value),
    { durationMs: null, reason: 'spam en general' },
  );
});

test('mute: only the member is enough', () => {
  const result = parsePrefixArgs(ANA, schemaOf(mute));
  assert.deepEqual(at(result, 'usuario'), { type: 'user', id: '123456789012345678' });
  assert.equal(at(result, 'tiempo'), undefined);
});

test('clear: the amount, alone or with a member, within 2 and 100', () => {
  assert.deepEqual(at(parsePrefixArgs('20', schemaOf(clear)), 'cantidad'), { type: 'integer', value: 20 });

  const filtered = parsePrefixArgs(`20 ${ANA}`, schemaOf(clear));
  assert.deepEqual(at(filtered, 'cantidad'), { type: 'integer', value: 20 });
  assert.deepEqual(at(filtered, 'usuario'), { type: 'user', id: '123456789012345678' });

  for (const raw of ['1', '101']) {
    const result = parsePrefixArgs(raw, schemaOf(clear));
    assert.equal(result.kind === 'error' && result.reason, 'out_of_range', raw);
  }
  assert.equal((parsePrefixArgs('', schemaOf(clear)) as any).reason, 'missing_option');
});

test('unwarn: the number of the warning is optional, and the rest is the reason', () => {
  const numbered = parsePrefixArgs(`${ANA} 2 fue un malentendido`, schemaOf(unwarn));
  assert.deepEqual(at(numbered, 'numero'), { type: 'integer', value: 2 });
  assert.deepEqual(at(numbered, 'razon'), { type: 'string', value: 'fue un malentendido' });

  const plain = parsePrefixArgs(ANA, schemaOf(unwarn));
  assert.equal(at(plain, 'numero'), undefined);
});

test('hide: member, an optional channel by mention, then the reason', () => {
  const result = parsePrefixArgs(`${ANA} <#456789012345678901> molesta mucho`, schemaOf(hide));
  assert.deepEqual(at(result, 'usuario'), { type: 'user', id: '123456789012345678' });
  assert.deepEqual(at(result, 'canal'), { type: 'channel', id: '456789012345678901' });
  assert.deepEqual(at(result, 'razon'), { type: 'string', value: 'molesta mucho' });

  const here = parsePrefixArgs(`${ANA} molesta`, schemaOf(hide));
  assert.equal(at(here, 'canal'), undefined);
});
