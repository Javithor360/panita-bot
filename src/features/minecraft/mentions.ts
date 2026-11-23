import type { BridgeMention } from './protocol';

/**
 * The text of a game line with each `@name` of a linked member written as their Discord mention, and the ids that may be notified:
 * exactly the members whose `@name` the text holds. Only the members the mod listed are looked for (it lists them only for a player
 * who is allowed to mention), so `@everyone`, roles and any other name stay as plain text.
 */
export const mentionsIn = (text: string, mentions: readonly BridgeMention[]): { text: string; users: string[] } => {
  if (mentions.length === 0) return { text, users: [] };
  const idByName = new Map(mentions.map(mention => [mention.name.toLowerCase(), mention.discordId]));
  // Names are checked as Minecraft names when the frame is read, so they are safe to put in a pattern; the longest first, so a
  // name that starts another one is not cut short
  const names = [...idByName.keys()].sort((a, b) => b.length - a.length).join('|');
  const pattern = new RegExp(`(?<![A-Za-z0-9_@])@(${names})(?![A-Za-z0-9_])`, 'gi');
  const users = new Set<string>();
  const replaced = text.replace(pattern, (_match, name: string) => {
    const id = idByName.get(name.toLowerCase()) as string;
    users.add(id);
    return `<@${id}>`;
  });
  return { text: replaced, users: [...users] };
};
