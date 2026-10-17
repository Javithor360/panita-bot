/**
 * Remembers values for a while (e.g. the last upload options of a member, to fall back on when the API is slow).
 * Memory only. Expired entries are dropped when read, and the whole map is swept as it grows.
 */
export interface TtlCache<V> {
  /** The value, or `undefined` when there is none or it has expired. */
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  delete(key: string): void;
}

const SWEEP_ABOVE = 500;

export const createTtlCache = <V>(ttlMs: number, now: () => number = Date.now): TtlCache<V> => {
  const entries = new Map<string, { value: V; expiresAt: number }>();

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      const current = now();
      if (entries.size >= SWEEP_ABOVE) {
        for (const [other, entry] of entries) if (entry.expiresAt <= current) entries.delete(other);
      }
      entries.set(key, { value, expiresAt: current + ttlMs });
    },
    delete(key) {
      entries.delete(key);
    },
  };
};
