/** What a person wrote when they pointed at a sticker by text: an ID or the name of a sticker of the server. */
export type StickerQuery = { kind: 'id'; id: string } | { kind: 'name'; name: string };

const SNOWFLAKE = /^\d{17,20}$/;
/** Discord names a sticker with 2 to 30 characters. */
const MAX_NAME = 30;

export const parseStickerQuery = (text: string | null | undefined): StickerQuery | null => {
  const clean = text?.trim();
  if (!clean) return null;
  if (SNOWFLAKE.test(clean)) return { kind: 'id', id: clean };
  return clean.length >= 2 && clean.length <= MAX_NAME ? { kind: 'name', name: clean } : null;
};

/** The sticker of a server whose name is this one, ignoring case and extra spaces. */
export const findByName = <T extends { name: string }>(stickers: Iterable<T>, name: string): T | null => {
  const wanted = name.trim().toLowerCase();
  for (const sticker of stickers) if (sticker.name.trim().toLowerCase() === wanted) return sticker;
  return null;
};

/** The format numbers whose sticker has a picture: Lottie (3) has none. */
export const hasPicture = (format: number): boolean => format !== 3;
