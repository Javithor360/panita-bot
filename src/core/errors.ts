import { Client, Events, MessageFlags, type RepliableInteraction } from 'discord.js';

/** An expected failure whose message is safe to show to the user as-is. */
export class UserError extends Error {}

/** Thrown when a prefix invocation reaches something only slash commands support (e.g. modals). */
export class PrefixUnsupportedError extends Error {}

export const GENERIC_ERROR = '❌ ¡Hubo un error al ejecutar este comando!';
export const SLASH_ONLY_ERROR = (name: string) =>
  `❌ Esta acción es interactiva y solo se puede usar como **Slash Command** (ejemplo: \`/${name}\`).`;

/** Ephemeral reply that never throws (the interaction may have expired). */
export const safeReply = async (interaction: RepliableInteraction, content: string) => {
  try {
    const payload = { content, flags: MessageFlags.Ephemeral } as const;
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch (error) {
    console.error('[Error] Could not send error reply:', error);
  }
};

/** Maps any thrown error to the message the user should see, logging unexpected ones. */
export const userMessageFor = (error: unknown, commandName: string, scope: string): string => {
  if (error instanceof UserError) return error.message;
  if (error instanceof PrefixUnsupportedError) return SLASH_ONLY_ERROR(commandName);
  console.error(`[${scope}] ${commandName}:`, error);
  return GENERIC_ERROR;
};

export const installProcessHandlers = (client: Client) => {
  process.on('unhandledRejection', reason => console.error('[Process] Unhandled rejection:', reason));
  process.on('uncaughtException', error => console.error('[Process] Uncaught exception:', error));
  client.on(Events.Error, error => console.error('[Client] Error:', error));
  client.on(Events.Warn, message => console.warn('[Client] Warning:', message));
};
