import {
  ApplicationIntegrationType,
  InteractionContextType,
  REST,
  Routes,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { env } from '../config/env';
import type { CommandRegistry } from '../core/registry';

/**
 * - `global`: the normal mode. Commands are available in every server the bot is in, and global
 *   commands are what make Discord show the "Supports Commands" badge on the bot's profile.
 * - `guild`: registers only in GUILD_ID. Updates are instant, useful while developing.
 * Each mode clears the other scope so commands never show up twice.
 */
export type DeployScope = 'global' | 'guild';

export interface DeployResult {
  scope: DeployScope;
  count: number;
}

/**
 * Slash command definitions for every command. Aliases are prefix-only and never registered.
 * Commands are server-only: the bot doesn't handle DMs or user-installed contexts.
 */
export const buildSlashPayload = (registry: CommandRegistry): RESTPostAPIChatInputApplicationCommandsJSONBody[] =>
  registry.commands.map(command => ({
    ...command.data.toJSON(),
    contexts: [InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.GuildInstall],
  }));

const resolveApplicationId = async (rest: REST) =>
  env.CLIENT_ID ?? ((await rest.get(Routes.currentApplication())) as { id: string }).id;

export const deploySlashCommands = async (
  registry: CommandRegistry,
  { scope = 'global', applicationId }: { scope?: DeployScope; applicationId?: string } = {},
): Promise<DeployResult> => {
  const rest = new REST().setToken(env.DISCORD_TOKEN);
  const appId = applicationId ?? await resolveApplicationId(rest);
  const body = buildSlashPayload(registry);

  if (scope === 'guild') {
    if (!env.GUILD_ID) throw new Error('GUILD_ID is required to register guild commands.');
    await rest.put(Routes.applicationCommands(appId), { body: [] });
    await rest.put(Routes.applicationGuildCommands(appId, env.GUILD_ID), { body });
    return { scope, count: body.length };
  }

  await rest.put(Routes.applicationCommands(appId), { body });
  if (env.GUILD_ID) await rest.put(Routes.applicationGuildCommands(appId, env.GUILD_ID), { body: [] });
  return { scope, count: body.length };
};
