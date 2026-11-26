import type { GuildMember } from 'discord.js';
import { env } from '../config/env';
import { giveDefaultRoles } from '../features/welcome/roles';
import { avatarUrlOf, isHomeGuild } from '../lib/discord';
import { ensureUser, profileOf, syncProfile } from '../services/users';

export const guildMemberAddEvent = async (member: GuildMember) => {
  if (!isHomeGuild(member.guild) || member.user.bot) return;

  try {
    const { created } = await ensureUser(profileOf(member.user, member.joinedAt));
    if (created) {
      console.log(`Created disabled account for new member ${member.user.tag}.`);
    } else {
      // Returning member: make sure their avatar is up to date
      await syncProfile(member.id, { avatarUrl: avatarUrlOf(member.user) });
      console.log(`Synced avatar for newly joined member ${member.user.tag}`);
    }
  } catch (error) {
    console.error(`Failed to process member join for ${member.id}:`, error);
  }

  // After the account exists, so the role sync that this triggers finds it; a failure here never undoes the above
  if (env.DEFAULT_ROLE_IDS.length > 0) {
    try {
      const given = await giveDefaultRoles(member, env.DEFAULT_ROLE_IDS);
      if (given.length > 0) console.log(`Gave ${given.length} default role(s) to ${member.user.tag}.`);
    } catch (error) {
      console.error(`Failed to give the default roles to ${member.id} (the bot needs Manage Roles and a role above them):`, error);
    }
  }
};
