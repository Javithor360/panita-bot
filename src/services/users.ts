import bcrypt from 'bcryptjs';
import { Prisma, type User as DbUser } from '../generated/prisma/client';
import type { User } from 'discord.js';
import { prisma } from '../lib/prisma';
import { avatarUrlOf } from '../lib/discord';

/** Role every new account starts with (managed by panita-web). */
const DEFAULT_ROLE_ID = 'default';
const PASSWORD_SALT_ROUNDS = 10;

export class IgnTakenError extends Error {}
export class UserNotFoundError extends Error {}

export interface DiscordProfile {
  discordId: string;
  username: string;
  avatarUrl: string;
  joinedAt?: Date | null;
}

export const profileOf = (user: User, joinedAt?: Date | null): DiscordProfile => ({
  discordId: user.id,
  username: user.username,
  avatarUrl: avatarUrlOf(user),
  joinedAt,
});

const isPrismaError = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

export const findUserByDiscordId = (discordId: string) =>
  prisma.user.findUnique({ where: { discord_id: discordId } });

/**
 * Returns the user's account, creating a disabled one (no IGN/password, default role) if missing.
 */
export const ensureUser = async (profile: DiscordProfile): Promise<{ user: DbUser; created: boolean }> => {
  const existing = await findUserByDiscordId(profile.discordId);
  if (existing) return { user: existing, created: false };

  const defaultRole = await prisma.role.findUnique({ where: { id: DEFAULT_ROLE_ID }, select: { id: true } });

  try {
    const user = await prisma.user.create({
      data: {
        discord_id: profile.discordId,
        discord_name: profile.username,
        ign: null,
        enabled: false,
        password: null,
        trusted_author: false,
        joined_at: profile.joinedAt ?? new Date(),
        avatar_url: profile.avatarUrl,
        roles: { connect: defaultRole ? [defaultRole] : [] },
      },
    });
    return { user, created: true };
  } catch (error) {
    // Created concurrently by another event (e.g. member join + /register at the same time)
    if (isPrismaError(error, 'P2002')) {
      const user = await findUserByDiscordId(profile.discordId);
      if (user) return { user, created: false };
    }
    throw error;
  }
};

/** Updates the cached Discord profile fields. No-op when the user has no account. */
export const syncProfile = async (discordId: string, fields: { username?: string; avatarUrl?: string }) => {
  const data: Prisma.UserUpdateManyMutationInput = {};
  if (fields.username !== undefined) data.discord_name = fields.username;
  if (fields.avatarUrl !== undefined) data.avatar_url = fields.avatarUrl;
  if (Object.keys(data).length === 0) return 0;

  const { count } = await prisma.user.updateMany({ where: { discord_id: discordId }, data });
  return count;
};

/** Enables the web account with its IGN and password. */
export const activateAccount = async (discordId: string, ign: string, password: string) => {
  const hashedPassword = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
  try {
    return await prisma.user.update({
      where: { discord_id: discordId },
      data: { ign, password: hashedPassword, enabled: true },
    });
  } catch (error) {
    if (isPrismaError(error, 'P2002')) throw new IgnTakenError(ign);
    if (isPrismaError(error, 'P2025')) throw new UserNotFoundError(discordId);
    throw error;
  }
};

export const deleteUsersByDiscordIds = async (discordIds: string[]) => {
  if (discordIds.length === 0) return 0;
  const { count } = await prisma.user.deleteMany({ where: { discord_id: { in: discordIds } } });
  return count;
};
