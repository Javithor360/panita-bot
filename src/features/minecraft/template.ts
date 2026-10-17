import { escapeMarkdown } from 'discord.js';

const PLACEHOLDER = /\{([a-z_]+)\}/g;
/** `:name:`, unless it is already the `<:name:id>` of an emoji. */
const SHORTCODE = /(?<!<a?):([A-Za-z0-9_]{2,32}):/g;

/** The values of the placeholders of a message. */
export interface Values {
  /** Text from the game or from a player: escaped where Discord shows markdown. */
  text?: Record<string, string>;
  /** What the bot makes itself (links, mentions, numbers): never escaped. */
  raw?: Record<string, string>;
}

const own = (values: Record<string, string> | undefined, name: string) =>
  values && Object.hasOwn(values, name) ? values[name] : undefined;

/** The names between braces in a text, as in `{displayname}`. */
export const placeholdersIn = (template: string): string[] => [...template.matchAll(PLACEHOLDER)].map(match => match[1]);

/**
 * Replaces the placeholders of a template. `escape` is for the places where Discord shows markdown. A placeholder without a
 * value stays as written, and a value is never read for placeholders itself.
 */
export const fill = (template: string, values: Values, escape: boolean): string =>
  template.replace(PLACEHOLDER, (token, name: string) => {
    const text = own(values.text, name);
    if (text !== undefined) return escape ? escapeMarkdown(text) : text;
    return own(values.raw, name) ?? token;
  });

/** Turns `:name:` into the emoji `find` gives for that name; a name it does not know stays as written. */
export const resolveEmojis = (template: string, find: (name: string) => string | undefined): string =>
  template.replace(SHORTCODE, (match, name: string) => find(name) ?? match);

/** Cuts a text to what Discord accepts, with an ellipsis when something was left out. */
export const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const URL_PATTERN = /^(https?|attachment):\/\/\S+$/;

/** Whether Discord takes the text as the address of an icon or an image. */
export const isUrl = (text: string): boolean => URL_PATTERN.test(text);
