import { PermissionFlagsBits, type BaseMessageOptions, type Guild, type GuildBasedChannel, type GuildMember, type User } from 'discord.js';
import { UserError } from '../../core/errors';
import { lookupFailureText } from '../lookup/resolve';
import { avatarMessage, pictureMessage } from './avatarView';
import { ensureMembers, isMemberListComplete, joinPosition } from './members';
import type { PresenceInfo } from './presence';
import type { CosmeticsInput, PermissionsInput, VoiceInfo } from './userExtras';
import { userEmbed, userMenu, type UserView, type UserViewMember, type UserViewUser } from './userView';

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

const memberInputOf = (member: GuildMember, position: number | null): UserViewMember => ({
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
  joinPosition: position,
  voice: voiceOf(member),
});

/** What a member is doing in voice; `null` when they are not in a voice channel. */
const voiceOf = (member: GuildMember): VoiceInfo | null => {
  const state = member.voice;
  if (!state.channelId) return null;
  return {
    channelId: state.channelId,
    serverMute: !!state.serverMute,
    serverDeaf: !!state.serverDeaf,
    selfMute: !!state.selfMute,
    selfDeaf: !!state.selfDeaf,
    streaming: !!state.streaming,
    camera: !!state.selfVideo,
  };
};

const cosmeticsOf = (user: User, guild: Guild): CosmeticsInput => {
  const primary = user.primaryGuild;
  const wearing = !!primary?.identityEnabled && !!primary.tag;
  const nameplate = user.collectibles?.nameplate;
  return {
    decorationUrl: user.avatarDecorationURL() ?? null,
    nameplate: nameplate ? { label: nameplate.label, palette: nameplate.palette } : null,
    tag: wearing
      ? {
          text: primary.tag!,
          badgeUrl: user.guildTagBadgeURL() ?? null,
          guildName: primary.identityGuildId === guild.id ? guild.name : guild.client.guilds.cache.get(primary.identityGuildId ?? '')?.name ?? null,
        }
      : null,
    hasBanner: !!user.banner,
    accentColor: user.accentColor ?? null,
  };
};

/** What the member can do in a channel. `null` when there is no channel to ask about. */
const permissionsOf = (member: GuildMember, channel: GuildBasedChannel | null): PermissionsInput | null => {
  if (!channel || !('permissionsFor' in channel)) return null;
  const permissions = channel.permissionsFor(member);
  return {
    channelId: channel.id,
    voice: channel.isVoiceBased(),
    administrator: permissions?.has(PermissionFlagsBits.Administrator) ?? false,
    allowed: permissions?.toArray() ?? [],
  };
};

/** The account, fresh from Discord (the banner and the accent color only come that way), or what the cache has. */
const accountOf = async (guild: Guild, userId: string): Promise<User> => {
  const user = await guild.client.users.fetch(userId, { force: true }).catch(() => guild.client.users.cache.get(userId));
  if (!user) throw new UserError(lookupFailureText('unknown_id'));
  return user;
};

/**
 * `user`: the profile, or with a flag the badges, the cosmetics or the permissions in `channel`. Someone who is not in the
 * server only gets what the account has. With a `menuId` (the custom id of the menu, which carries who it is about) the
 * reply also has the menu that switches to another view.
 */
export const buildUserReply = async (
  guild: Guild,
  userId: string,
  view: UserView,
  channel: GuildBasedChannel | null,
  menuId?: string,
): Promise<BaseMessageOptions> => {
  const user = await accountOf(guild, userId);
  const member = await guild.members.fetch(userId).catch(() => null);

  let position: number | null = null;
  if (member && view === 'profile') {
    await ensureMembers(guild);
    const entries = [...guild.members.cache.values()].map(entry => ({ id: entry.id, joinedTimestamp: entry.joinedTimestamp }));
    position = joinPosition(entries, member.id, isMemberListComplete(entries.length, guild.memberCount));
  }

  const embed = userEmbed({
    user: userInputOf(user),
    member: member ? memberInputOf(member, position) : null,
    presence: presenceOf(member),
    view,
    cosmetics: view === 'cosmetics' ? cosmeticsOf(user, guild) : undefined,
    permissions: view === 'permissions' && member ? permissionsOf(member, channel) : null,
  });
  return { embeds: [embed], components: menuId ? [userMenu(menuId, view)] : [], allowedMentions: { parse: [] } };
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

/**
 * `avatar --banner` and `avatar --decoration`. A member's server banner is shown unless `global`; a person with none gets a
 * refusal. The banner only comes with the account fetched fresh, which `accountOf` does.
 */
export const buildPictureReply = async (guild: Guild, userId: string, kind: 'banner' | 'decoration', global: boolean): Promise<BaseMessageOptions> => {
  const user = await accountOf(guild, userId);

  if (kind === 'decoration') {
    const url = user.avatarDecorationURL({ size: 512 });
    if (!url) throw new UserError('esa persona no tiene una decoración de avatar.');
    return pictureMessage({ kind, displayName: user.displayName, imageUrl: url, formats: null });
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  const fromServer = !global && !!member?.banner;
  const source = fromServer ? member! : user;
  const hash = fromServer ? member!.banner : user.banner;
  if (!hash) throw new UserError('esa persona no tiene un banner.');

  const animated = hash.startsWith('a_');
  const url = (extension: 'png' | 'jpg' | 'webp' | 'gif') => source.bannerURL({ size: 2048, extension, forceStatic: extension !== 'gif' }) ?? '';
  return pictureMessage({
    kind,
    displayName: fromServer ? member!.displayName : user.displayName,
    imageUrl: source.bannerURL({ size: 2048, extension: animated ? 'gif' : 'png' }) ?? '',
    formats: { png: url('png'), jpg: url('jpg'), webp: url('webp'), gif: animated ? source.bannerURL({ size: 2048, extension: 'gif' }) ?? null : null },
    fromServer,
  });
};
