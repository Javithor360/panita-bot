import type { ChannelMap } from './channels';
import { avatarOf, type AvatarTemplates } from './inbound';
import type { EventName, MessageConfig } from './messageConfig';
import type { EventFrame } from './protocol';
import { renderEvent, type Rendered, type Surroundings } from './render';

export interface AnnouncerDeps {
  channels: ChannelMap;
  config: MessageConfig;
  avatars: AvatarTemplates;
  /** What the messages need from Discord and the bridge, read each time one is made. */
  surroundings(): Surroundings;
  /** Posts a message in a channel, as the bot. */
  notify(channelId: string, message: Rendered): Promise<void>;
  now?: () => Date;
}

/**
 * Posts what happens to the Minecraft server in the main channel, as the messages of the config say. Used for the events the
 * server reports and for the one it can not report itself: that it crashed.
 */
export const createAnnouncer = (deps: AnnouncerDeps) => async (kind: EventName, frame?: EventFrame): Promise<void> => {
  const channelId = deps.channels.main;
  if (!channelId) return;
  const message = renderEvent(deps.config, kind, frame, {
    ...deps.surroundings(),
    now: (deps.now ?? (() => new Date()))(),
    avatarOf: player => avatarOf(deps.avatars, player),
  });
  if (message) await deps.notify(channelId, message);
};

export type Announce = ReturnType<typeof createAnnouncer>;
