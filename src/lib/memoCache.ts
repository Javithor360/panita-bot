import { createTtlCache } from './ttlCache';

/**
 * A cache for the result of a slow call (an API read). The value of a key is kept for `ttlMs`; a key that has no value
 * (`null`: a name that does not exist) is remembered for the shorter `missTtlMs`; and when several callers ask for the
 * same key while it is being loaded they share that one call. A failed load is never remembered. Memory only.
 */
export interface MemoCache<V> {
  /** The cached value, the one being loaded, or a fresh load. `null` means "there is none". */
  get(key: string, load: () => Promise<V | null>): Promise<V | null>;
  delete(key: string): void;
}

export interface MemoCacheOptions {
  ttlMs: number;
  missTtlMs: number;
  /** The clock, so a test needs no real waiting. */
  now?: () => number;
}

export const createMemoCache = <V>({ ttlMs, missTtlMs, now = Date.now }: MemoCacheOptions): MemoCache<V> => {
  const hits = createTtlCache<{ value: V }>(ttlMs, now);
  const misses = createTtlCache<true>(missTtlMs, now);
  const loading = new Map<string, Promise<V | null>>();

  return {
    get(key, load) {
      const hit = hits.get(key);
      if (hit) return Promise.resolve(hit.value);
      if (misses.get(key)) return Promise.resolve(null);

      const running = loading.get(key);
      if (running) return running;

      const started = (async () => {
        try {
          const value = await load();
          if (value === null) misses.set(key, true);
          else hits.set(key, { value });
          return value;
        } finally {
          loading.delete(key);
        }
      })();
      loading.set(key, started);
      return started;
    },
    delete(key) {
      hits.delete(key);
      misses.delete(key);
    },
  };
};
