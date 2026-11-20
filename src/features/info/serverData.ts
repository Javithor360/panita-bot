import { ChannelType, GuildFeature, PermissionFlagsBits, type Guild, type GuildBasedChannel, type GuildMember } from 'discord.js';
import { ensureMembers, isMemberListComplete } from './members';
import { countPresences } from './presence';
import { presenceOf } from './replies';
import type { CategoryNode, ChannelKind, ChannelNode, ServerData } from './serverView';

/** Reads a live server into the plain data of the `server` views. */

const KIND: Partial<Record<ChannelType, ChannelKind>> = {
  [ChannelType.GuildText]: 'text',
  [ChannelType.GuildAnnouncement]: 'announcement',
  [ChannelType.GuildVoice]: 'voice',
  [ChannelType.GuildStageVoice]: 'stage',
  [ChannelType.GuildForum]: 'forum',
  [ChannelType.GuildMedia]: 'forum',
};

const voiceLike = (kind: ChannelKind) => (kind === 'voice' || kind === 'stage' ? 1 : 0);

const position = (channel: GuildBasedChannel) => ('rawPosition' in channel ? channel.rawPosition : 0);

/** The members that wear this server's tag (their profile shows it and it is turned on). `null` for a server without tags. */
const serverTagOf = (guild: Guild, members: GuildMember[], complete: boolean): ServerData['serverTag'] => {
  if (!guild.features.includes(GuildFeature.GuildTags)) return null;
  const wearing = members.filter(member => member.user.primaryGuild?.identityEnabled && member.user.primaryGuild.identityGuildId === guild.id);
  return {
    text: wearing.find(member => member.user.primaryGuild?.tag)?.user.primaryGuild?.tag ?? null,
    count: wearing.length,
    userIds: wearing.map(member => member.id),
    approximate: !complete,
  };
};

export const collectServerData = async (guild: Guild, viewer: GuildMember): Promise<ServerData> => {
  await ensureMembers(guild);

  const members = [...guild.members.cache.values()];
  const bots = members.filter(member => member.user.bot).length;
  // A cache that is far from complete would give wrong numbers: then they are left out
  const counted = isMemberListComplete(members.length, guild.memberCount);

  const channels = [...guild.channels.cache.values()];
  const categories = channels.filter(channel => channel.type === ChannelType.GuildCategory).sort((a, b) => position(a) - position(b));
  const kinds = channels.map(channel => ({ channel, kind: KIND[channel.type] })).filter((entry): entry is { channel: GuildBasedChannel; kind: ChannelKind } => !!entry.kind);

  const node = ({ channel, kind }: { channel: GuildBasedChannel; kind: ChannelKind }): ChannelNode => ({
    id: channel.id,
    kind,
    visible: channel.permissionsFor(viewer)?.has(PermissionFlagsBits.ViewChannel) ?? false,
  });
  const childrenOf = (parentId: string | null) =>
    kinds
      .filter(({ channel }) => ('parentId' in channel ? channel.parentId : null) === parentId)
      .sort((a, b) => voiceLike(a.kind) - voiceLike(b.kind) || position(a.channel) - position(b.channel))
      .map(node);

  const tree: CategoryNode[] = [
    { id: null, name: 'Sin categoría', channels: childrenOf(null) },
    ...categories.map(category => ({ id: category.id, name: category.name, channels: childrenOf(category.id) })),
  ];

  const count = (...wanted: ChannelKind[]) => kinds.filter(entry => wanted.includes(entry.kind)).length;

  return {
    id: guild.id,
    name: guild.name,
    iconUrl: guild.iconURL({ size: 2048 }),
    bannerUrl: guild.bannerURL({ size: 1024 }),
    splashUrl: guild.splashURL({ size: 1024 }),
    createdAt: guild.createdAt,
    ownerId: guild.ownerId,
    verificationLevel: guild.verificationLevel,
    boostTier: guild.premiumTier,
    boosts: guild.premiumSubscriptionCount ?? 0,
    memberCount: guild.memberCount,
    humans: counted ? members.length - bots : null,
    bots: counted ? bots : null,
    presence: countPresences(members.map(member => presenceOf(member)), guild.memberCount),
    channelCounts: {
      total: kinds.length,
      categories: categories.length,
      text: count('text'),
      voice: count('voice'),
      announcements: count('announcement'),
      forums: count('forum'),
      stages: count('stage'),
    },
    afkChannelId: guild.afkChannelId,
    afkTimeoutSeconds: guild.afkTimeout,
    roles: [...guild.roles.cache.values()]
      .filter(role => role.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map(role => ({ id: role.id, members: role.members.size })),
    emojis: [...guild.emojis.cache.values()].map(emoji => ({ markup: emoji.toString(), animated: !!emoji.animated })),
    stickers: guild.stickers.cache.size,
    features: guild.features,
    vanityCode: guild.vanityURLCode,
    serverTag: serverTagOf(guild, members, counted),
    tree,
  };
};
