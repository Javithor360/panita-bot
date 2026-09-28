/**
 * Prevents feedback loops between the two sync directions: while the bot applies a role coming
 * from the database (PG-Sync), the resulting `guildMemberUpdate` must not be written back.
 */

/** Reference-counted per user, so overlapping locks don't release each other early. */
const userLocks = new Map<string, number>();
let isGlobalSyncActive = false;

/** Extra time the lock is kept after the Discord call, to catch the gateway event it triggers. */
const RELEASE_BUFFER_MS = 2500;

export const acquireSyncLock = (discordId: string) => {
  userLocks.set(discordId, (userLocks.get(discordId) ?? 0) + 1);
};

export const releaseSyncLock = (discordId: string) => {
  const count = userLocks.get(discordId) ?? 0;
  if (count <= 1) userLocks.delete(discordId);
  else userLocks.set(discordId, count - 1);
};

/** Runs `action` holding the user's lock, releasing it shortly after it finishes. */
export const withSyncLock = async <T>(discordId: string, action: () => Promise<T>): Promise<T> => {
  acquireSyncLock(discordId);
  try {
    return await action();
  } finally {
    setTimeout(() => releaseSyncLock(discordId), RELEASE_BUFFER_MS);
  }
};

export const isSyncLocked = (discordId: string) => userLocks.has(discordId) || isGlobalSyncActive;

export const setGlobalSyncLock = (active: boolean) => {
  isGlobalSyncActive = active;
};

export const isGlobalSyncLocked = () => isGlobalSyncActive;
