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
import { routeLegacyComponent, runLegacySlash } from '../core/legacy';
import type { CommandRegistry } from '../core/registry';

type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;

const NOT_OWNER = '❌ Solo la persona que ejecutó el comando puede usar esto.';
const EXPIRED = 'Este componente ya no está disponible.';
const GUILD_ONLY = '❌ Este comando solo se puede usar dentro del servidor.';

const handleChatInput = async (registry: CommandRegistry, interaction: ChatInputCommandInteraction) => {
  const command = registry.resolve(interaction.commandName);

  if (!command) {
    const legacy = registry.legacy.get(interaction.commandName);
    if (!legacy) return;
    try {
      await runLegacySlash(legacy, interaction);
    } catch (error) {
      await safeReply(interaction, userMessageFor(error, interaction.commandName, 'Slash'));
    }
    return;
  }

  if (!interaction.inCachedGuild()) return safeReply(interaction, GUILD_ONLY);

  const denial = accessDenial(command.meta.access, interaction.member);
  if (denial) return safeReply(interaction, denial);

  try {
    await command.run(new SlashContext(interaction, command.data.name));
  } catch (error) {
    await safeReply(interaction, userMessageFor(error, command.data.name, 'Slash'));
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
  const found = findComponent(registry, interaction.customId);
  const handler = found?.command?.components?.[found.action];

  if (!found?.command || !handler || !matchesKind(handler, interaction)) {
    try {
      if (await routeLegacyComponent(interaction, registry.legacy)) return;
    } catch (error) {
      return safeReply(interaction, userMessageFor(error, interaction.customId, 'Component'));
    }
    return safeReply(interaction, EXPIRED);
  }

  if (found.owner && interaction.user.id !== found.owner) return safeReply(interaction, NOT_OWNER);

  const verified = handler as unknown as VerifiedHandler;
  try {
    const denial = await verified.guard?.(interaction, found.args);
    if (denial) return safeReply(interaction, denial);
    await verified.run(interaction, found.args);
  } catch (error) {
    await safeReply(interaction, userMessageFor(error, `${found.command.data.name}:${found.action}`, 'Component'));
  }
};

export const createInteractionHandler = (registry: CommandRegistry) => async (interaction: Interaction) => {
  if (interaction.isChatInputCommand()) return handleChatInput(registry, interaction);
  if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
    return handleComponent(registry, interaction);
  }
};
