import type { GuildMember, PartialGuildMember } from 'discord.js';
import { avatarUrlOf, isHomeGuild } from '../lib/discord';
import { isSyncLocked } from '../lib/syncLock';
import { syncMemberRoles } from '../services/memberSync';
import { syncProfile } from '../services/users';

export const guildMemberUpdateEvent = async (oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) => {
  if (!isHomeGuild(newMember.guild)) return;

  const discordId = newMember.id;

  if (isSyncLocked(discordId)) {
    console.log(`[Sync] Ignored guildMemberUpdate for ${newMember.user.tag} due to active PG-Sync lock.`);
    return;
  }

  // Server avatar changes (global avatars are handled by userUpdate)
  if (oldMember.avatar !== newMember.avatar) {
    try {
      await syncProfile(discordId, { avatarUrl: avatarUrlOf(newMember) });
      console.log(`Updated server avatar for user ${newMember.user.tag}`);
    } catch (error) {
      console.error(`Failed to update server avatar for user ${discordId}:`, error);
    }
  }

  if (!oldMember.roles.cache.equals(newMember.roles.cache)) {
    try {
      // Live role removals also remove the edition (see the TODO in memberSync)
      const result = await syncMemberRoles(discordId, [...newMember.roles.cache.keys()], { removeEditions: true });
      if (result) console.log(`Synced roles and editions for user ${newMember.user.tag}`);
    } catch (error) {
      console.error(`Failed to sync roles for user ${discordId}:`, error);
    }
  }
};
