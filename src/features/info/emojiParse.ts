import { URLS } from '../../config/constants';

/** What a person wrote when they pointed at an emoji. */
export type ParsedEmoji =
  | { kind: 'custom'; id: string; name: string; animated: boolean }
  | { kind: 'id'; id: string }
  | { kind: 'name'; name: string }
  | { kind: 'unicode'; chars: string; codepoints: string };

const CUSTOM = /^<(a?):(\w{2,32}):(\d{17,20})>$/;
const SHORTCODE = /^:(\w{2,32}):$/;
const SNOWFLAKE = /^\d{17,20}$/;
const WORD = /^\w{2,32}$/;
const KEYCAP = /^[0-9#*]️?⃣$/u;
const PICTOGRAPH = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})/u;
const ZWJ = '‍';
const VARIATION_SELECTOR = 'fe0f';

/** The file name of a unicode emoji in Twemoji: its code points in hex, without the variation selector unless it is a joined sequence. */
export const twemojiCodepoints = (chars: string): string => {
  const points = [...chars].map(char => char.codePointAt(0)!.toString(16));
  return (chars.includes(ZWJ) ? points : points.filter(point => point !== VARIATION_SELECTOR)).join('-');
};

const firstGrapheme = (text: string): string => {
  const [first] = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text);
  return first?.segment ?? '';
};

/**
 * Reads what was written: the markup of a custom emoji (`<:name:id>`, `<a:name:id>`), a shortcode (`:name:`), an ID, a
 * unicode emoji, or a plain name. `null` when it is none of those.
 */
export const parseEmoji = (text: string): ParsedEmoji | null => {
  const clean = text.trim();
  if (!clean) return null;

  const custom = CUSTOM.exec(clean);
  if (custom) return { kind: 'custom', id: custom[3], name: custom[2], animated: custom[1] === 'a' };

  const shortcode = SHORTCODE.exec(clean);
  if (shortcode) return { kind: 'name', name: shortcode[1] };

  if (SNOWFLAKE.test(clean)) return { kind: 'id', id: clean };

  const first = firstGrapheme(clean);
  if (PICTOGRAPH.test(first) || KEYCAP.test(first)) return { kind: 'unicode', chars: first, codepoints: twemojiCodepoints(first) };

  return WORD.test(clean) ? { kind: 'name', name: clean } : null;
};

const CDN = 'https://cdn.discordapp.com/emojis';

export interface EmojiImages {
  /** The picture shown, as big as is useful. */
  image: string;
  /** The same emoji at full size in each format; the GIF only when it is animated. */
  png: string;
  webp: string;
  gif: string | null;
}

export const emojiImages = (id: string, animated: boolean): EmojiImages => ({
  image: `${CDN}/${id}.${animated ? 'gif' : 'png'}?size=1024`,
  png: `${CDN}/${id}.png?size=4096`,
  webp: `${CDN}/${id}.webp?size=4096`,
  gif: animated ? `${CDN}/${id}.gif?size=4096` : null,
});

/** Where the picture of an emoji is taken from to copy it into this server. */
export const emojiSourceUrl = (id: string, animated: boolean): string => `${CDN}/${id}.${animated ? 'gif' : 'png'}?size=128`;

export const unicodeImage = (codepoints: string): string => URLS.twemoji(codepoints);

export const EMOJI_NAME = /^[A-Za-z0-9_]{2,32}$/;

/** The names Discord accepts for an emoji: letters, numbers and `_`, from 2 to 32 characters. */
export const isValidEmojiName = (name: string): boolean => EMOJI_NAME.test(name);
