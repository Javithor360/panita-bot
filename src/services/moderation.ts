import { MODERATION } from '../config/constants';
import { UserError } from '../core/errors';
import { api, isApiError } from '../lib/api';
import type { Warning, WarningResult, WarningsMeta } from '../lib/api/types';

export type { Warning, WarningResult };

/** The warning does not exist. */
export class WarningNotFoundError extends Error {
  constructor() {
    super('The warning does not exist');
  }
}

/** Somebody revoked the warning first. */
export class WarningAlreadyRevokedError extends Error {
  constructor() {
    super('The warning was already revoked');
  }
}

/** The warnings the API returns in one call. The sanctions only look at the active ones, which are few. */
const PAGE_SIZE = 100;

/** A reason for the API: trimmed, never empty and never longer than it accepts. */
const reasonFor = (text: string): string => {
  const reason = text.trim();
  if (!reason) throw new UserError('❌ Debes indicar una razón.');
  if (reason.length > MODERATION.reasonMax) {
    throw new UserError(`❌ La razón es demasiado larga (máximo ${MODERATION.reasonMax} caracteres).`);
  }
  return reason;
};

/** Records a warning. `active_count` already includes it, so the caller can decide the sanction without another call. */
export const createWarning = async (warning: { userId: string; moderatorId: string; reason: string }): Promise<WarningResult> =>
  api.post<WarningResult>('/v1/discord/warnings', {
    user_id: warning.userId,
    moderator_id: warning.moderatorId,
    reason: reasonFor(warning.reason),
  });

export interface WarningHistory {
  /** Newest first. */
  warnings: Warning[];
  /** How many warnings match the filter, which can be more than `warnings` holds. */
  total: number;
}

/** The warnings of a member, newest first. `active` leaves out the revoked ones. */
export const listWarnings = async (discordId: string, { active = false }: { active?: boolean } = {}): Promise<WarningHistory> => {
  const page = await api.getEnvelope<Warning[], WarningsMeta>('/v1/discord/users/{discordId}/warnings', {
    params: { discordId },
    query: { active: active ? 'true' : 'false', limit: PAGE_SIZE },
  });
  return { warnings: page.data, total: page.meta.total };
};

/** Revokes a warning, which stays in the history. */
export const revokeWarning = async (id: string, revokedBy: string, reason?: string): Promise<Warning> => {
  const text = reason?.trim();
  try {
    return await api.patch<Warning>(
      '/v1/discord/warnings/{id}',
      { revoked_by: revokedBy, ...(text ? { reason: reasonFor(text) } : {}) },
      { params: { id } },
    );
  } catch (error) {
    if (isApiError(error, 404)) throw new WarningNotFoundError();
    if (isApiError(error, 409)) throw new WarningAlreadyRevokedError();
    throw error;
  }
};
