import type { PermissionsString } from 'discord.js';
import { EMOJIS, emojiUrl } from './emojis';

/** Prefix for classic text commands. */
export const PREFIX = '!';

const WEB_BASE = 'https://www.panitacraft.com';

export const URLS = {
  web: `${WEB_BASE}/`,
  login: `${WEB_BASE}/login`,
  api: 'https://api.panitacraft.com',
  openai: 'https://api.openai.com/v1',
  tezzlar3: `${WEB_BASE}/tezzlar3`,
  gallery: (photoId: string) => `${WEB_BASE}/gallery?photo=${photoId}`,
  /** The photo a member has under their own number, as the shareable link of the website. */
  galleryPhotoOf: (ign: string, number: number) => `${WEB_BASE}/gallery/${encodeURIComponent(ign)}/${number}`,
  form: (slug: string) => `${WEB_BASE}/forms/${encodeURIComponent(slug)}`,
  /** Reverse image search of Google, for the "Búscalo en Google" line of `avatar`. */
  googleLens: (imageUrl: string) => `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`,
  /** A unicode emoji as an image, for `emoji` (a Twemoji file is named by its code points). */
  twemoji: (codepoints: string) => `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${codepoints}.png`,
  editionIcon: (editionId: string) => `https://res.cloudinary.com/panita/image/upload/panita-web/logos/icon_${editionId}.png`,
  cloudinaryApi: (cloudName: string, action: 'upload' | 'destroy') => `https://api.cloudinary.com/v1_1/${cloudName}/image/${action}`,
  paypal: 'https://www.paypal.me/Javithor360',
  discordInvite: 'https://discord.gg/m9zFH8yqUu',
  /** The trailer of Tezzlar 3 (`tezzlar trailer`). */
  trailer: 'https://youtu.be/DgSIYtxt_jEZ',
  /** The trailer of Enriquecraft 666 (`trailer`). */
  enriquecraftTrailer: 'https://www.youtube.com/watch?v=4nAiLdzxo9M',
  resourcesDownload: 'https://drive.google.com/file/d/1JPClbxD9urlw_sNY2xtu-5OD8S0YIlE5/view',
  fabricInstaller: 'https://fabricmc.net/use/installer/',
  /** The Terms of Use and the Privacy Policy that every player accepts, linked from the rules of Enriquecraft. */
  termsOfUse: `${WEB_BASE}/terms-of-use`,
  privacyPolicy: `${WEB_BASE}/privacy-policy`,
  /** Download page of Panita Client, the launcher with the official modpack. */
  launcherDownload: `${WEB_BASE}/downloads/launcher`,
  ticketHelpChannel: 'https://discord.com/channels/707103390852710491/1406385534712156301/1521266058206511146',
} as const;

/** The channel where the chat of Minecraft and the one of Discord meet (`#live-server`), mentioned by `enriquecraft features chat`. */
export const LIVE_SERVER_CHANNEL_ID = '1575346365205188720';

/** The webhook the bot makes in each channel it bridges to Minecraft. */
/**
 * Discord's own stickers that the bot sends under the join message of a new member, one picked at random each time (as
 * the "Wave to say hi!" button does). Wumpus Beyond, Clyde Bot, Cheerful Choco, Doggo Replies, Robo Nelly and Sassy Peach.
 */
export const WELCOME_STICKERS = [
  '749054660769218631',
  '754108890559283200',
  '781291131828699156',
  '816087792291282944',
  '751606379340365864',
  '819128604311027752',
] as const;

export const MINECRAFT_BRIDGE = { webhookName: 'Enriquecraft' } as const;

export const SERVER = {
  domain: 'mc.panitacraft.com',
  numericIp: '51.81.146.102:25593',
  /** The game version of Enriquecraft, shown by `enriquecraft join`. */
  version: '26.3',
} as const;

// TODO: move these Discord CDN attachments to Cloudinary; signed Discord links expire.
export const ASSETS = {
  picel: 'https://media.discordapp.net/attachments/1032440236564824105/1513754769322414080/Picel.gif?ex=6a43e83d&is=6a4296bd&hm=2400706674437e00e7d3c1568db74b36023a1d2f0848416115937b2bf6a84f16&=',
  tezzlarHearts: 'https://media.discordapp.net/attachments/1032440236564824105/1519191750948819025/corazonestezzlar.png?ex=6a43e952&is=6a4297d2&hm=aa4cabc21f3ea3d19283a2e0dadb950a762861b92f6bf42879d75a75640225c7&=&format=webp&quality=lossless&width=960&height=960',
  llamushroomIcon: emojiUrl('llamushroom'),
} as const;

/** Custom emojis live in `config/emojis.ts`; this keeps `import { EMOJIS } from 'config/constants'` working. */
export { EMOJIS };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Rules of the moderation commands and of the automatic sanctions that warnings trigger. */
export const MODERATION = {
  /** Active warnings that earn a timeout, and how long it lasts. */
  warnMuteAt: 3,
  warnMuteMs: HOUR_MS,
  /** Active warnings that earn a kick. */
  warnKickAt: 5,
  /** Discord does not allow a timeout longer than 28 days. */
  maxTimeoutMs: 28 * DAY_MS,
  /** The timeout of `/mute` when no time is given. */
  defaultMuteMs: HOUR_MS,
  /** `/clear` deletes between these many messages at once (Discord's bulk delete takes 2 to 100). */
  clearMin: 2,
  clearMax: 100,
  /** Days of messages `/ban` can delete (Discord allows 0 to 7). */
  banDeleteDaysMax: 7,
  /** Longest reason kept in a case, in the audit log of Discord and in the API (which refuses more than 512). */
  reasonMax: 512,
  /** How long the audit log remembers that the bot itself did something, so it does not log it twice. */
  botActionMs: 30_000,
  /** How long the confirmation of `/clear` stays in the channel. */
  clearConfirmationMs: 5000,
} as const;

/** Colors shared by more than one command. One-off colors stay next to their embed. */
export const COLORS = {
  blurple: 0x5865f2,
  error: 0xed4245,
  success: 0x57f287,
  warning: 0xfee75c,
  green: 0x38a169,
  tickets: 0x1ec45b,
  dark: 0x2b2d31,
} as const;

/** Command categories, in the order they appear in /help. */
export const CATEGORIES = {
  general: 'General',
  utility: 'Utilidad',
  fun: 'Diversión',
  minecraft: 'Minecraft',
  minecraftServer: 'Servidor de Minecraft',
  moderation: 'Moderación',
  tickets: 'Tickets',
  developer: 'Desarrollador',
} as const;

export type Category = (typeof CATEGORIES)[keyof typeof CATEGORIES];

export const CATEGORY_ORDER: readonly Category[] = Object.values(CATEGORIES);

/** Permissions granted to every participant of a ticket channel (creator, added users, staff). */
export const TICKET_MEMBER_PERMISSIONS = [
  'ViewChannel',
  'SendMessages',
  'ReadMessageHistory',
  'AttachFiles',
  'EmbedLinks',
  'UseExternalEmojis',
  'UseExternalStickers',
  'AddReactions',
  'MentionEveryone',
  'PinMessages',
] as const satisfies readonly PermissionsString[];
