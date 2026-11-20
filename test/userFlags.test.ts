import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import user from '../src/commands/utility/user';
import { parsePrefixArgs, type ParseResult } from '../src/core/prefixParser';

const schema = (user.data.toJSON().options ?? []) as any[];
const values = (raw: string) => {
  const result: ParseResult = parsePrefixArgs(raw, schema);
  assert.equal(result.kind, 'ok', `${raw} -> ${JSON.stringify(result)}`);
  return (result as Extract<ParseResult, { kind: 'ok' }>).values;
};

test('user has one flag for each thing it can show, and each parses on its own', () => {
  for (const flag of ['badges', 'cosmetics', 'permissions']) {
    assert.deepEqual(values(`--${flag}`).get(flag), { type: 'boolean', value: true }, flag);
    assert.deepEqual(values(`Javi --${flag}`).get('buscar'), { type: 'string', value: 'Javi' }, flag);
  }
});

function fakeContext(flags: string[]) {
  return {
    options: {
      getBoolean: (name: string) => (flags.includes(name) ? true : null),
      getString: () => null,
      getUser: () => null,
    },
    user: { id: '1' },
    defer: async () => {},
    guild: {},
    channel: null,
    client: {},
    member: { displayName: 'Javi' },
    customId: () => 'user:pick',
    reply: async () => {},
  } as any;
}

test('two flags at once are refused, naming both', async () => {
  await assert.rejects(
    user.run(fakeContext(['badges', 'permissions'])),
    (error: unknown) => error instanceof Error && /una sola opción a la vez/.test(error.message) && error.message.includes('--badges') && error.message.includes('--permissions'),
  );
});
