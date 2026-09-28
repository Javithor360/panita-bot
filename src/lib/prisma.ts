import { PrismaClient } from '@prisma/client';

/** Single shared Prisma client for the whole bot. */
export const prisma = new PrismaClient({
  log: ['warn', 'error'],
});
