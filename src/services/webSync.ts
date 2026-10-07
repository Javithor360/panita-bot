import type { Client } from 'discord.js';
import { env } from '../config/env';
import { api } from '../lib/api';
import type { SyncEvent, SyncEventsMeta } from '../lib/api/types';
import { isGlobalSyncLocked, withSyncLock } from '../lib/syncLock';

/**
 * Web → Discord sync. Changes to a member's roles or editions made on the website are written by the
 * API to an outbox (`GET /v1/discord/sync-events`); this polls it and applies the matching Discord role.
 * The cursor lives in memory: events from while the bot was offline are not replayed (`/systemsync`
 * repairs drift), the same as with the database notifications this replaces.
 */

const POLL_INTERVAL_MS = 5_000;
const PAGE_LIMIT = 100;
/** Event ids are assigned when a transaction inserts and visible when it commits, so a slow one can surface behind the cursor. */
const CURSOR_OVERLAP = 20;
const HANDLED_MAX = 500;
const MAX_BACKOFF_MS = 60_000;
/** Safety net against a loop of full pages. */
const MAX_PAGES_PER_POLL = 20;

/** The part of a Discord member the poller touches. */
export interface SyncMember {
  roles: {
    cache: { has(roleId: string): boolean };
    add(roleId: string): Promise<unknown>;
    remove(roleId: string): Promise<unknown>;
  };
}

export interface WebSyncDeps {
  /** `after` is a cursor or `latest`; answers the events (oldest first) and the newest cursor. */
  fetchEvents(after: number | 'latest', limit: number): Promise<{ events: SyncEvent[]; cursor: number }>;
  /** The guild member, or `null` when they left or can't be fetched. */
  fetchMember(discordId: string): Promise<SyncMember | null>;
  isGlobalSyncLocked(): boolean;
  withSyncLock<T>(discordId: string, action: () => Promise<T>): Promise<T>;
  schedule(callback: () => void, delayMs: number): unknown;
  logger: Pick<Console, 'log' | 'error'>;
}

export interface WebSync {
  /** Begins polling. */
  start(): void;
  /** One poll. Never throws; schedules the next one. */
  poll(): Promise<void>;
}

export const createWebSync = (deps: WebSyncDeps): WebSync => {
  const { logger } = deps;
  let cursor: number | null = null;
  let failures = 0;
  const handled = new Set<number>();

  const remember = (id: number) => {
    handled.add(id);
    if (handled.size > HANDLED_MAX) handled.delete(handled.values().next().value as number);
  };

  /** Applies one event if Discord isn't already in the desired state. Never throws. */
  const apply = async (event: SyncEvent) => {
    try {
      const member = await deps.fetchMember(event.discord_id);
      if (!member) return;

      const hasRole = member.roles.cache.has(event.discord_role_id);
      if ((event.action === 'add') === hasRole) return; // already in the desired state

      await deps.withSyncLock(event.discord_id, () =>
        event.action === 'add' ? member.roles.add(event.discord_role_id) : member.roles.remove(event.discord_role_id),
      );
      const [verb, preposition] = event.action === 'add' ? ['Added', 'to'] : ['Removed', 'from'];
      logger.log(`[Web-Sync] ${verb} ${event.kind} role ${event.discord_role_id} ${preposition} ${event.discord_id}`);
    } catch (error) {
      logger.error(`[Web-Sync] Could not apply event ${event.id}:`, error);
    }
  };

  const handle = async (event: SyncEvent) => {
    if (handled.has(event.id)) return;
    remember(event.id);
    if (event.origin === 'bot') return; // the bot's own change, already in Discord
    if (deps.isGlobalSyncLocked()) return; // consumed and dropped while /systemsync runs
    await apply(event);
  };

  const poll = async () => {
    let next = POLL_INTERVAL_MS;
    try {
      if (cursor === null) {
        cursor = (await deps.fetchEvents('latest', 1)).cursor;
        logger.log(`[Web-Sync] Polling the API for web changes (cursor ${cursor})`);
      } else {
        for (let page = 0; page < MAX_PAGES_PER_POLL; page++) {
          const { events } = await deps.fetchEvents(Math.max(0, cursor - CURSOR_OVERLAP), PAGE_LIMIT);
          for (const event of events) await handle(event);
          if (events.length > 0) cursor = Math.max(cursor, events[events.length - 1].id);
          if (events.length < PAGE_LIMIT) break; // a full page: ask again at once
        }
      }
      if (failures > 0) logger.log('[Web-Sync] Recovered; polling again.');
      failures = 0;
    } catch (error) {
      failures++;
      if (failures === 1) logger.error('[Web-Sync] Could not poll the API; retrying with backoff:', error);
      next = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** (failures - 1));
    }
    deps.schedule(() => void poll(), next);
  };

  return { start: () => void poll(), poll };
};

/** Starts polling for web changes. Needs `GUILD_ID`, like the sync it replaces. */
export const startWebSync = (client: Client) => {
  const guildId = env.GUILD_ID;
  if (!guildId) {
    console.error('[Web-Sync] GUILD_ID is required for the web sync; it will not start.');
    return;
  }

  createWebSync({
    async fetchEvents(after, limit) {
      // The poller backs off by itself, and a successful poll every few seconds needs no log line
      const { data, meta } = await api.getEnvelope<SyncEvent[], SyncEventsMeta>('/v1/discord/sync-events', {
        query: { after, limit },
        idempotent: false,
        quiet: true,
      });
      return { events: data, cursor: meta.cursor };
    },
    fetchMember: async discordId => (await client.guilds.cache.get(guildId)?.members.fetch(discordId).catch(() => null)) ?? null,
    isGlobalSyncLocked,
    withSyncLock,
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    logger: console,
  }).start();
};
