import type { EmbedBuilder } from 'discord.js';
import { avatarFromTemplate } from '../../lib/minecraft';
import type { ChannelMap } from './channels';
import { displayNameOf, eventEmbed } from './notifications';
import type { BridgePlayer, ChatFrame, EventFrame, ModFrame } from './protocol';
import type { PostedMessage } from './webhook';

export interface AvatarTemplates {
  premium: string;
  cracked: string;
}

export interface InboundDeps {
  channels: ChannelMap;
  webhooks: { post(channelId: string, message: PostedMessage): Promise<void> };
  /** Posts an embed as the bot. */
  notify(channelId: string, embed: EmbedBuilder): Promise<void>;
  avatars: AvatarTemplates;
  /** A player joined; gives the role to the member they are. */
  onJoin(player: BridgePlayer): Promise<void>;
  logger: Pick<Console, 'error'>;
}

/** The head of a player, from the template for how they log in. */
export const avatarOf = (avatars: AvatarTemplates, player: BridgePlayer) =>
  avatarFromTemplate(player.premium ? avatars.premium : avatars.cracked, {
    uuid: player.uuid,
    name: player.name,
    nickname: player.nickname,
  });

/** What a player does with `/me` is shown in italics, as Discord shows an action. */
const emoteText = (text: string) => `*${text.replaceAll('*', '\\*')}*`;

/**
 * Handles what the Minecraft server tells the bot: chat lines become webhook messages with the player's name and head, and
 * events become embeds. A failure while posting is logged and never reaches the bridge.
 */
export const createInbound = (deps: InboundDeps) => {
  const chat = async (frame: ChatFrame) => {
    const channelId = deps.channels.discordIdOf(frame.channel);
    if (!channelId) return;
    await deps.webhooks.post(channelId, {
      username: displayNameOf(frame.player),
      avatarUrl: avatarOf(deps.avatars, frame.player),
      content: frame.emote ? emoteText(frame.text) : frame.text,
    });
  };

  const event = async (frame: EventFrame) => {
    const channelId = deps.channels.main;
    if (!channelId) return;
    const embed = eventEmbed(frame, player => avatarOf(deps.avatars, player));
    if (embed) await deps.notify(channelId, embed);
    if ((frame.kind === 'join' || frame.kind === 'first_join') && frame.player) await deps.onJoin(frame.player);
  };

  return (frame: ModFrame): void => {
    const work = frame.type === 'chat' ? chat(frame) : frame.type === 'event' ? event(frame) : null;
    work?.catch(error => deps.logger.error('[Minecraft] Could not pass a frame of the server to Discord:', error));
  };
};
