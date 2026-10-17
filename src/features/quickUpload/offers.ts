import type { AttachmentLike, UsableOptions } from './rules';

/** The reply with the button, which the offer removes when it ends. */
export interface OfferReply {
  delete(): Promise<unknown>;
}

/** The photo's message: asked again at upload time, since the signed links of its attachments expire. */
export interface OfferSource {
  fetch(): Promise<{ attachments: { values(): Iterable<AttachmentLike> }; react(emoji: string): Promise<unknown> }>;
}

export interface Offer {
  messageId: string;
  channelId: string;
  ownerId: string;
  /** Names the member's Cloudinary folder. */
  discordName: string;
  options: UsableOptions;
  source: OfferSource;
  reply: OfferReply;
  /** `uploading` from the moment a form is accepted until the upload ends or fails in a way that allows another try. */
  state: 'open' | 'uploading';
}

type Timer = ReturnType<typeof setTimeout>;

/**
 * The offers waiting for their author, by the id of the photo's message. Memory only: an offer is lost on restart,
 * and its button then says so. An offer removes its reply after `ttlMs` or when it ends, whichever comes first.
 */
export const createOfferStore = (ttlMs: number, setTimer: (run: () => void, ms: number) => Timer = setTimeout) => {
  const offers = new Map<string, { offer: Offer; timer: Timer }>();

  const dropReply = (offer: Offer) =>
    offer.reply.delete().catch(error => {
      // Already gone (the author or a moderator removed it) is fine
      console.log(`[QuickUpload] Could not delete the offer reply of ${offer.messageId}:`, error instanceof Error ? error.message : error);
    });

  const end = (messageId: string) => {
    const entry = offers.get(messageId);
    if (!entry) return;
    offers.delete(messageId);
    clearTimeout(entry.timer);
    void dropReply(entry.offer);
  };

  return {
    get: (messageId: string): Offer | undefined => offers.get(messageId)?.offer,
    has: (messageId: string) => offers.has(messageId),
    add(offer: Offer) {
      const timer = setTimer(() => end(offer.messageId), ttlMs);
      // A pending timer must not keep the process alive on shutdown
      timer.unref?.();
      offers.set(offer.messageId, { offer, timer });
    },
    /** Ends the offer and removes its reply. */
    end,
  };
};

export type OfferStore = ReturnType<typeof createOfferStore>;
