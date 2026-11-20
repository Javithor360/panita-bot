import { escapeMarkdown } from 'discord.js';
import { EMOJIS } from '../config/emojis';

/**
 * The voice of the bot, taken from the old Noa: every reply opens with an emoji, a `~`, the name of whoever asked in
 * bold and a comma, then the text: `✅ ~ **Javi**, latencias de Panita`, `❌ ~ **Aaron**, no tienes permisos`.
 * Every text a member reads as an answer of the bot goes through here, never a literal ✅ or ❌.
 */

/** Whoever asked: a member or a user. */
export interface Who {
  displayName: string;
}

const NAME_MAX = 32;

const nameOf = (who: Who | null | undefined): string | null => {
  const name = who?.displayName?.trim();
  if (!name) return null;
  return escapeMarkdown(name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name);
};

/** After "**Name**," a text starts in lowercase, as Noa wrote it; an acronym or a proper noun in capitals is kept. */
const lowerFirst = (text: string) => (/^\p{Lu}\p{Ll}/u.test(text) ? text[0].toLowerCase() + text.slice(1) : text);

const upperFirst = (text: string) => (/^\p{Ll}/u.test(text) ? text[0].toUpperCase() + text.slice(1) : text);

const line = (emoji: string, who: Who | null | undefined, text: string): string => {
  const name = nameOf(who);
  return name ? `${emoji} ~ **${name}**, ${lowerFirst(text)}` : `${emoji} ~ ${upperFirst(text)}`;
};

/** `✅ ~ **Name**, text` */
export const ok = (who: Who | null | undefined, text: string): string => line(EMOJIS.check, who, text);

/** `❌ ~ **Name**, text` */
export const fail = (who: Who | null | undefined, text: string): string => line(EMOJIS.cross, who, text);

/** `🟡 ~ **Name**, text`, for a question the bot asks back ("who do you mean?"). */
export const ask = (who: Who | null | undefined, text: string): string => line(EMOJIS.idle, who, text);

/** The quoted usage line that follows a bad command: `> **Uso:** \`!emoji <add | remove>\``, more lines continue the quote. */
export const usageLine = (usages: readonly string[]): string =>
  usages.map((usage, index) => (index === 0 ? `> **Uso:** \`${usage}\`` : `> \`${usage}\``)).join('\n');

/** Who asked, for an interaction: the member (with the nickname) when there is one, otherwise the account. */
export const whoOf = (interaction: { user: Who; member: unknown }): Who => {
  const member = interaction.member as Partial<Who> | null;
  return typeof member?.displayName === 'string' ? (member as Who) : interaction.user;
};
