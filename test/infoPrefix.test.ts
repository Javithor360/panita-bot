import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrefixArgs, type ParseResult, type ParsedValue } from '../src/core/prefixParser';
import { getRegistry } from '../src/core/registry';
import avatar from '../src/commands/utility/avatar';
import info from '../src/commands/utility/info';
import server from '../src/commands/utility/server';
import user from '../src/commands/utility/user';

/** The schema of a real command, so these tests break when its options change. */
const schemaOf = (command: { data: { toJSON(): { options?: unknown[] } } }) => (command.data.toJSON().options ?? []) as any[];

const values = (result: ParseResult) => {
  assert.equal(result.kind, 'ok', `expected ok, got ${JSON.stringify(result)}`);
  return (result as Extract<ParseResult, { kind: 'ok' }>).values;
};
const at = (result: ParseResult, name: string): ParsedValue | undefined => values(result).get(name);

const ANA = '<@123456789012345678>';

test('user: nothing means the person who asked', () => {
  const result = parsePrefixArgs('', schemaOf(user));
  assert.equal(at(result, 'usuario'), undefined);
  assert.equal(at(result, 'buscar'), undefined);
});

test('user: a mention or an ID is the user, so an account outside the server works too', () => {
  assert.deepEqual(at(parsePrefixArgs(ANA, schemaOf(user)), 'usuario'), { type: 'user', id: '123456789012345678' });
  assert.deepEqual(at(parsePrefixArgs('481512865795145730', schemaOf(user)), 'usuario'), { type: 'user', id: '481512865795145730' });
});

test('user: a name goes to the search, with all its words', () => {
  const result = parsePrefixArgs('Javi Hernandez', schemaOf(user));
  assert.equal(at(result, 'usuario'), undefined);
  assert.deepEqual(at(result, 'buscar'), { type: 'string', value: 'Javi Hernandez' });
});

test('user: the badges flag works anywhere and does not leak into the name', () => {
  for (const raw of ['--badges Javi', 'Javi --badges', `${ANA} --badges`]) {
    assert.deepEqual(at(parsePrefixArgs(raw, schemaOf(user)), 'badges'), { type: 'boolean', value: true }, raw);
  }
  assert.deepEqual(at(parsePrefixArgs('Javi --badges', schemaOf(user)), 'buscar'), { type: 'string', value: 'Javi' });
  assert.equal(at(parsePrefixArgs('Javi', schemaOf(user)), 'badges'), undefined);
});

test('avatar: the same ways to name a person, and the global flag', () => {
  assert.deepEqual(at(parsePrefixArgs('--global Javi', schemaOf(avatar)), 'global'), { type: 'boolean', value: true });
  assert.deepEqual(at(parsePrefixArgs('--global Javi', schemaOf(avatar)), 'buscar'), { type: 'string', value: 'Javi' });
  assert.deepEqual(at(parsePrefixArgs('481512865795145730', schemaOf(avatar)), 'usuario'), { type: 'user', id: '481512865795145730' });
  assert.equal(at(parsePrefixArgs('', schemaOf(avatar)), 'usuario'), undefined);
});

test('the new commands are registered with their aliases and nothing else lost its name', () => {
  const registry = getRegistry();
  assert.equal(registry.resolve('user')?.data.name, 'user');
  for (const alias of ['userinfo', 'whois', 'u']) assert.equal(registry.resolve(alias)?.data.name, 'user', alias);
  assert.equal(registry.resolve('avatar')?.data.name, 'avatar');
  for (const alias of ['av', 'pfp', 'picture']) assert.equal(registry.resolve(alias)?.data.name, 'avatar', alias);
  // The developer command with a similar name is untouched
  assert.equal(registry.resolve('avatarsync')?.data.name, 'avatarsync');
});

test('both commands handle the "which one do you mean?" menu', () => {
  assert.equal(user.components.pick.kind, 'select');
  assert.equal(avatar.components.pick.kind, 'select');
});

test('server: no flag is the default view, and each flag parses on its own', () => {
  for (const flag of ['roles', 'emojis', 'channels', 'boost', 'icon', 'banner']) {
    assert.deepEqual(at(parsePrefixArgs(`--${flag}`, schemaOf(server)), flag), { type: 'boolean', value: true }, flag);
  }
  const none = values(parsePrefixArgs('', schemaOf(server)));
  assert.equal(none.size, 0);
});

test('server: two flags both parse, and the command is the one that refuses them together', () => {
  const result = parsePrefixArgs('--roles --emojis', schemaOf(server));
  assert.deepEqual(at(result, 'roles'), { type: 'boolean', value: true });
  assert.deepEqual(at(result, 'emojis'), { type: 'boolean', value: true });
  assert.deepEqual(at(parsePrefixArgs('--roles=no', schemaOf(server)), 'roles'), { type: 'boolean', value: false });
});

test('server and info own their names, and the old ip alias moved', () => {
  const registry = getRegistry();
  assert.equal(registry.resolve('server')?.data.name, 'server');
  for (const alias of ['serverinfo', 'sinfo', 'guild']) assert.equal(registry.resolve(alias)?.data.name, 'server', alias);
  assert.equal(registry.resolve('info')?.data.name, 'info');
  for (const alias of ['botinfo', 'about']) assert.equal(registry.resolve(alias)?.data.name, 'info', alias);

  // `!ip` keeps answering to its other names, and `!server` is no longer one of them
  assert.equal(registry.resolve('ip')?.data.name, 'ip');
  assert.equal(registry.resolve('jugar')?.data.name, 'ip');
  assert.equal(registry.resolve('minecraft')?.data.name, 'ip');
});

test('the page buttons of server are components of the server command', () => {
  assert.equal(server.components.page.kind, 'button');
  assert.equal(info.data.name, 'info');
});
