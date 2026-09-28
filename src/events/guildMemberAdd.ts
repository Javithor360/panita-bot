import type { GuildMember } from 'discord.js';
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
};
