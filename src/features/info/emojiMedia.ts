import { createCanvas, loadImage } from '@napi-rs/canvas';
import { UserError } from '../../core/errors';
import { emojiLimit } from './labels';

/**
 * The picture of an emoji that `emoji add` takes: where it may come from, how it is read and what is done when it is too
 * big. It comes from the network, so only Discord's own hosts are accepted, with a timeout and a size cap.
 */

export const ALLOWED_HOSTS = ['cdn.discordapp.com', 'media.discordapp.net'] as const;
/** The most that is downloaded, before anything is resized. */
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
/** Discord refuses an emoji over this size. */
export const MAX_EMOJI_BYTES = 256 * 1024;
export const DOWNLOAD_TIMEOUT_MS = 15_000;
/** Static images that are too big are shrunk to fit in this square. */
export const RESIZE_TO = 128;

export type ImageKind = 'png' | 'jpeg' | 'gif' | 'webp';

export interface Sniffed {
  kind: ImageKind;
  /** GIFs count as animated emojis; so does a WebP with the animation flag. */
  animated: boolean;
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((byte, index) => bytes[offset + index] === byte);

/** What a file is, from its first bytes (never from its name or its header). `null` when it is not a supported image. */
export const sniffImage = (bytes: Uint8Array): Sniffed | null => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'png', animated: false };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: 'jpeg', animated: false };
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return { kind: 'gif', animated: true };
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    // The VP8X header has a flag for animation (bit 1 of the byte at 20)
    const extended = startsWith(bytes, [0x56, 0x50, 0x38, 0x58], 12);
    return { kind: 'webp', animated: extended && ((bytes[20] ?? 0) & 0x02) !== 0 };
  }
  return null;
};

/** A link to an image on Discord's CDN, or `null` for anything else (another host, plain http, not a link). */
export const allowedImageUrl = (text: string): URL | null => {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  return url.protocol === 'https:' && (ALLOWED_HOSTS as readonly string[]).includes(url.hostname) ? url : null;
};

const NOT_ALLOWED = 'solo acepto imágenes de Discord (enlaces de cdn.discordapp.com o media.discordapp.net).';
const TOO_BIG = 'la imagen pesa demasiado, el máximo es 8 MB.';

export const downloadImage = async (link: string, fetcher: typeof fetch = fetch): Promise<Buffer> => {
  const url = allowedImageUrl(link);
  if (!url) throw new UserError(NOT_ALLOWED);

  let response: Response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch {
    throw new UserError('no pude descargar la imagen, inténtalo de nuevo.');
  }
  // A redirect may only lead to another host of Discord
  if (response.url && !allowedImageUrl(response.url)) throw new UserError(NOT_ALLOWED);
  if (!response.ok) throw new UserError('no pude descargar la imagen, revisa que el enlace siga funcionando.');
  if (Number(response.headers.get('content-length')) > MAX_SOURCE_BYTES) throw new UserError(TOO_BIG);

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await response.arrayBuffer());
  } catch {
    throw new UserError('la descarga de la imagen se interrumpió, inténtalo de nuevo.');
  }
  if (bytes.length > MAX_SOURCE_BYTES) throw new UserError(TOO_BIG);
  return bytes;
};

/** A static image, in a PNG of at most `RESIZE_TO` pixels a side (never bigger than the original). */
export const shrinkToEmoji = async (bytes: Buffer): Promise<Buffer> => {
  let image;
  try {
    image = await loadImage(bytes);
  } catch {
    throw new UserError('no pude leer la imagen, prueba con otra.');
  }
  const scale = Math.min(1, RESIZE_TO / image.width, RESIZE_TO / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').drawImage(image, 0, 0, width, height);
  return canvas.toBuffer('image/png');
};

export interface PreparedEmoji {
  data: Buffer;
  animated: boolean;
  /** Whether the picture was shrunk (or turned into a PNG) to be accepted. */
  resized: boolean;
}

/**
 * Makes the picture something Discord accepts as an emoji: a PNG, JPEG or GIF of at most 256 KB. A static image that is
 * too big (or a still WebP) is shrunk; an animated one that is too big cannot be, and is refused.
 */
export const prepareEmojiImage = async (bytes: Buffer, shrink: (bytes: Buffer) => Promise<Buffer> = shrinkToEmoji): Promise<PreparedEmoji> => {
  const sniffed = sniffImage(bytes);
  if (!sniffed) throw new UserError('eso no es una imagen válida, usa PNG, JPG, GIF o WebP.');

  if (sniffed.kind === 'webp' && sniffed.animated) throw new UserError('no soporto WebP animado, usa un GIF.');

  const fits = bytes.length <= MAX_EMOJI_BYTES;
  if (fits && sniffed.kind !== 'webp') return { data: bytes, animated: sniffed.animated, resized: false };

  if (sniffed.animated) throw new UserError('el emoji animado pesa más de 256 KB y no lo puedo reducir, usa uno más liviano.');

  const data = await shrink(bytes);
  if (data.length > MAX_EMOJI_BYTES) throw new UserError('la imagen sigue pesando más de 256 KB aunque la reduje, prueba con otra.');
  return { data, animated: false, resized: true };
};

/** The server has no room for one more emoji of that kind: the text of the refusal, or `null` when there is. */
export const slotProblem = (input: { animated: boolean; boostTier: number; still: number; animatedCount: number }): string | null => {
  const limit = emojiLimit(input.boostTier);
  const used = input.animated ? input.animatedCount : input.still;
  return used >= limit
    ? `ya no hay espacio para emojis ${input.animated ? 'animados' : 'normales'} en el servidor (${used}/${limit}).`
    : null;
};
