import { UserError } from '../core/errors';
import { api, isApiError } from '../lib/api';
import type { Tag } from '../lib/api/types';

export type { Tag };

/** Names the API accepts: letters (accents allowed), digits, `_` and `-`, 1 to 64 characters. */
export const TAG_NAME_PATTERN = /^[\p{L}\p{N}_-]{1,64}$/u;

/** Text limit of a tag; the API refuses more. */
export const TAG_CONTENT_MAX = 4000;
const TAG_MEDIA_MAX = 10;

export const INVALID_TAG_NAME =
  '❌ El nombre del tag solo puede tener letras, números, `-` y `_` (máximo 64 caracteres).';

export const listTags = () => api.get<Tag[]>('/v1/tags');

/** The tag, or `null` when it doesn't exist (a name the API would refuse can't exist either). */
export const getTag = async (name: string): Promise<Tag | null> => {
  if (!TAG_NAME_PATTERN.test(name)) return null;
  try {
    return await api.get<Tag>('/v1/tags/{name}', { params: { name } });
  } catch (error) {
    if (isApiError(error, 404)) return null;
    throw error;
  }
};

/** Creates the tag or replaces its content. */
export const saveTag = async (tag: { name: string; content: string | null; mediaUrls: string[]; authorId: string }) => {
  if (!TAG_NAME_PATTERN.test(tag.name)) throw new UserError(INVALID_TAG_NAME);
  if (tag.mediaUrls.length > TAG_MEDIA_MAX) throw new UserError(`❌ Un tag puede tener como máximo ${TAG_MEDIA_MAX} adjuntos.`);

  const content = tag.content?.trim() ? tag.content : null;
  return api.put<Tag>(
    '/v1/tags/{name}',
    { content, media_urls: tag.mediaUrls, author_id: tag.authorId },
    { params: { name: tag.name } },
  );
};

/** Returns false when the tag didn't exist. */
export const deleteTag = async (name: string): Promise<boolean> => {
  if (!TAG_NAME_PATTERN.test(name)) return false;
  try {
    await api.delete('/v1/tags/{name}', { params: { name } });
    return true;
  } catch (error) {
    if (isApiError(error, 404)) return false;
    throw error;
  }
};
