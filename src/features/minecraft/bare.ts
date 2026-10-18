/** The commands a channel joined to the Minecraft server understands without the prefix, written as the whole message. */
const BARE_COMMANDS = ['playerlist'] as const;

/** The command a message stands for when it is only the name of one (in any case), or null. */
export const bareCommand = (content: string): string | null => {
  const word = content.trim().toLowerCase();
  return BARE_COMMANDS.find(name => name === word) ?? null;
};
