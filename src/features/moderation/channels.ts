import { ChannelType, type GuildBasedChannel, type GuildChannel } from 'discord.js';
import { UserError } from '../../core/errors';

/** The channels `hide` and `unhide` work on. */
export const HIDE_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
] as const;

/** A channel with its own permission overwrites (a thread has none: it follows its parent). */
export const overwritableChannel = (channel: GuildBasedChannel | null): GuildChannel => {
  if (!channel || !('permissionOverwrites' in channel)) {
    throw new UserError('Ese tipo de canal no se puede ocultar. Elige un canal de texto, de voz o un foro.');
  }
  return channel as GuildChannel;
};
