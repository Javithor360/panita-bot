import { REST, Routes, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import { env } from '../config/env';
import type { CommandRegistry } from '../core/registry';

export interface DeployResult {
  scope: 'guild' | 'global';
  count: number;
}

/** Slash command definitions for every command. Aliases are prefix-only and never registered. */
export const buildSlashPayload = (registry: CommandRegistry): RESTPostAPIChatInputApplicationCommandsJSONBody[] => [
  ...registry.commands.map(command => command.data.toJSON()),
  ...[...new Set(registry.legacy.values())].map(command => command.data.toJSON()),
];

const resolveApplicationId = async (rest: REST) =>
  env.CLIENT_ID ?? ((await rest.get(Routes.currentApplication())) as { id: string }).id;

/**
 * Registers the slash commands. With GUILD_ID they're registered for that guild only (instant
 * updates) and global commands are cleared to avoid duplicates; otherwise they're registered globally.
 */
export const deploySlashCommands = async (registry: CommandRegistry, applicationId?: string): Promise<DeployResult> => {
  const rest = new REST().setToken(env.DISCORD_TOKEN);
  const appId = applicationId ?? await resolveApplicationId(rest);
  const body = buildSlashPayload(registry);

  if (env.GUILD_ID) {
    await rest.put(Routes.applicationCommands(appId), { body: [] });
    await rest.put(Routes.applicationGuildCommands(appId, env.GUILD_ID), { body });
    return { scope: 'guild', count: body.length };
  }

  await rest.put(Routes.applicationCommands(appId), { body });
  return { scope: 'global', count: body.length };
};
