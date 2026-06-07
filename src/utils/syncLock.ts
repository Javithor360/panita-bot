const activeSyncLocks = new Set<string>();
let isGlobalSyncActive = false;

export const acquireSyncLock = (discordId: string) => {
  activeSyncLocks.add(discordId);
};

export const releaseSyncLock = (discordId: string) => {
  activeSyncLocks.delete(discordId);
};

export const isSyncLocked = (discordId: string) => {
  return activeSyncLocks.has(discordId) || isGlobalSyncActive;
};

export const setGlobalSyncLock = (active: boolean) => {
  isGlobalSyncActive = active;
};

export const isGlobalSyncLocked = () => isGlobalSyncActive;
