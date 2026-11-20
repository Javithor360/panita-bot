import type { BaseMessageOptions, Guild, GuildMember, User } from 'discord.js';
import { UserError } from '../../core/errors';
import { lookupFailureText } from '../lookup/resolve';
import { avatarMessage } from './avatarView';
import type { PresenceInfo } from './presence';
import { userEmbed, type UserViewMember, type UserViewUser } from './userView';

/**
 * Reads real Discord objects into the plain inputs of the views, and builds each reply. Commands and the "which one do
 * you mean?" menu both call these, so a person looks the same however they were found.
 */

export const presenceOf = (member: GuildMember | null): PresenceInfo | null => {
  const presence = member?.presence;
  if (!presence) return null;
  return {
    status: presence.status === 'invisible' ? 'offline' : presence.status,
    mobile: presence.clientStatus?.mobile != null,
    activities: presence.activities.map(activity => ({ type: activity.type, name: activity.name, state: activity.state })),
  };
};

const userInputOf = (user: User): UserViewUser => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  bot: user.bot,
  createdAt: user.createdAt,
  avatarUrl: user.displayAvatarURL({ size: 256 }),
  bannerUrl: user.bannerURL({ size: 1024 }) ?? null,
  accentColor: user.accentColor ?? null,
  flags: user.flags?.toArray() ?? [],
});

const memberInputOf = (member: GuildMember): UserViewMember => ({
  nickname: member.nickname,
  displayName: member.displayName,
  joinedAt: member.joinedAt,
  boostingSince: member.premiumSince,
  timeoutUntil: member.communicationDisabledUntil,
  avatarUrl: member.avatar ? member.displayAvatarURL({ size: 256 }) : null,
  roles: [...member.roles.cache.filter(role => role.id !== member.guild.id).sort((a, b) => b.position - a.position).values()]
    .map(role => ({ id: role.id, color: role.color })),
  roleColor: member.roles.color?.color ?? 0,
  permissions: member.permissions.toArray(),
});

/** The account, fresh from Discord (the banner and the accent color only come that way), or what the cache has. */
const accountOf = async (guild: Guild, userId: string): Promise<User> => {
  const user = await guild.client.users.fetch(userId, { force: true }).catch(() => guild.client.users.cache.get(userId));
  if (!user) throw new UserError(lookupFailureText('unknown_id'));
  return user;
};

/** `user`: the profile, or with `badges` the badges. Someone who is not in the server only gets the account's part. */
export const buildUserReply = async (guild: Guild, userId: string, badges: boolean): Promise<BaseMessageOptions> => {
  const user = await accountOf(guild, userId);
  const member = await guild.members.fetch(userId).catch(() => null);
  const embed = userEmbed({
    user: userInputOf(user),
    member: member ? memberInputOf(member) : null,
    presence: presenceOf(member),
    badges,
  });
  return { embeds: [embed], allowedMentions: { parse: [] } };
};

/** `avatar`: the server avatar of a member when they have one (unless `global`), otherwise the account's. */
export const buildAvatarReply = async (guild: Guild, userId: string, global: boolean): Promise<BaseMessageOptions> => {
  const user = await accountOf(guild, userId);
  const member = await guild.members.fetch(userId).catch(() => null);

  const hasServerAvatar = !!member?.avatar;
  const fromServer = hasServerAvatar && !global;
  const target = fromServer ? member! : user;
  const animated = (fromServer ? member!.avatar : user.avatar)?.startsWith('a_') ?? false;

  const url = (extension: 'png' | 'jpg' | 'webp' | 'gif', forceStatic: boolean) => target.displayAvatarURL({ size: 2048, extension, forceStatic });
  return avatarMessage({
    displayName: fromServer ? member!.displayName : user.displayName,
    imageUrl: url(animated ? 'gif' : 'png', false),
    formats: { png: url('png', true), jpg: url('jpg', true), webp: url('webp', true), gif: animated ? url('gif', false) : null },
    fromServer,
    hasServerAvatar,
  });
};
