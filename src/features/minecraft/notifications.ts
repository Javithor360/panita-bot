import { EmbedBuilder } from 'discord.js';
import { COLORS } from '../../config/constants';
import { MC_TEXT } from './messages';
import type { BridgePlayer, EventFrame } from './protocol';

const GREY = 0x95a5a6;

/** What a player is called in chat, or their name when they have no nickname. */
export const displayNameOf = (player: BridgePlayer) => player.nickname ?? player.name;

/**
 * The embed the bot posts for something that happened in the game, or null for an event that says nothing worth posting.
 * `avatarOf` gives the head of a player.
 */
export const eventEmbed = (frame: EventFrame, avatarOf: (player: BridgePlayer) => string): EmbedBuilder | null => {
  const embed = new EmbedBuilder();
  const player = frame.player;
  const about = (text: string, color: number) => {
    embed.setColor(color).setDescription(text);
    if (player) embed.setAuthor({ name: displayNameOf(player), iconURL: avatarOf(player) });
    return embed;
  };

  switch (frame.kind) {
    case 'join':
      return player ? about(MC_TEXT.join(displayNameOf(player)), COLORS.success) : null;
    case 'first_join':
      return player ? about(MC_TEXT.firstJoin(displayNameOf(player)), COLORS.blurple) : null;
    case 'leave':
      return player ? about(MC_TEXT.leave(displayNameOf(player)), GREY) : null;
    case 'death':
      return frame.text ? about(MC_TEXT.death(frame.text), COLORS.dark) : null;
    case 'advancement':
      return frame.text ? about(MC_TEXT.advancement(frame.text), COLORS.warning) : null;
    case 'broadcast':
      return frame.text ? about(MC_TEXT.broadcast(frame.text), COLORS.blurple) : null;
    case 'started':
      return about(MC_TEXT.started, COLORS.success);
    case 'stopping':
      return about(MC_TEXT.stopping, COLORS.error);
  }
};
