import { avatarFromTemplate } from '../../lib/minecraft';
import type { ChannelMap } from './channels';
import type { EventName, MessageConfig } from './messageConfig';
import type { BridgePlayer, ChatFrame, EventFrame, ModFrame } from './protocol';
import { displayNameOf, emoteNameOf } from './render';
import type { PostedMessage } from './webhook';

export interface AvatarTemplates {
  premium: string;
  cracked: string;
  /** For a player the server says the skin of; it wins over the other two. */
  skin: string;
}

export interface InboundDeps {
  channels: ChannelMap;
  webhooks: { post(channelId: string, message: PostedMessage): Promise<void> };
  messages: MessageConfig;
  /** Posts what happened to the server in the main channel. */
  announce(kind: EventName, frame: EventFrame): Promise<void>;
  avatars: AvatarTemplates;
  /** A player joined; gives the role to the member they are. */
  onJoin(player: BridgePlayer): Promise<void>;
  logger: Pick<Console, 'error'>;
}

/** The head of a player: their skin when the server says which, else the template for how they log in. */
export const avatarOf = (avatars: AvatarTemplates, player: BridgePlayer) =>
  avatarFromTemplate(player.skin ? avatars.skin : player.premium ? avatars.premium : avatars.cracked, {
    uuid: player.uuid,
    name: player.name,
    nickname: player.nickname,
    skin: player.skin,
  });

/** What a player does with `/me` is shown in italics, as Discord shows an action. */
const emoteText = (text: string) => `*${text.replaceAll('*', '\\*')}*`;

/**
 * Handles what the Minecraft server tells the bot: chat lines become webhook messages with the player's name and head, and
 * events become the messages of the config. A failure while posting is logged and never reaches the bridge.
 */
export const createInbound = (deps: InboundDeps) => {
  const chat = async (frame: ChatFrame) => {
    const channelId = deps.channels.discordIdOf(frame.channel);
    if (!channelId) return;
    await deps.webhooks.post(channelId, {
      username: frame.emote ? emoteNameOf(deps.messages, frame.player) : displayNameOf(frame.player),
      avatarUrl: avatarOf(deps.avatars, frame.player),
      content: frame.emote ? emoteText(frame.text) : frame.text,
    });
  };

  /** What happens at a join does not depend on the notification: a role is given even if the message can not be posted. */
  const event = async (frame: EventFrame) => {
    const tasks = [deps.announce(frame.kind, frame)];
    if ((frame.kind === 'join' || frame.kind === 'first_join') && frame.player) tasks.push(deps.onJoin(frame.player));
    const results = await Promise.allSettled(tasks);
    for (const result of results) {
      if (result.status === 'rejected') deps.logger.error('[Minecraft] Could not handle an event of the server:', result.reason);
    }
  };

  return (frame: ModFrame): void => {
    const work = frame.type === 'chat' ? chat(frame) : frame.type === 'event' ? event(frame) : null;
    work?.catch(error => deps.logger.error('[Minecraft] Could not pass a frame of the server to Discord:', error));
  };
};
