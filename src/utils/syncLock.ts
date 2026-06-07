const activeSyncLocks = new Set<string>();

export const acquireSyncLock = (discordId: string) => {
  activeSyncLocks.add(discordId);
};

export const releaseSyncLock = (discordId: string) => {
  activeSyncLocks.delete(discordId);
};

export const isSyncLocked = (discordId: string) => {
  return activeSyncLocks.has(discordId);
};
