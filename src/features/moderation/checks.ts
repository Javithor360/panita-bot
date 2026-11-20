import type { Denial } from './messages';

/** Everything the rules need to know about a sanction, as plain values so they can be tested without Discord. */
export interface ModerationCheck {
  moderatorId: string;
  /** The developer may act on staff. */
  moderatorIsDeveloper: boolean;
  /** Position of the highest role of the moderator, or `null` when it is not known. */
  moderatorRolePosition: number | null;
  targetId: string;
  /** `null` when the target is not in the server (a ban of someone who left, for example). */
  target: { isStaff: boolean; rolePosition: number; manageable: boolean } | null;
  botId: string;
  guildOwnerId: string;
  /** Whether the moderator is the owner of the server, who is above every role. */
  moderatorIsOwner: boolean;
}

/** The reason the sanction is refused, or `null` when it is allowed. */
export const moderationDenial = (check: ModerationCheck): Denial | null => {
  if (check.targetId === check.moderatorId) return 'self';
  if (check.targetId === check.botId) return 'bot';
  if (check.targetId === check.guildOwnerId) return 'owner';

  const { target } = check;
  if (!target) return null;

  if (target.isStaff && !check.moderatorIsDeveloper && !check.moderatorIsOwner) return 'staff';
  if (
    !check.moderatorIsOwner
    && !check.moderatorIsDeveloper
    && check.moderatorRolePosition !== null
    && target.rolePosition >= check.moderatorRolePosition
  ) {
    return 'hierarchyModerator';
  }
  if (!target.manageable) return 'hierarchyBot';
  return null;
};
