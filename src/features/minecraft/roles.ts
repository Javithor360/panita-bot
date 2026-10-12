import type { MemberDirectory } from './directory';
import type { BridgePlayer } from './protocol';

/** The part of a guild member the join role touches. */
export interface RoleMember {
  roles: {
    cache: { has(roleId: string): boolean };
    add(roleId: string): Promise<unknown>;
  };
}

export interface JoinRoleDeps {
  /** The role given to a linked member who joins the server; none when it is not set. */
  roleId: string | undefined;
  directory: Pick<MemberDirectory, 'byIgn'>;
  /** The guild member, or null when they left or can't be fetched. */
  fetchMember(discordId: string): Promise<RoleMember | null>;
  /** While true the role is only logged, not given. */
  dryRun: boolean;
  logger: Pick<Console, 'log' | 'error'>;
}

/**
 * Gives the "joined the server" role to the linked member a player is, when they join. It is given again only at a later join,
 * never taken away, so it does not fight an administrator who removed it. A player who is not linked is skipped, and
 * the log says why, since a role that is silently not given is hard to find the reason for.
 */
export const grantJoinedRole = async (deps: JoinRoleDeps, player: BridgePlayer): Promise<void> => {
  if (!deps.roleId) return;
  try {
    const member = await deps.directory.byIgn(player.name);
    if (!member) {
      deps.logger.log(`[Minecraft] ${player.name} joined, but no linked account has that Minecraft name, so no role was given.`);
      return;
    }

    const guildMember = await deps.fetchMember(member.discord_id);
    if (!guildMember) {
      deps.logger.log(`[Minecraft] ${player.name} joined, but their Discord account (${member.discord_id}) is not in the server, so no role was given.`);
      return;
    }
    if (guildMember.roles.cache.has(deps.roleId)) return;

    if (deps.dryRun) {
      deps.logger.log(`[Minecraft] Dry run: would give the joined role to ${player.name} (${member.discord_id}).`);
      return;
    }
    await guildMember.roles.add(deps.roleId);
    deps.logger.log(`[Minecraft] Gave the joined role to ${player.name}.`);
  } catch (error) {
    deps.logger.error(`[Minecraft] Could not give the joined role to ${player.name}:`, error);
  }
};
