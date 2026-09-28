import fs from 'fs';
import path from 'path';
import type { APIApplicationCommandOption } from 'discord.js';
import type { Access, Command } from './command';
import { isLegacyCommand, type LegacyCommand } from './legacy';
import { buildUsage } from './usage';

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

export interface CommandInfo {
  name: string;
  description: string;
  category: string;
  aliases: string[];
  access: Access;
  slashOnly: boolean;
  /** Usage lines without prefix symbol, e.g. `tag add <nombre> [texto]`. */
  usage: string[];
  /** Usage lines that only exist as prefix commands (subset of `usage`). */
  prefixOnlyUsage: string[];
}

const legacyInfo = (command: LegacyCommand): CommandInfo => ({
  name: command.data.name,
  description: command.metadata?.description || command.data.description,
  category: command.metadata?.category || 'Sin categoría',
  aliases: command.metadata?.aliases ?? [],
  access: command.metadata?.devOnly ? 'developer' : command.metadata?.staffOnly ? 'staff' : 'everyone',
  slashOnly: !!command.metadata?.slashOnly,
  usage: [command.metadata?.usage || command.data.name],
  prefixOnlyUsage: [],
});

const isCommandFile = (file: string) =>
  /\.(ts|js)$/.test(file) && !file.endsWith('.d.ts') && !file.includes('.test.');

const isCommand = (mod: any): mod is Command =>
  !!mod && typeof mod === 'object' && 'data' in mod && 'meta' in mod && typeof mod.run === 'function';

export class CommandRegistry {
  /** Canonical name → command. */
  readonly byName = new Map<string, Command>();
  /** Prefix alias → command. */
  readonly byAlias = new Map<string, Command>();
  /** Name and aliases → not-yet-migrated command (TEMPORARY). */
  readonly legacy = new Map<string, LegacyCommand>();
  private readonly schemas = new WeakMap<Command, APIApplicationCommandOption[]>();

  constructor(dir = COMMANDS_DIR) {
    for (const category of fs.readdirSync(dir)) {
      const categoryPath = path.join(dir, category);
      if (!fs.statSync(categoryPath).isDirectory()) continue;

      for (const file of fs.readdirSync(categoryPath).filter(isCommandFile)) {
        const mod = require(path.join(categoryPath, file));
        if (isCommand(mod.default)) this.add(mod.default);
        else if (isLegacyCommand(mod)) this.addLegacy(mod);
        else console.warn(`[Registry] ${category}/${file} does not export a command.`);
      }
    }
  }

  private add(command: Command) {
    const name = command.data.name;
    if (this.byName.has(name)) throw new Error(`[Registry] Duplicate command name "${name}"`);
    this.byName.set(name, command);
    for (const alias of command.meta.aliases ?? []) {
      if (this.byAlias.has(alias) || this.byName.has(alias)) console.warn(`[Registry] Alias "${alias}" is already taken.`);
      else this.byAlias.set(alias, command);
    }
  }

  private addLegacy(command: LegacyCommand) {
    this.legacy.set(command.data.name, command);
    for (const alias of command.metadata?.aliases ?? []) this.legacy.set(alias, command);
  }

  /** Finds a command by name or prefix alias. */
  resolve(name: string): Command | undefined {
    const key = name.toLowerCase();
    return this.byName.get(key) ?? this.byAlias.get(key);
  }

  get commands(): Command[] {
    return [...this.byName.values()];
  }

  /** Normalized descriptions of every command (used by /help). */
  info(): CommandInfo[] {
    const legacy = [...new Set(this.legacy.values())].map(legacyInfo);
    return [...this.commands.map(c => this.commandInfo(c)), ...legacy].sort((a, b) => a.name.localeCompare(b.name));
  }

  findInfo(name: string): CommandInfo | undefined {
    const command = this.resolve(name);
    if (command) return this.commandInfo(command);
    const legacy = this.legacy.get(name.toLowerCase());
    return legacy ? legacyInfo(legacy) : undefined;
  }

  private commandInfo(command: Command): CommandInfo {
    const fallback = command.prefix?.fallback;
    return {
      name: command.data.name,
      description: command.meta.description,
      category: command.meta.category,
      aliases: command.meta.aliases ?? [],
      access: command.meta.access ?? 'everyone',
      slashOnly: !!command.meta.slashOnly,
      usage: buildUsage(command.data.name, this.schemaOf(command), {}, fallback ? [fallback.usage] : []),
      prefixOnlyUsage: fallback ? [`${command.data.name} ${fallback.usage}`] : [],
    };
  }

  /** Cached slash option schema, also used by the prefix parser. */
  schemaOf(command: Command): APIApplicationCommandOption[] {
    let schema = this.schemas.get(command);
    if (!schema) {
      schema = (command.data.toJSON().options ?? []) as APIApplicationCommandOption[];
      this.schemas.set(command, schema);
    }
    return schema;
  }
}

let instance: CommandRegistry | null = null;

/** Loads the command registry once (lazily, so commands like /help can use it without import cycles). */
export const getRegistry = () => (instance ??= new CommandRegistry());
