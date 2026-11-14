import { createCooldown } from '../../lib/cooldown';

export type LimitVerdict = 'ok' | 'cooldown' | 'daily' | 'global' | 'busy';

export interface AskLimitsConfig {
  cooldownMs: number;
  /** The wait between two replies in a conversation, shorter than between new questions. */
  replyCooldownMs: number;
  dailyPerUser: number;
  dailyGlobal: number;
  /** Questions answered at the same moment, in total. */
  maxInFlight: number;
}

export interface AskLimits {
  /** Counts a question when the member may ask it now; otherwise says which limit stops them (and counts nothing). */
  tryAcquire(userId: string, kind?: 'new' | 'reply'): LimitVerdict;
  /** Gives back the daily count of a question that was never answered (the provider failed); the cooldown stays. */
  refund(userId: string): void;
  /** Call when the question finishes, answered or not. */
  release(): void;
}

const dayOf = (at: number) => Math.floor(at / 86_400_000);

/**
 * Keeps `/ask` cheap: a wait between questions, a daily cap per member and one for everybody, and a few answers at a
 * time. Memory only: a restart gives everyone a fresh day, and the spending limit of the OpenAI project is the real ceiling.
 */
export const createAskLimits = (config: AskLimitsConfig, now: () => number = Date.now): AskLimits => {
  const cooldown = createCooldown(config.cooldownMs, now);
  const replyCooldown = createCooldown(config.replyCooldownMs, now);
  let day = dayOf(now());
  let globalCount = 0;
  const perUser = new Map<string, number>();
  let inFlight = 0;

  const rollDay = () => {
    const today = dayOf(now());
    if (today === day) return;
    day = today;
    globalCount = 0;
    perUser.clear();
  };

  return {
    tryAcquire(userId, kind = 'new') {
      rollDay();
      if (inFlight >= config.maxInFlight) return 'busy';
      if (globalCount >= config.dailyGlobal) return 'global';
      if ((perUser.get(userId) ?? 0) >= config.dailyPerUser) return 'daily';
      // Last, because it is the only check that has a side effect when it passes
      const [wait, gate] = kind === 'reply' ? [config.replyCooldownMs, replyCooldown] : [config.cooldownMs, cooldown];
      if (wait > 0 && !gate.tryAcquire(userId)) return 'cooldown';

      globalCount++;
      perUser.set(userId, (perUser.get(userId) ?? 0) + 1);
      inFlight++;
      return 'ok';
    },

    refund(userId) {
      rollDay();
      globalCount = Math.max(0, globalCount - 1);
      const used = perUser.get(userId) ?? 0;
      if (used > 1) perUser.set(userId, used - 1);
      else perUser.delete(userId);
    },

    release() {
      inFlight = Math.max(0, inFlight - 1);
    },
  };
};
