import {
  PermissionFlagsBits,
  type GuildMember,
  type OverwriteResolvable,
  type PermissionOverwriteOptions,
} from 'discord.js';
import { TICKET_MEMBER_PERMISSIONS } from '../../config/constants';

/** Overwrite granting a user full participation in a ticket channel. */
export const TICKET_MEMBER_OVERWRITE: PermissionOverwriteOptions = Object.fromEntries(
  TICKET_MEMBER_PERMISSIONS.map(permission => [permission, true]),
);

export const buildTicketOverwrites = (options: {
  guildId: string;
  creatorId: string;
  botId: string;
  staffRoleId: string | null;
}): OverwriteResolvable[] => {
  const overwrites: OverwriteResolvable[] = [
    { id: options.guildId, deny: [PermissionFlagsBits.ViewChannel] },
    { id: options.creatorId, allow: [...TICKET_MEMBER_PERMISSIONS] },
    { id: options.botId, allow: [...TICKET_MEMBER_PERMISSIONS, 'ManageChannels'] },
  ];
  if (options.staffRoleId) overwrites.push({ id: options.staffRoleId, allow: [...TICKET_MEMBER_PERMISSIONS] });
  return overwrites;
};

/** Staff of the ticket's panel, or a server administrator. */
export const canManageTicket = (member: GuildMember, panel: { staff_role_id: string | null }) =>
  member.permissions.has(PermissionFlagsBits.Administrator) ||
  (!!panel.staff_role_id && member.roles.cache.has(panel.staff_role_id));
