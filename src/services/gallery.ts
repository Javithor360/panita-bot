import { api, isApiError } from '../lib/api';
import type { RandomPhoto } from '../lib/api/types';

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
