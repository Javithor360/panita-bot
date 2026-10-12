/**
 * Lets something happen once per key per window (e.g. one help reply per user per minute). Memory only: it
 * is lost on restart, which is fine for a courtesy limit. Expired keys are dropped as the map grows.
 */
export interface Cooldown {
  /** True (and starts the window) when the key may act now; false while its window is still running. */
  tryAcquire(key: string): boolean;
}

const SWEEP_ABOVE = 500;

export const createCooldown = (windowMs: number, now: () => number = Date.now): Cooldown => {
  const last = new Map<string, number>();

  return {
    tryAcquire(key) {
      const current = now();
      const previous = last.get(key);
      if (previous !== undefined && current - previous < windowMs) return false;

      if (last.size >= SWEEP_ABOVE) {
        for (const [other, at] of last) if (current - at >= windowMs) last.delete(other);
      }
      last.set(key, current);
      return true;
    },
  };
};
