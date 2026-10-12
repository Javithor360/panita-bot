import type { Guild } from 'discord.js';
import { deactivateAccount, listEnabledDiscordIds } from './users';

/**
 * Safeguards against a wrong member list. Deactivating closes every session of an account, so a partial
 * list of members must never turn into a mass deactivation.
 */
export const RECONCILE_LIMITS = {
  /** The fetched member list may fall short of `guild.memberCount` by this share before it is distrusted. */
  maxMemberGap: 0.02,
  /** More accounts than this share of the enabled ones, and more than `minCount`, is left for a human. */
  maxShare: 0.1,
  minCount: 5,
} as const;

export interface ReconcileCounts {
  /** Members the guild returned. */
  members: number;
  /** Members the guild says it has. */
  expectedMembers: number;
  enabled: number;
  /** Enabled accounts whose member is not in the guild. */
  gone: number;
}

export type ReconcilePlan =
  | { kind: 'deactivate'; ids: string[] }
  | { kind: 'skip'; reason: 'member_list_incomplete' | 'too_many_to_deactivate'; counts: ReconcileCounts };

/**
 * Decides which enabled accounts belong to members who are no longer in the server, or why nothing should
 * be touched. Pure: the member ids, the guild's own member count and the enabled ids go in.
 */
export const planReconciliation = (
  { memberIds, expectedMembers, enabledIds }: { memberIds: ReadonlySet<string>; expectedMembers: number; enabledIds: readonly string[] },
  limits = RECONCILE_LIMITS,
): ReconcilePlan => {
  const gone = enabledIds.filter(id => !memberIds.has(id));
  const counts: ReconcileCounts = { members: memberIds.size, expectedMembers, enabled: enabledIds.length, gone: gone.length };

  if (memberIds.size < expectedMembers * (1 - limits.maxMemberGap)) {
    return { kind: 'skip', reason: 'member_list_incomplete', counts };
  }
  if (gone.length > limits.minCount && gone.length > enabledIds.length * limits.maxShare) {
    return { kind: 'skip', reason: 'too_many_to_deactivate', counts };
  }
  return { kind: 'deactivate', ids: gone };
};

export interface ReconcileDeps {
  listEnabled?: () => Promise<string[]>;
  deactivate?: (discordId: string) => Promise<boolean>;
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
}

/**
 * Deactivates the accounts whose member left while the bot was not listening. Runs once at startup, never
 * throws (a failure is logged and the next start tries again) and never deletes anything.
 */
export const reconcileLeftMembers = async (
  guild: Pick<Guild, 'available' | 'memberCount'> & { members: { fetch(): Promise<ReadonlyMap<string, unknown>> } },
  { listEnabled = listEnabledDiscordIds, deactivate = deactivateAccount, logger = console }: ReconcileDeps = {},
): Promise<void> => {
  try {
    if (!guild.available) return logger.warn('[Reconcile] Skipped: the guild is unavailable.');

    const members = await guild.members.fetch();
    const enabledIds = await listEnabled();
    const plan = planReconciliation({ memberIds: new Set(members.keys()), expectedMembers: guild.memberCount, enabledIds });

    if (plan.kind === 'skip') {
      // Counts only, so a human can look at it
      return logger.warn(`[Reconcile] Skipped (${plan.reason}): ${JSON.stringify(plan.counts)}`);
    }

    let deactivated = 0;
    let failed = 0;
    for (const id of plan.ids) {
      try {
        if (await deactivate(id)) deactivated++;
      } catch (error) {
        failed++;
        logger.error(`[Reconcile] Could not deactivate ${id}:`, error);
      }
    }
    logger.log(`[Reconcile] ${plan.ids.length} account(s) of members who left: ${deactivated} deactivated, ${failed} failed.`);
  } catch (error) {
    logger.error('[Reconcile] Failed; it will be tried again at the next start:', error);
  }
};
