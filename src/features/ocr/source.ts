/** Which image to read, and how to download it safely. */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10_000;
/** What tesseract can decode. */
const IMAGE_TYPE = /^image\/(png|jpe?g|webp|bmp)$/i;
/** Discord's own file hosts. Embed pictures are always read through their proxy copy, never from the original site. */
const DISCORD_HOST = /(^|\.)discord(app)?\.(com|net)$/i;

export interface ImageCandidate {
  url: string;
  contentType?: string | null;
}
export interface MessageImages {
  /** An array or a discord.js collection. */
  attachments: { values(): Iterable<{ url: string; contentType: string | null }> };
  embeds: Iterable<{ image?: { proxyURL?: string | null } | null; thumbnail?: { proxyURL?: string | null } | null }>;
}

const isImageAttachment = (contentType: string | null) => !!contentType && IMAGE_TYPE.test(contentType.split(';')[0].trim());

/** The first readable image of a message: an attached picture, otherwise the picture of a link preview. */
export const imageUrlOf = ({ attachments, embeds }: MessageImages): string | null => {
  for (const attachment of attachments.values()) if (isImageAttachment(attachment.contentType)) return attachment.url;
  for (const embed of embeds) {
    const url = embed.image?.proxyURL ?? embed.thumbnail?.proxyURL;
    if (url) return url;
  }
  return null;
};

export const isDiscordUrl = (raw: string) => {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && DISCORD_HOST.test(url.hostname);
  } catch {
    return false;
  }
};

export class ImageDownloadError extends Error {}

/** Downloads the image, refusing other hosts, redirects, other file types and big files. */
export const downloadImage = async (url: string, fetchImage: typeof fetch = fetch): Promise<Buffer> => {
  if (!isDiscordUrl(url)) throw new ImageDownloadError('host');
  const response = await fetchImage(url, { redirect: 'error', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new ImageDownloadError(`HTTP ${response.status}`);
  if (!isImageAttachment(response.headers.get('content-type'))) throw new ImageDownloadError('type');
  if (Number(response.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) throw new ImageDownloadError('size');

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) throw new ImageDownloadError('size');
  return buffer;
};
