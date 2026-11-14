/** A custom emoji of the server, as much as the assistant needs to know about it. */
export interface ServerEmoji {
  name: string;
  id: string;
  animated: boolean;
}

/** How many emoji names are offered to the model, and how many can end up in one answer. */
const MAX_LISTED = 80;
export const MAX_EMOJIS_IN_ANSWER = 3;

/** `:name:` as the model writes it. A name starts with a letter, so times such as 10:30:45 are never taken for one. */
const SHORTCODE = /:([A-Za-z_][A-Za-z0-9_]{1,31}):/g;

/** The names offered to the model, without repeats. Only these can be turned into emojis. */
export const emojiNames = (emojis: readonly ServerEmoji[]): string[] =>
  [...new Set(emojis.map(emoji => emoji.name))].slice(0, MAX_LISTED);

/**
 * Turns the `:name:` shortcodes of an answer into the server's emojis. The id always comes from the server's own
 * list, never from the model. A name that is not in the list is removed (Discord would show it as plain text), and
 * so are the emojis beyond the third.
 */
export const expandEmojis = (text: string, emojis: readonly ServerEmoji[]): string => {
  const listed = new Set(emojiNames(emojis));
  const byName = new Map<string, ServerEmoji>();
  const byLowerName = new Map<string, ServerEmoji>();
  for (const emoji of emojis) {
    if (!listed.has(emoji.name)) continue;
    if (!byName.has(emoji.name)) byName.set(emoji.name, emoji);
    if (!byLowerName.has(emoji.name.toLowerCase())) byLowerName.set(emoji.name.toLowerCase(), emoji);
  }

  let shown = 0;
  let changed = false;
  const result = text.replace(SHORTCODE, (_match, name: string) => {
    changed = true;
    const emoji = byName.get(name) ?? byLowerName.get(name.toLowerCase());
    if (!emoji || shown >= MAX_EMOJIS_IN_ANSWER) return '';
    shown++;
    return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
  });

  // A removed shortcode must not leave a gap or a space before the punctuation
  return changed ? result.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:!?])/g, '$1').trim() : result;
};
