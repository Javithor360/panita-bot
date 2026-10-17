import { MessageFlags, type ButtonInteraction, type MessageReplyOptions, type ModalSubmitInteraction } from 'discord.js';
import { button, modal } from '../../core/command';
import { ApiError } from '../../lib/api';
import { CloudinaryError, type CloudinaryClient } from '../../lib/cloudinary';
import { createTtlCache } from '../../lib/ttlCache';
import type { UploadOptions } from '../../lib/api/types';
import { createGalleryPhoto, getUploadOptions, isTrustedAuthor, PhotoRefusedError } from '../../services/gallery';
import { downloadImage, ImageTooBigError } from './download';
import { createOfferStore, type Offer, type OfferReply, type OfferSource } from './offers';
import { folderFor, imagesOf, QUICK_UPLOAD, usableOptions, type AttachmentLike } from './rules';
import { buildOffer, buildUploadModal, FIELDS, REFUSAL_MESSAGES, UPLOAD_ACTIONS, UPLOAD_MESSAGES } from './view';

/** What the quick upload reads of a message; discord.js's `Message` fits it. */
export interface PostLike {
  id: string;
  channelId: string;
  author: { id: string; bot: boolean };
  webhookId?: string | null;
  attachments: { values(): Iterable<AttachmentLike> };
  react(emoji: string): Promise<unknown>;
}

/** A message the author reacted to: it also needs to be answered, re-read and checked for the bot's own ✅. */
export interface ReactedMessage extends PostLike, OfferSource {
  reactions: { cache: { get(emoji: string): { me: boolean } | undefined } };
  reply(options: MessageReplyOptions): Promise<OfferReply>;
}

export interface QuickUploadDeps {
  /** The gallery channel; without it, or without Cloudinary, the quick upload is off. */
  channelId: string | undefined;
  cloudinary: CloudinaryClient | undefined;
  now?: () => number;
  setTimer?: (run: () => void, ms: number) => ReturnType<typeof setTimeout>;
}

const EPHEMERAL = MessageFlags.Ephemeral;

/**
 * The quick upload of the gallery: a trusted author's photo post gets a 👍 from the bot, and when its author adds
 * their own 👍 the bot offers a form that uploads the photo to Cloudinary and saves it through the API. Everything
 * the member sees about the upload is private except the offer itself.
 */
export const createQuickUpload = (deps: QuickUploadDeps) => {
  const { channelId, cloudinary } = deps;
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? setTimeout;

  const offers = createOfferStore(QUICK_UPLOAD.offerTtlMs, setTimer);
  /** The last options of each member, for when the API is slow or down. Only members who could upload are kept. */
  const lastOptions = createTtlCache<UploadOptions>(QUICK_UPLOAD.optionsTtlMs, now);
  /** Messages whose offer is being prepared, so a second 👍 in that moment does not make a second offer. */
  const starting = new Set<string>();

  /** The channel and the storage are both needed; the type narrows `cloudinary` for the upload. */
  const active = channelId && cloudinary ? { channelId, cloudinary } : undefined;

  /** A short public notice that removes itself. */
  const notice = async (message: ReactedMessage, content: string) => {
    const reply = await message.reply({ content, allowedMentions: { users: [message.author.id], repliedUser: false } });
    const timer = setTimer(() => void reply.delete().catch(() => undefined), QUICK_UPLOAD.noticeTtlMs);
    timer.unref?.();
  };

  /** The member's options from the API, or the last ones when it fails; `null` when they cannot upload (or nothing is known). */
  const optionsFor = async (message: ReactedMessage): Promise<UploadOptions | null> => {
    const id = message.author.id;
    try {
      const options = await getUploadOptions(id, QUICK_UPLOAD.optionsTimeoutMs);
      if (!options?.can_upload) {
        lastOptions.delete(id);
        return null;
      }
      lastOptions.set(id, options);
      return options;
    } catch (error) {
      console.error(`[QuickUpload] Could not load the upload options of ${id}:`, error instanceof Error ? error.message : error);
      const remembered = lastOptions.get(id);
      if (!remembered) await notice(message, UPLOAD_MESSAGES.optionsUnavailable(id));
      return remembered ?? null;
    }
  };

  /** A trusted author's post with an image gets the bot's 👍; anyone else's gets nothing. */
  const onPost = async (message: PostLike) => {
    if (!active || message.channelId !== active.channelId || message.author.bot || message.webhookId) return;
    if (imagesOf(message.attachments.values()).length === 0) return;
    try {
      if (await isTrustedAuthor(message.author.id)) await message.react(QUICK_UPLOAD.likeEmoji);
    } catch (error) {
      console.error(`[QuickUpload] Could not check the author of ${message.id}:`, error instanceof Error ? error.message : error);
    }
  };

  /** The author's own 👍 on their photo starts the offer. Anyone else's 👍 is just a reaction. */
  const onReaction = async (reaction: { emoji: string | null; userId: string; message: ReactedMessage }) => {
    const { message } = reaction;
    if (!active || message.channelId !== active.channelId || reaction.emoji !== QUICK_UPLOAD.likeEmoji) return;
    if (message.author.bot || reaction.userId !== message.author.id) return;
    const images = imagesOf(message.attachments.values());
    if (images.length === 0) return;
    if (message.reactions.cache.get(QUICK_UPLOAD.doneEmoji)?.me) return;
    if (offers.has(message.id) || starting.has(message.id)) return;

    starting.add(message.id);
    try {
      const options = await optionsFor(message);
      if (!options) return;
      const usable = usableOptions(options);
      if (usable.editions.length === 0 || usable.categories.length === 0) {
        await notice(message, UPLOAD_MESSAGES.noOptions(message.author.id));
        return;
      }
      const reply = await message.reply(buildOffer(message.id, message.author.id, images.length));
      offers.add({
        messageId: message.id,
        channelId: message.channelId,
        ownerId: message.author.id,
        discordName: options.discord_name,
        options: usable,
        source: message,
        reply,
        state: 'open',
      });
    } catch (error) {
      console.error(`[QuickUpload] Could not offer the upload of ${message.id}:`, error);
    } finally {
      starting.delete(message.id);
    }
  };

  /** The offer this press belongs to, if it is still up and is theirs. */
  const offerFor = (interaction: ButtonInteraction | ModalSubmitInteraction, messageId: string | undefined): Offer | undefined => {
    const offer = messageId ? offers.get(messageId) : undefined;
    return offer && offer.ownerId === interaction.user.id ? offer : undefined;
  };

  const upload = async (interaction: ModalSubmitInteraction, offer: Offer, storage: CloudinaryClient) => {
    const tell = (content: string) => interaction.editReply({ content });
    /** Ends the offer for good (its reply goes) and tells the author why. */
    const finish = (content: string) => {
      offers.end(offer.messageId);
      return tell(content);
    };
    /** Keeps the offer so the same button can be tried again. */
    const retry = (content: string) => {
      offer.state = 'open';
      return tell(content);
    };

    const title = interaction.fields.getTextInputValue(FIELDS.title).trim();
    const description = interaction.fields.getTextInputValue(FIELDS.description).trim() || null;
    const [editionId] = interaction.fields.getStringSelectValues(FIELDS.edition);
    const categoryIds = [...interaction.fields.getStringSelectValues(FIELDS.categories)];
    const knownEdition = offer.options.editions.some(edition => edition.id === editionId);
    const knownCategories = categoryIds.length > 0 && categoryIds.every(id => offer.options.categories.some(category => category.id === id));
    if (!title || !knownEdition || !knownCategories) return retry(REFUSAL_MESSAGES.invalid);

    await tell(UPLOAD_MESSAGES.uploading);

    // The signed links of the attachments expire, so the message is read again
    const message = await offer.source.fetch().catch(() => null);
    const image = message ? imagesOf(message.attachments.values())[0] : undefined;
    if (!message || !image) return finish(UPLOAD_MESSAGES.gone);

    let file;
    try {
      file = await downloadImage(image);
    } catch (error) {
      if (error instanceof ImageTooBigError) return finish(UPLOAD_MESSAGES.tooBig);
      console.error(`[QuickUpload] Could not download the image of ${offer.messageId}:`, error instanceof Error ? error.message : error);
      return retry(UPLOAD_MESSAGES.storageFailed);
    }

    let stored;
    try {
      stored = await storage.upload(file.buffer, file.contentType, folderFor(editionId, offer.discordName));
    } catch (error) {
      if (!(error instanceof CloudinaryError)) throw error;
      console.error(`[QuickUpload] ${error.message}`);
      return retry(UPLOAD_MESSAGES.storageFailed);
    }

    try {
      const photo = await createGalleryPhoto({
        discord_id: offer.ownerId,
        url: stored.url,
        title,
        description,
        edition_id: editionId,
        category_ids: categoryIds,
      });
      await message.react(QUICK_UPLOAD.doneEmoji).catch(error => console.error(`[QuickUpload] Could not add ✅ to ${offer.messageId}:`, error));
      return finish(UPLOAD_MESSAGES.done(photo.id));
    } catch (error) {
      // A refusal means nothing was saved, so the file is removed. A timeout or a server error does not say that:
      // the photo may have been saved, so the file stays.
      const unknownOutcome = !(error instanceof PhotoRefusedError) && (!(error instanceof ApiError) || error.transient);
      if (unknownOutcome) {
        console.error(`[QuickUpload] The outcome of saving ${offer.messageId} is unknown; its file stays on Cloudinary.`);
        return finish(UPLOAD_MESSAGES.unknownOutcome);
      }
      await storage.destroy(stored.publicId);
      return finish(error instanceof PhotoRefusedError ? REFUSAL_MESSAGES[error.reason] : REFUSAL_MESSAGES.invalid);
    }
  };

  /** The button and the form, added to the components of `/gallery` (the router needs a command as the namespace). */
  const components = {
    // Args: id of the photo's message. The form must be the first answer (3 seconds), so it is built from what is held.
    [UPLOAD_ACTIONS.open]: button({
      async run(interaction, [messageId]) {
        const offer = offerFor(interaction, messageId);
        if (!offer) return interaction.reply({ content: UPLOAD_MESSAGES.expired, flags: EPHEMERAL });
        if (offer.state === 'uploading') return interaction.reply({ content: UPLOAD_MESSAGES.busy, flags: EPHEMERAL });
        await interaction.showModal(buildUploadModal(offer.messageId, offer.ownerId, offer.options));
      },
    }),

    // Args: id of the photo's message
    [UPLOAD_ACTIONS.submit]: modal({
      async run(interaction, [messageId]) {
        const offer = offerFor(interaction, messageId);
        if (!offer || !active) return interaction.reply({ content: UPLOAD_MESSAGES.expired, flags: EPHEMERAL });
        // Checked and set before anything is awaited, so a double submit finds the offer busy
        if (offer.state === 'uploading') return interaction.reply({ content: UPLOAD_MESSAGES.busy, flags: EPHEMERAL });
        offer.state = 'uploading';

        await interaction.deferReply({ flags: EPHEMERAL });
        try {
          await upload(interaction, offer, active.cloudinary);
        } catch (error) {
          // Whatever went wrong, the author may press the button again while the offer lasts
          if (offers.get(offer.messageId) === offer) offer.state = 'open';
          throw error;
        }
      },
    }),
  };

  return { enabled: Boolean(active), channelId, onPost, onReaction, components, offers };
};
