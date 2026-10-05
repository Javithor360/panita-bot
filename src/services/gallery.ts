import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';

/** Older rows may predate `media_type`, so video files are also excluded by extension. */
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];

const PHOTO_WHERE: Prisma.PhotoWhereInput = {
  enabled: true,
  media_type: 'image',
  NOT: VIDEO_EXTENSIONS.map(ext => ({ url: { endsWith: ext, mode: 'insensitive' as const } })),
};

const PHOTO_INCLUDE = { user: true, categories: true, edition: true } satisfies Prisma.PhotoInclude;

export type GalleryPhoto = Prisma.PhotoGetPayload<{ include: typeof PHOTO_INCLUDE }>;

/** A random enabled image from the gallery, or `null` when there are none. */
export const getRandomPhoto = async (): Promise<GalleryPhoto | null> => {
  const count = await prisma.photo.count({ where: PHOTO_WHERE });
  if (count === 0) return null;

  return prisma.photo.findFirst({
    where: PHOTO_WHERE,
    skip: Math.floor(Math.random() * count),
    include: PHOTO_INCLUDE,
  });
};
