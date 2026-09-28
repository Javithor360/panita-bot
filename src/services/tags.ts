import { prisma } from '../lib/prisma';

export const listTags = () => prisma.tag.findMany({ orderBy: { name: 'asc' } });

export const getTag = (name: string) => prisma.tag.findUnique({ where: { name } });

/** Creates the tag or replaces its content. */
export const saveTag = (tag: { name: string; content: string | null; mediaUrls: string[]; authorId: string }) => {
  const data = { content: tag.content, media_urls: tag.mediaUrls, author_id: tag.authorId };
  return prisma.tag.upsert({
    where: { name: tag.name },
    update: data,
    create: { name: tag.name, ...data },
  });
};

/** Returns false when the tag didn't exist. */
export const deleteTag = async (name: string) => {
  const { count } = await prisma.tag.deleteMany({ where: { name } });
  return count > 0;
};
