import { ApplicationCommandOptionType, type APIApplicationCommandOption } from 'discord.js';

/**
 * Schema-driven parser for prefix (`!`) commands.
 *
 * It reads the same option definitions used by the slash command (`SlashCommandBuilder#toJSON()`),
 * so a command is defined once and both invocation styles produce the same named options.
 * This module is pure (no Discord API access): entity IDs are resolved later by the prefix context.
 */

export interface Token {
  value: string;
  start: number;
  end: number;
}

export type ParsedValue =
  | { type: 'string'; value: string }
  | { type: 'integer' | 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  /** `id` when the token was a mention/snowflake, `name` for a name lookup candidate. */
  | { type: 'user' | 'role' | 'channel' | 'mentionable'; id?: string; name?: string }
  | { type: 'attachment'; index: number };

export interface ParseSuccess {
  kind: 'ok';
  group: string | null;
  subcommand: string | null;
  values: Map<string, ParsedValue>;
}

/** The first token is not a subcommand and the command handles free text itself. */
export interface ParseFallback {
  kind: 'fallback';
  rawArgs: string;
}

export type ParseErrorReason = 'missing_subcommand' | 'missing_option' | 'invalid_choice' | 'out_of_range';

export interface ParseFailure {
  kind: 'error';
  reason: ParseErrorReason;
  group: string | null;
  subcommand: string | null;
  option?: string;
}

export type ParseResult = ParseSuccess | ParseFallback | ParseFailure;

export interface PrefixParseConfig {
  defaultSubcommand?: string;
  subcommandAliases?: Record<string, string>;
  hasFallback?: boolean;
  /** Number of attachments on the invoking message. */
  attachmentCount?: number;
}

type Option = APIApplicationCommandOption;

const T = ApplicationCommandOptionType;
const ENTITY_TYPES = new Set<number>([T.User, T.Role, T.Channel, T.Mentionable]);
const NUMERIC_TYPES = new Set<number>([T.Integer, T.Number]);
const TRUE_WORDS = new Set(['true', 'si', 'sí', 'yes', '1']);
const FALSE_WORDS = new Set(['false', 'no', '0']);
const SNOWFLAKE = /^\d{17,20}$/;

export const tokenize = (raw: string): Token[] => {
  const tokens: Token[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    tokens.push({ value: match[0], start: match.index, end: match.index + match[0].length });
  }
  return tokens;
};

const isContainer = (opt: Option) =>
  opt.type === T.Subcommand || opt.type === T.SubcommandGroup;

const childrenOf = (opt: Option | undefined): Option[] =>
  opt && 'options' in opt && Array.isArray(opt.options) ? (opt.options as Option[]) : [];

const entityTypeName = (type: number) =>
  type === T.User ? 'user' : type === T.Role ? 'role' : type === T.Channel ? 'channel' : 'mentionable';

/** Extracts an ID from a mention or bare snowflake that is valid for the given option type. */
const matchEntity = (type: number, token: string): string | null => {
  if (SNOWFLAKE.test(token)) return token;
  const user = token.match(/^<@!?(\d+)>$/);
  const role = token.match(/^<@&(\d+)>$/);
  const channel = token.match(/^<#(\d+)>$/);
  if (type === T.User) return user?.[1] ?? null;
  if (type === T.Role) return role?.[1] ?? null;
  if (type === T.Channel) return channel?.[1] ?? null;
  if (type === T.Mentionable) return user?.[1] ?? role?.[1] ?? null;
  return null;
};

const parseNumeric = (type: number, token: string): number | null => {
  const pattern = type === T.Integer ? /^-?\d+$/ : /^-?\d+(\.\d+)?$/;
  return pattern.test(token) ? Number(token) : null;
};

const resolveChoice = (opt: Option, input: string | number): string | number | undefined => {
  if (!('choices' in opt) || !opt.choices?.length) return input;
  const needle = String(input).toLowerCase();
  const choice = opt.choices.find(
    c => String(c.value).toLowerCase() === needle || c.name.toLowerCase() === needle,
  );
  return choice?.value;
};

/** Joins the remaining tokens, keeping the original raw text (newlines, indentation) when contiguous. */
const sliceRemaining = (raw: string, remaining: Token[], consumed: Token[]): string => {
  const first = remaining[0];
  const last = remaining[remaining.length - 1];
  const interrupted = consumed.some(t => t.start > first.start && t.start < last.end);
  return interrupted ? remaining.map(t => t.value).join(' ') : raw.slice(first.start, last.end);
};

export const parsePrefixArgs = (
  raw: string,
  schema: readonly Option[],
  config: PrefixParseConfig = {},
): ParseResult => {
  const tokens = tokenize(raw);
  const aliases = config.subcommandAliases ?? {};
  const resolveName = (token: Token | undefined) => {
    const lower = token?.value.toLowerCase();
    return lower ? aliases[lower] ?? lower : undefined;
  };

  let group: string | null = null;
  let subcommand: string | null = null;
  let options: Option[] = [...schema];

  if (schema.some(isContainer)) {
    const match = schema.find(o => o.name === resolveName(tokens[0]));

    if (match) {
      tokens.shift();
      if (match.type === T.SubcommandGroup) {
        group = match.name;
        const sub = childrenOf(match).find(o => o.name === resolveName(tokens[0]));
        if (!sub) return { kind: 'error', reason: 'missing_subcommand', group, subcommand: null };
        tokens.shift();
        subcommand = sub.name;
        options = childrenOf(sub);
      } else {
        subcommand = match.name;
        options = childrenOf(match);
      }
    } else if (config.defaultSubcommand) {
      subcommand = config.defaultSubcommand;
      options = childrenOf(schema.find(o => o.name === subcommand));
    } else if (config.hasFallback && tokens.length > 0) {
      return { kind: 'fallback', rawArgs: raw.trim() };
    } else {
      return { kind: 'error', reason: 'missing_subcommand', group: null, subcommand: null };
    }
  }

  const fail = (reason: ParseErrorReason, option?: string): ParseFailure => ({
    kind: 'error', reason, group, subcommand, option,
  });

  const values = new Map<string, ParsedValue>();
  const consumed: Token[] = [];
  let remaining = [...tokens];
  const take = (index: number) => {
    const [token] = remaining.splice(index, 1);
    consumed.push(token);
    return token;
  };

  // 1. Boolean flags anywhere: --name or --name=false
  for (const opt of options.filter(o => o.type === T.Boolean)) {
    const flag = new RegExp(`^--${opt.name}(?:=(.+))?$`, 'i');
    const index = remaining.findIndex(t => flag.test(t.value));
    if (index === -1) continue;
    const explicit = take(index).value.match(flag)?.[1]?.toLowerCase();
    values.set(opt.name, { type: 'boolean', value: explicit === undefined || !FALSE_WORDS.has(explicit) });
  }

  // 2. Typed options, in declared order: the first remaining token that parses as that type
  for (const opt of options) {
    if (ENTITY_TYPES.has(opt.type)) {
      const index = remaining.findIndex(t => matchEntity(opt.type, t.value) !== null);
      if (index !== -1) {
        values.set(opt.name, { type: entityTypeName(opt.type), id: matchEntity(opt.type, take(index).value)! });
      }
    } else if (NUMERIC_TYPES.has(opt.type)) {
      const index = remaining.findIndex(t => parseNumeric(opt.type, t.value) !== null);
      if (index === -1) continue;
      const num = parseNumeric(opt.type, take(index).value)!;
      const min = 'min_value' in opt ? opt.min_value : undefined;
      const max = 'max_value' in opt ? opt.max_value : undefined;
      if ((min !== undefined && num < min) || (max !== undefined && num > max)) return fail('out_of_range', opt.name);
      const choice = resolveChoice(opt, num);
      if (choice === undefined) return fail('invalid_choice', opt.name);
      values.set(opt.name, { type: opt.type === T.Integer ? 'integer' : 'number', value: Number(choice) });
    }
  }

  // 3. Required booleans may also be written as a bare word (true/false/si/no)
  for (const opt of options.filter(o => o.type === T.Boolean && o.required && !values.has(o.name))) {
    const index = remaining.findIndex(t => TRUE_WORDS.has(t.value.toLowerCase()) || FALSE_WORDS.has(t.value.toLowerCase()));
    if (index !== -1) {
      values.set(opt.name, { type: 'boolean', value: TRUE_WORDS.has(take(index).value.toLowerCase()) });
    }
  }

  // 4. Unmatched required entities fall back to a name lookup on the last remaining token
  for (const opt of options.filter(o => ENTITY_TYPES.has(o.type) && o.required && !values.has(o.name))) {
    if (remaining.length === 0) break;
    values.set(opt.name, { type: entityTypeName(opt.type), name: take(remaining.length - 1).value });
  }

  // 5. Strings in declared order; the last one takes the rest of the raw text
  const stringOptions = options.filter(o => o.type === T.String);
  for (const [i, opt] of stringOptions.entries()) {
    if (remaining.length === 0) break;
    const isLast = i === stringOptions.length - 1;
    const text = isLast ? sliceRemaining(raw, remaining, consumed) : take(0).value;
    if (isLast) remaining = [];
    const choice = resolveChoice(opt, text);
    if (choice === undefined) return fail('invalid_choice', opt.name);
    values.set(opt.name, { type: 'string', value: String(choice) });
  }

  // 6. Attachments come from the message, in declared order
  let attachmentIndex = 0;
  for (const opt of options.filter(o => o.type === T.Attachment)) {
    if (attachmentIndex >= (config.attachmentCount ?? 0)) break;
    values.set(opt.name, { type: 'attachment', index: attachmentIndex++ });
  }

  const missing = options.find(o => o.required && !values.has(o.name));
  if (missing) return fail('missing_option', missing.name);

  return { kind: 'ok', group, subcommand, values };
};
