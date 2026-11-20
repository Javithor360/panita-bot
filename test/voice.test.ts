import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMOJIS } from '../src/config/emojis';
import { parsePrefixArgs, type ParseResult } from '../src/core/prefixParser';
import { accessDenial } from '../src/core/access';
import { formatParseError } from '../src/core/usage';
import { ask, fail, ok, usageLine, whoOf } from '../src/lib/voice';
import { SlashCommandBuilder } from 'discord.js';

const JAVI = { displayName: 'Javi' };

test('a success is the check, a tilde, the name in bold and the text in lowercase', () => {
  assert.equal(ok(JAVI, 'Latencias de Panita'), `${EMOJIS.check} ~ **Javi**, latencias de Panita`);
  assert.equal(fail(JAVI, 'No tienes los suficientes permisos'), `${EMOJIS.cross} ~ **Javi**, no tienes los suficientes permisos`);
  assert.equal(ask(JAVI, 'encontré varias personas'), `${EMOJIS.idle} ~ **Javi**, encontré varias personas`);
});

test('without a name the text keeps a capital and the line has no bold name', () => {
  assert.equal(ok(null, 'listo'), `${EMOJIS.check} ~ Listo`);
  assert.equal(fail(undefined, 'No hay fotos'), `${EMOJIS.cross} ~ No hay fotos`);
  assert.equal(fail({ displayName: '  ' }, 'No hay fotos'), `${EMOJIS.cross} ~ No hay fotos`);
});

test('acronyms, proper nouns in capitals, quotes and emojis are not lowercased', () => {
  assert.equal(fail(JAVI, 'IGN no válido'), `${EMOJIS.cross} ~ **Javi**, IGN no válido`);
  assert.equal(fail(JAVI, '`x` no existe'), `${EMOJIS.cross} ~ **Javi**, \`x\` no existe`);
  assert.equal(ok(JAVI, '**Ana** fue expulsada'), `${EMOJIS.check} ~ **Javi**, **Ana** fue expulsada`);
});

test('the name cannot break the line: markdown is escaped and a long name is cut', () => {
  assert.equal(ok({ displayName: 'a*b_c' }, 'hola'), `${EMOJIS.check} ~ **a\\*b\\_c**, hola`);
  const long = ok({ displayName: 'x'.repeat(100) }, 'hola');
  assert.ok(long.length < 80);
  assert.ok(long.includes('…'));
});

test('whoOf prefers the member, with the nickname, over the account', () => {
  assert.deepEqual(whoOf({ user: { displayName: 'cuenta' }, member: { displayName: 'apodo' } }), { displayName: 'apodo' });
  assert.deepEqual(whoOf({ user: { displayName: 'cuenta' }, member: null }), { displayName: 'cuenta' });
  assert.deepEqual(whoOf({ user: { displayName: 'cuenta' }, member: { nick: 'x' } }), { displayName: 'cuenta' });
});

test('the usage line is a quote: the first usage is labeled, the rest continue it', () => {
  assert.equal(usageLine(['!emoji <emoji>']), '> **Uso:** `!emoji <emoji>`');
  assert.equal(usageLine(['!emoji <emoji>', '!emoji add <nombre>']), '> **Uso:** `!emoji <emoji>`\n> `!emoji add <nombre>`');
});

test('a bad command is answered with the problem and the quoted usage', () => {
  const schema = (new SlashCommandBuilder().setName('warn').setDescription('d')
    .addUserOption(o => o.setName('usuario').setDescription('d').setRequired(true))
    .addStringOption(o => o.setName('razon').setDescription('d').setRequired(true)).toJSON().options ?? []) as any[];
  const failure = parsePrefixArgs('<@123456789012345678>', schema) as Extract<ParseResult, { kind: 'error' }>;
  assert.equal(failure.kind, 'error');

  const message = formatParseError('!', 'warn', schema, failure, [], JAVI);
  assert.equal(message.split('\n')[0], `${EMOJIS.cross} ~ **Javi**, falta el argumento \`razon\`.`);
  assert.equal(message.split('\n')[1], '> **Uso:** `!warn <usuario> <razon>`');
});

test('a denied access is a refusal in the voice, with the name of the member', () => {
  const member = { id: 'nobody', displayName: 'Aaron', roles: { cache: new Map() } } as any;
  assert.equal(accessDenial('staff', member), `${EMOJIS.cross} ~ **Aaron**, no tienes permisos de Staff para usar este comando.`);
  assert.equal(accessDenial('developer', member), `${EMOJIS.cross} ~ **Aaron**, no estás autorizado para usar este comando.`);
  assert.equal(accessDenial('everyone', member), null);
  assert.equal(accessDenial(undefined, member), null);
});
