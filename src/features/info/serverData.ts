import { ChannelType, GuildFeature, GuildScheduledEventStatus, PermissionFlagsBits, type Guild, type GuildBasedChannel, type GuildMember } from 'discord.js';
import { stickerFormatName } from './labels';
import { hasPicture } from './stickerParse';
import { ensureMembers, isMemberListComplete, joinExtremes } from './members';
import { countPresences } from './presence';
import { presenceOf } from './replies';
import type { ActivityData, CommunityData, EventRow, ServerExtra, SoundRow, StickerRow } from './serverExtras';
import { ACTIVITY_MEMBERS } from './serverExtras';
import type { CategoryNode, ChannelKind, ChannelNode, ServerData, ServerView } from './serverView';

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
    boosters: members
      .filter(member => member.premiumSince)
      .map(member => ({ id: member.id, since: member.premiumSince! }))
      .sort((a, b) => a.since.getTime() - b.since.getTime()),
    membersComplete: counted,
    tree,
  };
};

const activityOf = async (guild: Guild): Promise<ActivityData> => {
  const inVoice = [...guild.voiceStates.cache.values()].filter(state => state.channelId && !state.member?.user.bot);
  const perChannel = new Map<string, number>();
  for (const state of inVoice) perChannel.set(state.channelId!, (perChannel.get(state.channelId!) ?? 0) + 1);

  const threads = await guild.channels.fetchActiveThreads().then(found => found.threads.size).catch(() => 0);
  const stamps = [...guild.members.cache.values()]
    .filter(member => member.joinedAt)
    .map(member => ({ id: member.id, joinedAt: member.joinedAt!, joinedTimestamp: member.joinedTimestamp }));
  const { oldest, newest } = joinExtremes(stamps, ACTIVITY_MEMBERS);

  return {
    voiceTotal: inVoice.length,
    voiceChannels: [...perChannel.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count),
    activeThreads: threads,
    oldest: oldest.map(({ id, joinedAt }) => ({ id, joinedAt })),
    newest: newest.map(({ id, joinedAt }) => ({ id, joinedAt })),
  };
};

const communityOf = async (guild: Guild): Promise<CommunityData> => ({
  description: guild.description,
  rulesChannelId: guild.rulesChannelId,
  systemChannelId: guild.systemChannelId,
  updatesChannelId: guild.publicUpdatesChannelId,
  safetyChannelId: guild.safetyAlertsChannelId,
  // The cached code is not always there; asking for it needs Manage Server, so a refusal just leaves it out
  vanityCode:
    guild.vanityURLCode ?? (guild.features.includes(GuildFeature.VanityURL) ? await guild.fetchVanityData().then(vanity => vanity.code).catch(() => null) : null),
  locale: guild.preferredLocale,
  mfaLevel: guild.mfaLevel,
  explicitFilter: guild.explicitContentFilter,
  notifications: guild.defaultMessageNotifications,
  maxMembers: guild.maximumMembers,
  nsfwLevel: guild.nsfwLevel,
});

const eventsOf = async (guild: Guild): Promise<EventRow[]> => {
  const events = await guild.scheduledEvents.fetch().catch(() => null);
  if (!events) return [];
  return [...events.values()]
    .filter(event => event.status === GuildScheduledEventStatus.Scheduled || event.status === GuildScheduledEventStatus.Active)
    .sort((a, b) => (a.scheduledStartTimestamp ?? 0) - (b.scheduledStartTimestamp ?? 0))
    .map(event => ({
      name: event.name,
      startsAt: event.scheduledStartAt,
      active: event.status === GuildScheduledEventStatus.Active,
      where: event.channelId ? { channelId: event.channelId } : event.entityMetadata?.location ? { location: event.entityMetadata.location } : null,
    }));
};

const soundsOf = async (guild: Guild): Promise<SoundRow[]> => {
  const sounds = await guild.soundboardSounds.fetch().catch(() => null);
  if (!sounds) return [];
  return [...sounds.values()].map(sound => ({
    name: sound.name,
    emoji: sound.emoji?.toString() ?? null,
    volume: sound.volume,
    uploader: sound.user?.username ?? null,
    available: sound.available,
  }));
};

const stickersOf = (guild: Guild): StickerRow[] =>
  [...guild.stickers.cache.values()].map(sticker => ({
    id: sticker.id,
    name: sticker.name,
    description: sticker.description,
    imageUrl: hasPicture(sticker.format) ? sticker.url : null,
    tags: sticker.tags,
    format: stickerFormatName(sticker.format),
    available: sticker.available !== false,
  }));

/** What a flag needs besides the plain data. It is read only for that flag, so the plain `server` never pays for it. */
export const collectExtra = async (guild: Guild, view: ServerView): Promise<ServerExtra> => {
  switch (view) {
    case 'activity': return { activity: await activityOf(guild) };
    case 'community': return { community: await communityOf(guild) };
    case 'events': return { events: await eventsOf(guild) };
    case 'sounds': return { sounds: await soundsOf(guild) };
    case 'stickers': return { stickers: stickersOf(guild) };
    default: return {};
  }
};
