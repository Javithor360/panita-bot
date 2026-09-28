import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  StringSelectMenuInteraction,
} from 'discord.js';
import type { Category } from '../config/constants';
import type { CommandContext } from './context';

export type Access = 'everyone' | 'staff' | 'developer';

export interface CommandMeta {
  category: Category;
  /** Long description shown in `/help <comando>`. */
  description: string;
  /** Prefix-only alternative names (`!alias`). They are never registered as slash commands. */
  aliases?: string[];
  access?: Access;
  /** The command can't work from a prefix message at all. */
  slashOnly?: boolean;
}

export interface PrefixConfig {
  /** Subcommand used when the first token isn't one (e.g. `!tz 5` → `tezzlar day 5`). */
  defaultSubcommand?: string;
  subcommandAliases?: Record<string, string>;
  /** Prefix-only action when the first token isn't a subcommand (e.g. `!tag <nombre>`). */
  fallback?: {
    usage: string;
    run(ctx: CommandContext, rawArgs: string): Promise<unknown>;
  };
}

interface ComponentHandlerBase<I> {
  /** Extra authorization on top of the owner check. Return an error message to deny. */
  guard?(interaction: I, args: string[]): Promise<string | null> | string | null;
  run(interaction: I, args: string[]): Promise<unknown>;
}

export type ButtonHandler = ComponentHandlerBase<ButtonInteraction> & { kind: 'button' };
export type SelectHandler = ComponentHandlerBase<StringSelectMenuInteraction> & { kind: 'select' };
export type ModalHandler = ComponentHandlerBase<ModalSubmitInteraction> & { kind: 'modal' };
export type ComponentHandler = ButtonHandler | SelectHandler | ModalHandler;

export const button = (handler: ComponentHandlerBase<ButtonInteraction>): ButtonHandler => ({ kind: 'button', ...handler });
export const select = (handler: ComponentHandlerBase<StringSelectMenuInteraction>): SelectHandler => ({ kind: 'select', ...handler });
export const modal = (handler: ComponentHandlerBase<ModalSubmitInteraction>): ModalHandler => ({ kind: 'modal', ...handler });

export interface CommandData {
  name: string;
  description: string;
  toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
}

export interface Command {
  data: CommandData;
  meta: CommandMeta;
  prefix?: PrefixConfig;
  run(ctx: CommandContext): Promise<unknown>;
  /** Component handlers keyed by action. Their custom IDs use the command name as namespace. */
  components?: Record<string, ComponentHandler>;
  /**
   * Maps custom IDs from before the `namespace:action` scheme to one of `components`.
   * Needed for components that live on in Discord (e.g. ticket panels posted long ago).
   */
  legacyCustomId?(customId: string): { action: string; args: string[] } | null;
}

export const defineCommand = <C extends Command>(command: C): C => command;
