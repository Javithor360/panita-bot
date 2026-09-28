import type { GuildMember } from 'discord.js';
import { isDeveloper, isStaff } from '../lib/discord';
import type { Access } from './command';

/** Returns the denial message, or `null` when the member may run a command with this access level. */
export const accessDenial = (access: Access | undefined, member: GuildMember): string | null => {
  if (access === 'developer' && !isDeveloper(member.id)) {
    return '❌ No estás autorizado para usar este comando.';
  }
  if (access === 'staff' && !isStaff(member)) {
    return '❌ No tienes permisos de Staff para usar este comando.';
  }
  return null;
};

export const canAccess = (access: Access | undefined, member: GuildMember) => accessDenial(access, member) === null;
