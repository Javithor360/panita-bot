import { api, ApiError, isApiError } from '../lib/api';
import type { BotUser, CreatedPhoto, DiscordPhotoRequest, RandomPhoto, UploadOptions } from '../lib/api/types';

/** A gallery photo with the fields the `/gallery` embed reads, dates already converted. */
export type GalleryPhoto = Omit<RandomPhoto, 'date_taken' | 'created_at'> & {
  date_taken: Date | null;
  created_at: Date;
};

/** A random enabled image from the gallery, or `null` when there are none. */
export const getRandomPhoto = async (): Promise<GalleryPhoto | null> => {
  try {
    const photo = await api.get<RandomPhoto>('/v1/photos/random');
    return {
      ...photo,
      date_taken: photo.date_taken ? new Date(photo.date_taken) : null,
      created_at: new Date(photo.created_at),
    };
  } catch (error) {
    if (isApiError(error, 404)) return null;
    throw error;
  }
};

/** Whether the member is an enabled trusted author, who may upload from Discord. `false` for an unknown member. */
export const isTrustedAuthor = async (discordId: string): Promise<boolean> => {
  try {
    const user = await api.get<BotUser>('/v1/discord/users/{discordId}', { params: { discordId } });
    return user.enabled && user.trusted_author;
  } catch (error) {
    if (isApiError(error, 404)) return false;
    throw error;
  }
};

/**
 * What the member may choose in a quick upload, or `null` for a Discord id with no account. `timeoutMs` bounds
 * the wait and, being set, the call is not retried (the caller has a fallback).
 */
export const getUploadOptions = async (discordId: string, timeoutMs?: number): Promise<UploadOptions | null> => {
  try {
    return await api.get<UploadOptions>('/v1/discord/users/{discordId}/upload-options', {
      params: { discordId },
      ...(timeoutMs === undefined ? {} : { timeoutMs, idempotent: false }),
    });
  } catch (error) {
    if (isApiError(error, 404)) return null;
    throw error;
  }
};

/** Why the API refused a quick upload. */
export type PhotoRefusal = 'not_found' | 'not_allowed' | 'reserved_category' | 'unknown_id' | 'invalid';

/** The API refused the photo (`4xx`), so nothing was saved and the uploaded file may be removed. */
export class PhotoRefusedError extends Error {
  constructor(readonly reason: PhotoRefusal) {
    super(reason);
  }
}

/**
 * Saves a photo already on Cloudinary and returns it. Throws `PhotoRefusedError` for the refusals the member can
 * be told about; any other `ApiError` is thrown as it came (`transient` means the outcome is unknown: the photo
 * may have been saved). Never retried, since repeating it could save the photo twice.
 */
export const createGalleryPhoto = async (body: DiscordPhotoRequest): Promise<CreatedPhoto> => {
  try {
    return await api.post<CreatedPhoto>('/v1/discord/photos', body);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 404) throw new PhotoRefusedError('not_found');
    if (error.status === 403) throw new PhotoRefusedError(error.details?.fields ? 'reserved_category' : 'not_allowed');
    if (error.status === 400) throw new PhotoRefusedError(error.details?.reason === 'unknown_id' ? 'unknown_id' : 'invalid');
    throw error;
  }
};
