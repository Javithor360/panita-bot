import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { parsePrefixArgs, type ParseResult, type ParsedValue } from '../src/core/prefixParser';
import { buildUsage, formatParseError } from '../src/core/usage';

const schema = (builder: { toJSON(): { options?: unknown[] } }) => (builder.toJSON().options ?? []) as any[];

const ok = (result: ParseResult) => {
  assert.equal(result.kind, 'ok', `expected ok, got ${JSON.stringify(result)}`);
  return result as Extract<ParseResult, { kind: 'ok' }>;
};
const value = (result: ParseResult, name: string): ParsedValue | undefined => ok(result).values.get(name);

const ip = schema(new SlashCommandBuilder().setName('ip').setDescription('d')
  .addBooleanOption(o => o.setName('numeric').setDescription('d')));

const say = schema(new SlashCommandBuilder().setName('say').setDescription('d')
  .addStringOption(o => o.setName('mensaje').setDescription('d').setRequired(true))
  .addChannelOption(o => o.setName('canal').setDescription('d').addChannelTypes(ChannelType.GuildText)));

const tag = schema(new SlashCommandBuilder().setName('tag').setDescription('d')
  .addSubcommand(s => s.setName('add').setDescription('d')
    .addStringOption(o => o.setName('nombre').setDescription('d').setRequired(true))
    .addStringOption(o => o.setName('texto').setDescription('d'))
    .addAttachmentOption(o => o.setName('adjunto').setDescription('d')))
  .addSubcommand(s => s.setName('delete').setDescription('d')
    .addStringOption(o => o.setName('nombre').setDescription('d').setRequired(true)))
  .addSubcommand(s => s.setName('list').setDescription('d')));

const tezzlar = schema(new SlashCommandBuilder().setName('tezzlar').setDescription('d')
  .addSubcommand(s => s.setName('day').setDescription('d')
    .addIntegerOption(o => o.setName('numero').setDescription('d').setRequired(true).setMinValue(1).setMaxValue(32))
    .addBooleanOption(o => o.setName('force').setDescription('d'))));

const ticket = schema(new SlashCommandBuilder().setName('ticket').setDescription('d')
  .addSubcommandGroup(g => g.setName('panel').setDescription('d')
    .addSubcommand(s => s.setName('list').setDescription('d'))
    .addSubcommand(s => s.setName('resend').setDescription('d')
      .addStringOption(o => o.setName('panel_id').setDescription('d').setRequired(true))
      .addChannelOption(o => o.setName('canal').setDescription('d').setRequired(true))))
  .addSubcommandGroup(g => g.setName('config').setDescription('d')
    .addSubcommand(s => s.setName('counter').setDescription('d')
      .addStringOption(o => o.setName('panel_id').setDescription('d').setRequired(true))
      .addIntegerOption(o => o.setName('number').setDescription('d').setRequired(true)))
    .addSubcommand(s => s.setName('show_id_in_name').setDescription('d')
      .addStringOption(o => o.setName('panel_id').setDescription('d').setRequired(true))
      .addBooleanOption(o => o.setName('show').setDescription('d').setRequired(true)))
    .addSubcommand(s => s.setName('staff_role').setDescription('d')
      .addStringOption(o => o.setName('panel_id').setDescription('d').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('d').setRequired(true)))));

const bot = schema(new SlashCommandBuilder().setName('bot').setDescription('d')
  .addSubcommand(s => s.setName('status').setDescription('d')
    .addStringOption(o => o.setName('state').setDescription('d').setRequired(true)
      .addChoices({ name: 'Ausente', value: 'idle' }, { name: 'No Molestar', value: 'dnd' })))
  .addSubcommand(s => s.setName('activity').setDescription('d')
    .addStringOption(o => o.setName('text').setDescription('d').setRequired(true))));

const add = schema(new SlashCommandBuilder().setName('add').setDescription('d')
  .addUserOption(o => o.setName('user').setDescription('d').setRequired(true)));

test('boolean flags', () => {
  assert.deepEqual(value(parsePrefixArgs('--numeric', ip), 'numeric'), { type: 'boolean', value: true });
  assert.deepEqual(value(parsePrefixArgs('--numeric=no', ip), 'numeric'), { type: 'boolean', value: false });
  assert.equal(value(parsePrefixArgs('', ip), 'numeric'), undefined);
});

test('say: optional channel mention first, multiline message preserved', () => {
  const result = parsePrefixArgs('<#123456789012345678> hola\n  mundo', say);
  assert.deepEqual(value(result, 'canal'), { type: 'channel', id: '123456789012345678' });
  assert.deepEqual(value(result, 'mensaje'), { type: 'string', value: 'hola\n  mundo' });
});

test('say: without channel the whole text is the message', () => {
  const result = parsePrefixArgs('hola mundo', say);
  assert.equal(value(result, 'canal'), undefined);
  assert.deepEqual(value(result, 'mensaje'), { type: 'string', value: 'hola mundo' });
});

test('tag add keeps raw newlines and picks up attachments', () => {
  const result = ok(parsePrefixArgs('add reglas Línea 1\n\n  - Línea 2', tag, { attachmentCount: 1 }));
  assert.equal(result.subcommand, 'add');
  assert.deepEqual(result.values.get('nombre'), { type: 'string', value: 'reglas' });
  assert.deepEqual(result.values.get('texto'), { type: 'string', value: 'Línea 1\n\n  - Línea 2' });
  assert.deepEqual(result.values.get('adjunto'), { type: 'attachment', index: 0 });
});

test('tag: unknown first token goes to the prefix fallback', () => {
  assert.deepEqual(parsePrefixArgs('reglas', tag, { hasFallback: true }), { kind: 'fallback', rawArgs: 'reglas' });
  assert.equal(parsePrefixArgs('', tag, { hasFallback: true }).kind, 'error');
  assert.equal(parsePrefixArgs('reglas', tag).kind, 'error');
});

test('tezzlar: default subcommand, flags and range validation', () => {
  const explicit = ok(parsePrefixArgs('day 5 --force', tezzlar));
  assert.equal(explicit.subcommand, 'day');
  assert.deepEqual(explicit.values.get('numero'), { type: 'integer', value: 5 });
  assert.deepEqual(explicit.values.get('force'), { type: 'boolean', value: true });

  const implicit = ok(parsePrefixArgs('7', tezzlar, { defaultSubcommand: 'day' }));
  assert.deepEqual(implicit.values.get('numero'), { type: 'integer', value: 7 });

  const outOfRange = parsePrefixArgs('day 40', tezzlar);
  assert.equal(outOfRange.kind, 'error');
  assert.equal(outOfRange.kind === 'error' && outOfRange.reason, 'out_of_range');
});

test('ticket: subcommand groups with typed and string options', () => {
  const counter = ok(parsePrefixArgs('config counter soporte 10', ticket));
  assert.equal(counter.group, 'config');
  assert.equal(counter.subcommand, 'counter');
  assert.deepEqual(counter.values.get('panel_id'), { type: 'string', value: 'soporte' });
  assert.deepEqual(counter.values.get('number'), { type: 'integer', value: 10 });

  const show = ok(parsePrefixArgs('config show_id_in_name soporte false', ticket));
  assert.deepEqual(show.values.get('show'), { type: 'boolean', value: false });
  assert.deepEqual(show.values.get('panel_id'), { type: 'string', value: 'soporte' });

  const resend = ok(parsePrefixArgs('panel resend soporte <#123456789012345678>', ticket));
  assert.deepEqual(resend.values.get('canal'), { type: 'channel', id: '123456789012345678' });

  const role = ok(parsePrefixArgs('config staff_role soporte Staff', ticket));
  assert.deepEqual(role.values.get('role'), { type: 'role', name: 'Staff' });
  assert.deepEqual(role.values.get('panel_id'), { type: 'string', value: 'soporte' });

  const missingSub = parsePrefixArgs('config', ticket);
  assert.equal(missingSub.kind === 'error' && missingSub.reason, 'missing_subcommand');
});

test('choices match by value or display name', () => {
  assert.deepEqual(value(parsePrefixArgs('status idle', bot), 'state'), { type: 'string', value: 'idle' });
  assert.deepEqual(value(parsePrefixArgs('status ausente', bot), 'state'), { type: 'string', value: 'idle' });
  const invalid = parsePrefixArgs('status durmiendo', bot);
  assert.equal(invalid.kind === 'error' && invalid.reason, 'invalid_choice');
  assert.deepEqual(value(parsePrefixArgs('activity Jugando Minecraft', bot), 'text'), { type: 'string', value: 'Jugando Minecraft' });
});

test('users: mention, snowflake or name lookup', () => {
  assert.deepEqual(value(parsePrefixArgs('<@!123456789012345678>', add), 'user'), { type: 'user', id: '123456789012345678' });
  assert.deepEqual(value(parsePrefixArgs('123456789012345678', add), 'user'), { type: 'user', id: '123456789012345678' });
  assert.deepEqual(value(parsePrefixArgs('javi', add), 'user'), { type: 'user', name: 'javi' });
  const missing = parsePrefixArgs('', add);
  assert.equal(missing.kind === 'error' && missing.reason, 'missing_option');
});

test('usage lines are generated from the schema', () => {
  assert.deepEqual(buildUsage('ip', ip), ['ip [--numeric]']);
  assert.deepEqual(buildUsage('say', say), ['say <mensaje> [canal]']);
  assert.deepEqual(buildUsage('tag', tag, {}, ['<nombre>']), [
    'tag add <nombre> [texto] [adjunto]',
    'tag delete <nombre>',
    'tag list',
    'tag <nombre>',
  ]);
  assert.deepEqual(buildUsage('ticket', ticket, { group: 'config' }), ['ticket config <counter|show_id_in_name|staff_role>']);
  assert.deepEqual(buildUsage('bot', bot, { subcommand: 'status' }), ['bot status <idle|dnd>']);
});

test('parse errors render a usage hint', () => {
  const failure = parsePrefixArgs('day 99', tezzlar);
  assert.equal(failure.kind, 'error');
  if (failure.kind !== 'error') return;
  const message = formatParseError('!', 'tezzlar', tezzlar, failure);
  assert.match(message, /fuera del rango/);
  assert.match(message, /`!tezzlar day <numero> \[--force\]`/);
});
