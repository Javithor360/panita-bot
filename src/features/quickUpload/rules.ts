import type { UploadOptions } from '../../lib/api/types';

/** The numbers and names the quick upload works with. */
export const QUICK_UPLOAD = {
  likeEmoji: '👍',
  doneEmoji: '✅',
  /** What Discord and the website both accept as a photo; Cloudinary takes all of them. */
  imageTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  maxBytes: 8 * 1024 * 1024,
  /** How long the offer (the reply with the button) stays up. */
  offerTtlMs: 2 * 60_000,
  /** How long a short notice (the options could not be loaded) stays up. */
  noticeTtlMs: 15_000,
  /** The last options of a member, used when the API is slow or down. */
  optionsTtlMs: 60 * 60_000,
  /** Waiting longer than this for the options counts as slow. */
  optionsTimeoutMs: 4_000,
  /** Categories that make no sense for a member's own screenshot, on top of what the API leaves out. */
  hiddenCategories: ['others', 'lost_media', 'logos', 'textures'],
  /** Discord's limit for the options of a select menu. */
  maxSelectOptions: 25,
  titleMax: 200,
  descriptionMax: 2000,
} as const;

/** The fields of a Discord attachment the quick upload reads. */
export interface AttachmentLike {
  url: string;
  contentType: string | null;
  size: number;
  name: string;
}

/** The type without parameters (`image/png; charset=binary` is `image/png`). */
export const mediaTypeOf = (attachment: AttachmentLike): string => (attachment.contentType ?? '').split(';')[0].trim().toLowerCase();

const isImage = (attachment: AttachmentLike) => (QUICK_UPLOAD.imageTypes as readonly string[]).includes(mediaTypeOf(attachment));

/** The images of a message, in order. */
export const imagesOf = (attachments: Iterable<AttachmentLike>): AttachmentLike[] => [...attachments].filter(isImage);

/** What the member may choose: the editions (newest first, as the API sent them) and the categories, within Discord's limits. */
export interface UsableOptions {
  editions: UploadOptions['editions'];
  categories: UploadOptions['categories'];
}

export const usableOptions = (options: UploadOptions): UsableOptions => ({
  editions: options.editions.slice(0, QUICK_UPLOAD.maxSelectOptions),
  categories: options.categories.filter(category => !(QUICK_UPLOAD.hiddenCategories as readonly string[]).includes(category.id)).slice(0, QUICK_UPLOAD.maxSelectOptions),
});

/** The website's convention (`panita-web/gallery/{edition_id}/{discord_name}`); its folder import reads exactly this path. */
export const folderFor = (editionId: string, discordName: string): string => `panita-web/gallery/${editionId}/${discordName}`;
