import { ApplicationCommandOptionType, type APIApplicationCommandOption } from 'discord.js';
import type { ParseFailure } from './prefixParser';

/**
 * Builds human readable usage lines from a slash command schema, so usage never drifts from the
 * real options. Syntax: `<obligatorio>`, `[opcional]`, `[--bandera]`, `<a|b>` for choices.
 */

type Option = APIApplicationCommandOption;
const T = ApplicationCommandOptionType;

const children = (opt: Option): Option[] =>
  'options' in opt && Array.isArray(opt.options) ? (opt.options as Option[]) : [];

const formatOption = (opt: Option): string => {
  if (opt.type === T.Boolean) return opt.required ? `<${opt.name}:si|no>` : `[--${opt.name}]`;
  const choices = 'choices' in opt && opt.choices?.length ? opt.choices.map(c => c.value).join('|') : null;
  const label = choices ?? opt.name;
  return opt.required ? `<${label}>` : `[${label}]`;
};

const formatOptions = (options: Option[]) => options.map(formatOption).join(' ');

const join = (...parts: string[]) => parts.filter(Boolean).join(' ');

export interface UsagePath {
  group?: string | null;
  subcommand?: string | null;
}

/**
 * Returns one usage line per invocable path (without prefix symbol), e.g. `tag add <nombre> [texto]`.
 * When `path` is given only the matching lines are returned.
 */
export const buildUsage = (
  name: string,
  schema: readonly Option[],
  path: UsagePath = {},
  extraLines: string[] = [],
): string[] => {
  const lines: string[] = [];

  for (const opt of schema) {
    if (opt.type === T.SubcommandGroup) {
      if (path.group && path.group !== opt.name) continue;
      for (const sub of children(opt)) {
        if (path.subcommand && path.subcommand !== sub.name) continue;
        lines.push(join(name, opt.name, sub.name, formatOptions(children(sub))));
      }
    } else if (opt.type === T.Subcommand) {
      if (path.group) continue;
      if (path.subcommand && path.subcommand !== opt.name) continue;
      lines.push(join(name, opt.name, formatOptions(children(opt))));
    }
  }

  if (lines.length === 0 && !schema.some(o => o.type === T.Subcommand || o.type === T.SubcommandGroup)) {
    lines.push(join(name, formatOptions([...schema])));
  }

  // When a group was given but no subcommand, summarize its subcommands on a single line
  if (path.group && !path.subcommand && lines.length > 1) {
    const group = schema.find(o => o.name === path.group);
    const subs = group ? children(group).map(s => s.name).join('|') : '';
    return [join(name, path.group, `<${subs}>`)];
  }

  return path.group || path.subcommand ? lines : [...lines, ...extraLines.map(l => join(name, l))];
};

/** Spanish error message for a failed prefix parse. */
export const formatParseError = (
  prefix: string,
  name: string,
  schema: readonly Option[],
  failure: ParseFailure,
  extraLines: string[] = [],
): string => {
  const lines = buildUsage(name, schema, failure, extraLines).map(l => `\`${prefix}${l}\``);
  const usage = `**Uso correcto:**\n${lines.join('\n')}`;

  switch (failure.reason) {
    case 'out_of_range':
      return `❌ El valor de \`${failure.option}\` está fuera del rango permitido.\n${usage}`;
    case 'invalid_choice':
      return `❌ Valor inválido para \`${failure.option}\`.\n${usage}`;
    case 'missing_option':
      return `❌ Falta el argumento \`${failure.option}\`.\n${usage}`;
    default:
      return `❌ Subcomando inválido.\n${usage}`;
  }
};
