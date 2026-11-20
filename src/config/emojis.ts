/**
 * The custom emojis the bot writes in its messages. This is the only place an emoji id is written: code uses
 * `EMOJIS.key` (the text to put in a message) or `emojiOf(key)` (the object a button or a reaction needs).
 * The key is what code uses; `name` is the real name of the emoji in Discord, which can differ from it.
 */

export interface EmojiDef {
  /** The emoji's name in Discord, the part between the colons of `<:name:id>`. */
  name: string;
  id: string;
  animated?: boolean;
}

export const EMOJI_DEFS = {
  // Panitacraft server
  llamushroom: { name: 'llamushroom', id: '1513402349920714852' },
  jaimePog: { name: 'jaimePog', id: '723406415917613056' },
  noAutorizo: { name: 'noautorizo', id: '1116806520265506866' },
  tezzlar3: { name: 'tezzlar3', id: '1513802514884067409', animated: true },

  // Emoji server (guild 982841794406543400), where the bot is also a member
  check: { name: 'check', id: '1573128048881049683' },
  cross: { name: 'cross', id: '1573128033160798339' },
  online: { name: 'online', id: '1573128016446492834' },
  idle: { name: 'idle', id: '1573127993390407741' },
  offline: { name: 'offline', id: '1573127976051023983' },
  mobile: { name: 'mobile', id: '1573127956052705280' },
  dev: { name: 'dev', id: '1573127878613401732' },
  stats: { name: 'stats', id: '1573127860388892702' },
  dnd: { name: 'dnd', id: '1573164536490364979' },
  streaming: { name: 'streaming', id: '1573164234194419823' },
  boost: { name: 'boost', id: '1573127909298938008', animated: true },
} as const satisfies Record<string, EmojiDef>;

export type EmojiKey = keyof typeof EMOJI_DEFS;

const markup = ({ name, id, animated }: EmojiDef) => `<${animated ? 'a' : ''}:${name}:${id}>`;

/** The text that shows each emoji in a message (`<:name:id>`, `<a:name:id>` when animated). */
export const EMOJIS = Object.fromEntries(
  Object.entries(EMOJI_DEFS).map(([key, def]) => [key, markup(def)]),
) as { readonly [K in EmojiKey]: string };

/** The emoji as an object, for `.setEmoji(...)` on a button or a select option. */
export const emojiOf = (key: EmojiKey): { id: string; name: string; animated: boolean } => {
  const { name, id } = EMOJI_DEFS[key];
  return { id, name, animated: 'animated' in EMOJI_DEFS[key] };
};

/** The image of the emoji on Discord's CDN. */
export const emojiUrl = (key: EmojiKey, size = 96): string => {
  const { id } = EMOJI_DEFS[key];
  const animated = 'animated' in EMOJI_DEFS[key];
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'webp'}?size=${size}`;
};
