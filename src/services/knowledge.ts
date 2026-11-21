import { api, isApiError } from '../lib/api';
import type {
  BotDonors, BotEdition, BotEditionItem, BotForm, BotPanitaPick, BotPlayer, BotTopPhoto, InstanceItem,
} from '../lib/api/types';
import { createMemoCache, type MemoCache } from '../lib/memoCache';

/** Every read here is one short attempt: a slow API is as good as an absent one for a chat answer. */
const REQUEST = { timeoutMs: 5_000, idempotent: false } as const;

const HOUR_MS = 3_600_000;
/** A name that does not exist is remembered briefly, so someone who has just joined is found soon. */
const MISS_MS = 120_000;

/** How many calls to the API a single question may start. */
export const MAX_API_CALLS_PER_QUESTION = 3;

/** Thrown when a question has already used all of its calls to the API. */
export class CallBudgetError extends Error {
  constructor() {
    super('[Knowledge] This question used all of its calls to the API');
  }
}

/** Counts the calls that really go to the API (a cached answer is free). One per question. */
export interface CallBudget {
  take(): void;
}

export const createCallBudget = (max: number = MAX_API_CALLS_PER_QUESTION): CallBudget => {
  let used = 0;
  return {
    take() {
      if (used >= max) throw new CallBudgetError();
      used++;
    },
  };
};

/** The editions and forms the service has read, for the gate and the router to match names without a call. */
export interface KnownNames {
  editions: readonly BotEditionItem[];
  forms: readonly BotForm[];
}

export interface Knowledge {
  /** `null` for an unknown name. A member who hid their profile is `{ status: 'private' }`. */
  player(ign: string, budget?: CallBudget): Promise<BotPlayer | null>;
  topPhoto(ign: string, budget?: CallBudget): Promise<BotTopPhoto | null>;
  editions(budget?: CallBudget): Promise<readonly BotEditionItem[]>;
  /** `null` for a private edition and an unknown one alike: nothing tells them apart. */
  edition(id: string, budget?: CallBudget): Promise<BotEdition | null>;
  forms(budget?: CallBudget): Promise<readonly BotForm[]>;
  panitaPicks(year: number, budget?: CallBudget): Promise<readonly BotPanitaPick[]>;
  donors(budget?: CallBudget): Promise<BotDonors>;
  instances(budget?: CallBudget): Promise<readonly InstanceItem[]>;
  /** The lists read so far (possibly older than an hour), without any call. Empty until the first read. */
  known(): KnownNames;
  /** Reads the editions and the forms now, so the gate knows their names. Never throws. */
  warm(): Promise<void>;
}

/** Wraps a read: it counts against the budget only when it really goes to the API, and a 404 is "there is none". */
const read = async <T>(budget: CallBudget | undefined, call: () => Promise<T>): Promise<T | null> => {
  budget?.take();
  try {
    return await call();
  } catch (error) {
    if (isApiError(error, 404)) return null;
    throw error;
  }
};

const listCache = <V>(now: () => number): MemoCache<V> => createMemoCache<V>({ ttlMs: HOUR_MS, missTtlMs: MISS_MS, now });

export const createKnowledge = (now: () => number = Date.now): Knowledge => {
  const editionList = listCache<readonly BotEditionItem[]>(now);
  const formList = listCache<readonly BotForm[]>(now);
  const instanceList = listCache<readonly InstanceItem[]>(now);
  const players = listCache<BotPlayer>(now);
  const topPhotos = listCache<BotTopPhoto>(now);
  const editionDetails = listCache<BotEdition>(now);
  const picks = listCache<readonly BotPanitaPick[]>(now);
  const donorCache = listCache<BotDonors>(now);

  let known: KnownNames = { editions: [], forms: [] };

  // A list is a value even when it is empty, so it never takes the "missing" path
  const list = async <V>(cache: MemoCache<readonly V[]>, key: string, path: string, budget?: CallBudget, query?: Record<string, string | number>) =>
    (await cache.get(key, () => read(budget, () => api.get<readonly V[]>(path, { ...REQUEST, query })))) ?? [];

  return {
    player: (ign, budget) =>
      players.get(ign.toLowerCase(), () => read(budget, () => api.get<BotPlayer>('/v1/bot/players/{ign}', { ...REQUEST, params: { ign } }))),

    topPhoto: (ign, budget) =>
      topPhotos.get(ign.toLowerCase(), () =>
        read(budget, () => api.get<BotTopPhoto>('/v1/bot/players/{ign}/top-photo', { ...REQUEST, params: { ign } }))),

    async editions(budget) {
      const editions = await list<BotEditionItem>(editionList, 'all', '/v1/bot/editions', budget);
      known = { ...known, editions };
      return editions;
    },

    edition: (id, budget) =>
      editionDetails.get(id.toLowerCase(), () => read(budget, () => api.get<BotEdition>('/v1/bot/editions/{id}', { ...REQUEST, params: { id } }))),

    async forms(budget) {
      const forms = await list<BotForm>(formList, 'all', '/v1/bot/forms', budget);
      known = { ...known, forms };
      return forms;
    },

    panitaPicks: (year, budget) => list<BotPanitaPick>(picks, String(year), '/v1/bot/community/panita-picks', budget, { year }),

    async donors(budget) {
      const donors = await donorCache.get('all', () => read(budget, () => api.get<BotDonors>('/v1/bot/community/donors', REQUEST)));
      if (!donors) throw new Error('[Knowledge] The donors came back empty');
      return donors;
    },

    // Without a token the key makes an anonymous call: restricted instances are never in it
    instances: budget => list<InstanceItem>(instanceList, 'all', '/v1/instances', budget, { enabled_only: 'true' }),

    known: () => known,

    async warm() {
      await Promise.allSettled([this.editions(), this.forms()]);
    },
  };
};

let shared: Knowledge | null = null;

/** The knowledge of the running bot (one set of caches). */
export const getKnowledge = (): Knowledge => (shared ??= createKnowledge());
