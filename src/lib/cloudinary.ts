import { createHash } from 'node:crypto';
import { URLS } from '../config/constants';
import type { CloudinaryConfig } from '../config/env';

const REQUEST_TIMEOUT_MS = 30_000;

/** An image on Cloudinary: its public URL and the id to remove it with. */
export interface UploadedImage {
  url: string;
  publicId: string;
}

export interface CloudinaryClient {
  /** Uploads an image into `folder`, named by Cloudinary like the website's uploads. Throws `CloudinaryError`. */
  upload(file: Buffer, contentType: string, folder: string): Promise<UploadedImage>;
  /** Removes an image. Failures are logged and swallowed: a leftover file is better than a failed answer. */
  destroy(publicId: string): Promise<void>;
}

export class CloudinaryError extends Error {}

/** Cloudinary signs the sorted `name=value` pairs of the request plus the secret (the file and the key are not part of it). */
const sign = (params: Record<string, string>, apiSecret: string): string => {
  const payload = Object.keys(params)
    .sort()
    .map(name => `${name}=${params[name]}`)
    .join('&');
  return createHash('sha1').update(payload + apiSecret).digest('hex');
};

/**
 * A signed client for the two calls the quick upload needs, with `fetch` so the bot needs no SDK. The upload takes no
 * preset, public id or transformation, exactly as the website's `uploadImage`.
 */
export const createCloudinary = (config: CloudinaryConfig, now: () => number = Date.now): CloudinaryClient => {
  const form = (params: Record<string, string>) => {
    const body = new FormData();
    for (const [name, value] of Object.entries(params)) body.set(name, value);
    body.set('api_key', config.apiKey);
    body.set('signature', sign(params, config.apiSecret));
    return body;
  };
  const timestamp = () => String(Math.floor(now() / 1000));

  return {
    async upload(file, contentType, folder) {
      const body = form({ folder, timestamp: timestamp() });
      body.set('file', new Blob([new Uint8Array(file)], { type: contentType }), 'upload');

      let response: Response;
      try {
        response = await fetch(URLS.cloudinaryApi(config.cloudName, 'upload'), {
          method: 'POST',
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        throw new CloudinaryError('Cloudinary could not be reached');
      }

      const result = (await response.json().catch(() => null)) as { secure_url?: unknown; public_id?: unknown; error?: { message?: unknown } } | null;
      if (!response.ok || typeof result?.secure_url !== 'string' || typeof result.public_id !== 'string') {
        const reason = typeof result?.error?.message === 'string' ? result.error.message : `HTTP ${response.status}`;
        throw new CloudinaryError(`Cloudinary refused the upload: ${reason}`);
      }
      return { url: result.secure_url, publicId: result.public_id };
    },

    async destroy(publicId) {
      try {
        const response = await fetch(URLS.cloudinaryApi(config.cloudName, 'destroy'), {
          method: 'POST',
          body: form({ public_id: publicId, timestamp: timestamp() }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) console.error(`[Cloudinary] Could not remove ${publicId}: HTTP ${response.status}`);
      } catch (error) {
        console.error(`[Cloudinary] Could not remove ${publicId}:`, error);
      }
    },
  };
};
