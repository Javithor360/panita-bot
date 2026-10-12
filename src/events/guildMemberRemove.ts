import type { GuildMember, PartialGuildMember } from 'discord.js';
import { isHomeGuild } from '../lib/discord';
import { deactivateAccount } from '../services/users';

/**
 * A member left (or was removed): their account stops working and its sessions are closed. A failure is
 * only logged; the reconciliation at the next start catches whatever was missed here.
 */
export const guildMemberRemoveEvent = async (member: GuildMember | PartialGuildMember) => {
  if (!isHomeGuild(member.guild) || member.user?.bot) return;

  try {
    if (await deactivateAccount(member.id)) console.log(`Deactivated the account of ${member.id}, who left the server.`);
  } catch (error) {
    console.error(`Failed to deactivate the account of ${member.id} after they left:`, error);
  }
};
