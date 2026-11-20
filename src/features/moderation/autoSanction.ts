import { MODERATION } from '../../config/constants';

export type AutoSanction = { kind: 'timeout'; ms: number } | { kind: 'kick' };

/**
 * What the warnings earn on their own, as in the old Noa: a timeout at the 3rd active warning and a kick at the 5th.
 * It fires only when the count is exactly that, because the API hands out each count once, so a sanction is never
 * applied twice for the same warning.
 */
export const sanctionFor = (activeCount: number): AutoSanction | null => {
  if (activeCount === MODERATION.warnKickAt) return { kind: 'kick' };
  if (activeCount === MODERATION.warnMuteAt) return { kind: 'timeout', ms: MODERATION.warnMuteMs };
  return null;
};
