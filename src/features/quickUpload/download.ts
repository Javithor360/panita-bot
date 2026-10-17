import { QUICK_UPLOAD, mediaTypeOf, type AttachmentLike } from './rules';

const DOWNLOAD_TIMEOUT_MS = 20_000;

/** The image is bigger than the limit (Discord's reported size is checked first; this is the real one). */
export class ImageTooBigError extends Error {}
/** The image could not be downloaded from Discord. */
export class ImageUnavailableError extends Error {}

export interface DownloadedImage {
  buffer: Buffer;
  contentType: string;
}

/** Downloads an attachment, refusing anything over the limit before and after reading it. */
export const downloadImage = async (attachment: AttachmentLike): Promise<DownloadedImage> => {
  if (attachment.size > QUICK_UPLOAD.maxBytes) throw new ImageTooBigError(attachment.name);

  let response: Response;
  try {
    response = await fetch(attachment.url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch {
    throw new ImageUnavailableError('Discord could not be reached');
  }
  if (!response.ok) throw new ImageUnavailableError(`HTTP ${response.status}`);

  const declared = Number(response.headers.get('content-length'));
  if (declared > QUICK_UPLOAD.maxBytes) throw new ImageTooBigError(attachment.name);

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await response.arrayBuffer());
  } catch {
    throw new ImageUnavailableError('The download was interrupted');
  }
  if (buffer.length > QUICK_UPLOAD.maxBytes) throw new ImageTooBigError(attachment.name);

  return { buffer, contentType: mediaTypeOf(attachment) };
};
