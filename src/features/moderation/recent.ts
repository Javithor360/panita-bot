import { MODERATION } from '../../config/constants';
import { createTtlCache } from '../../lib/ttlCache';

/** What the bot did to someone, which the audit log must not report a second time when Discord tells it about it. */
export type BotActionKind = 'ban' | 'unban' | 'kick' | 'timeout' | 'clear';

export interface BotActions {
  mark(kind: BotActionKind, id: string): void;
  /** Whether the bot did that to that id (a user, or a channel for `clear`) a moment ago. */
  has(kind: BotActionKind, id: string): boolean;
}

export const createBotActions = (ttlMs: number = MODERATION.botActionMs, now?: () => number): BotActions => {
  const cache = createTtlCache<true>(ttlMs, now);
  return {
    mark: (kind, id) => cache.set(`${kind}:${id}`, true),
    has: (kind, id) => cache.get(`${kind}:${id}`) === true,
  };
};

/** The shared memory of the running bot. */
export const botActions = createBotActions();
