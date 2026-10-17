import type { Message, MessageReaction, PartialMessageReaction, PartialUser, User } from 'discord.js';
import { QUICK_UPLOAD } from '../features/quickUpload/rules';
import { quickUpload } from '../features/quickUpload';

/** A post in the gallery channel: the bot adds its 👍 when the author is a trusted author. */
export const galleryPostEvent = (message: Message) => quickUpload.onPost(message);

/**
 * A reaction in the gallery channel. The channel and the emoji are checked before anything is fetched, since
 * reactions on old messages arrive as partials. Events never throw: a failure is only logged.
 */
export const galleryReactionEvent = async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
  if (user.bot || reaction.message.channelId !== quickUpload.channelId || reaction.emoji.name !== QUICK_UPLOAD.likeEmoji) return;

  try {
    const full = reaction.partial ? await reaction.fetch() : reaction;
    const message = full.message.partial ? await full.message.fetch() : full.message;
    await quickUpload.onReaction({ emoji: full.emoji.name, userId: user.id, message });
  } catch (error) {
    console.error(`[QuickUpload] Could not handle a reaction on ${reaction.message.id}:`, error);
  }
};
