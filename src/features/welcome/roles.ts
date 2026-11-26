/** The part of a member needed to give them roles. */
export interface RoleReceiver {
  id: string;
  roles: {
    cache: { has(roleId: string): boolean };
    add(roleIds: string[], reason?: string): Promise<unknown>;
  };
}

export const DEFAULT_ROLES_REASON = 'Roles por defecto para los miembros nuevos';

/**
 * Gives a new member the default roles they do not have yet, all in one call. Returns the ids it asked Discord to add
 * (empty when there was nothing to do). A failure (missing permission, a role above the bot's) is thrown for the
 * caller to log, so the join is never broken by it.
 */
export const giveDefaultRoles = async (member: RoleReceiver, roleIds: readonly string[]): Promise<string[]> => {
  const missing = roleIds.filter(id => !member.roles.cache.has(id));
  if (missing.length === 0) return [];
  await member.roles.add(missing, DEFAULT_ROLES_REASON);
  return missing;
};
