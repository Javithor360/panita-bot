import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Interaction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import { accessDenial } from '../core/access';
import type { ComponentHandler } from '../core/command';
import { SlashContext } from '../core/context';
import { decodeCustomId } from '../core/customId';
import { safeReply, userMessageFor } from '../core/errors';
import type { CommandRegistry } from '../core/registry';
import { fail, whoOf } from '../lib/voice';

type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;

const NOT_OWNER = 'solo la persona que ejecutó el comando puede usar esto.';
const EXPIRED = 'este componente ya no está disponible.';
const EXPIRED_COMMAND = 'este comando ya no existe.';
const GUILD_ONLY = 'este comando solo se puede usar dentro del servidor.';

const handleChatInput = async (registry: CommandRegistry, interaction: ChatInputCommandInteraction) => {
  const who = whoOf(interaction);
  // Also resolves aliases, in case Discord still has old alias slash commands registered
  const command = registry.resolve(interaction.commandName);
  if (!command) return safeReply(interaction, fail(who, EXPIRED_COMMAND));

  if (!interaction.inCachedGuild()) return safeReply(interaction, fail(who, GUILD_ONLY));

  const denial = accessDenial(command.meta.access, interaction.member);
  if (denial) return safeReply(interaction, denial);

  try {
    await command.run(new SlashContext(interaction, command.data.name));
  } catch (error) {
    await safeReply(interaction, userMessageFor(error, command.data.name, 'Slash', who));
  }
};

const matchesKind = (handler: ComponentHandler, interaction: ComponentInteraction) =>
  (handler.kind === 'button' && interaction.isButton()) ||
  (handler.kind === 'select' && interaction.isStringSelectMenu()) ||
  (handler.kind === 'modal' && interaction.isModalSubmit());

const findComponent = (registry: CommandRegistry, customId: string) => {
  const decoded = decodeCustomId(customId);
  if (decoded) {
    const command = registry.byName.get(decoded.namespace);
    return { command, action: decoded.action, args: decoded.args, owner: decoded.owner };
  }
  for (const command of registry.commands) {
    const legacy = command.legacyCustomId?.(customId);
    if (legacy) return { command, ...legacy, owner: undefined };
  }
  return null;
};

/** A handler whose interaction kind was already verified by `matchesKind`. */
type VerifiedHandler = {
  guard?(interaction: ComponentInteraction, args: string[]): Promise<string | null> | string | null;
  run(interaction: ComponentInteraction, args: string[]): Promise<unknown>;
};

const handleComponent = async (registry: CommandRegistry, interaction: ComponentInteraction) => {
  const who = whoOf(interaction);
  const found = findComponent(registry, interaction.customId);
  const handler = found?.command?.components?.[found.action];

  if (!found?.command || !handler || !matchesKind(handler, interaction)) return safeReply(interaction, fail(who, EXPIRED));

  if (found.owner && interaction.user.id !== found.owner) return safeReply(interaction, fail(who, NOT_OWNER));

  const verified = handler as unknown as VerifiedHandler;
  try {
    const denial = await verified.guard?.(interaction, found.args);
    if (denial) return safeReply(interaction, denial);
    await verified.run(interaction, found.args);
  } catch (error) {
    await safeReply(interaction, userMessageFor(error, `${found.command.data.name}:${found.action}`, 'Component', who));
  }
};

export const createInteractionHandler = (registry: CommandRegistry) => async (interaction: Interaction) => {
  if (interaction.isChatInputCommand()) return handleChatInput(registry, interaction);
  if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
    return handleComponent(registry, interaction);
  }
};
