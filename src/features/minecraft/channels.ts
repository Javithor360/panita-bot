export interface ChannelEntry {
  /** The chat channel of the Minecraft server, such as `global` or `staff`. */
  chat: string;
  /** The Discord channel joined to it. */
  discordId: string;
}

/** Which Discord channel is joined to which chat channel of the server. */
export class ChannelMap {
  constructor(private readonly entries: readonly ChannelEntry[]) {}

  /** The chat channels the bot bridges, which the mod is told when it connects. */
  chatChannels(): string[] {
    return this.entries.map(entry => entry.chat);
  }

  discordIds(): string[] {
    return this.entries.map(entry => entry.discordId);
  }

  discordIdOf(chat: string): string | undefined {
    return this.entries.find(entry => entry.chat === chat)?.discordId;
  }

  chatChannelOf(discordId: string): string | undefined {
    return this.entries.find(entry => entry.discordId === discordId)?.chat;
  }

  /** The channel where notifications and the topic go: the global chat. */
  get main(): string | undefined {
    return this.discordIdOf('global');
  }
}

/** Builds the map from the settings, leaving out the channels that are not set. */
export const channelMapOf = (settings: { global?: string; staff?: string }): ChannelMap =>
  new ChannelMap(
    [
      { chat: 'global', discordId: settings.global },
      { chat: 'staff', discordId: settings.staff },
    ].flatMap(({ chat, discordId }) => (discordId ? [{ chat, discordId }] : [])),
  );
