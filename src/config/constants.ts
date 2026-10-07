import type { PermissionsString } from 'discord.js';

/** Prefix for classic text commands. */
export const PREFIX = '!';

const WEB_BASE = 'https://www.panitacraft.com';

export const URLS = {
  web: `${WEB_BASE}/`,
  login: `${WEB_BASE}/login`,
  api: 'https://api.panitacraft.com',
  tezzlar3: `${WEB_BASE}/tezzlar3`,
  gallery: (photoId: string) => `${WEB_BASE}/gallery?photo=${photoId}`,
  editionIcon: (editionId: string) => `https://res.cloudinary.com/panita/image/upload/panita-web/logos/icon_${editionId}.png`,
  paypal: 'https://www.paypal.me/Javithor360',
  discordInvite: 'https://discord.gg/m9zFH8yqUu',
  trailer: 'https://youtu.be/DgSIYtxt_jEZ',
  resourcesDownload: 'https://drive.google.com/file/d/1JPClbxD9urlw_sNY2xtu-5OD8S0YIlE5/view',
  fabricInstaller: 'https://fabricmc.net/use/installer/',
  ticketHelpChannel: 'https://discord.com/channels/707103390852710491/1406385534712156301/1521266058206511146',
} as const;

export const SERVER = {
  domain: 'mc.panitacraft.com',
  numericIp: '51.81.146.102:25593',
} as const;

// TODO: move these Discord CDN attachments to Cloudinary; signed Discord links expire.
export const ASSETS = {
  picel: 'https://media.discordapp.net/attachments/1032440236564824105/1513754769322414080/Picel.gif?ex=6a43e83d&is=6a4296bd&hm=2400706674437e00e7d3c1568db74b36023a1d2f0848416115937b2bf6a84f16&=',
  tezzlarHearts: 'https://media.discordapp.net/attachments/1032440236564824105/1519191750948819025/corazonestezzlar.png?ex=6a43e952&is=6a4297d2&hm=aa4cabc21f3ea3d19283a2e0dadb950a762861b92f6bf42879d75a75640225c7&=&format=webp&quality=lossless&width=960&height=960',
  llamushroomIcon: 'https://cdn.discordapp.com/emojis/1513402349920714852.webp?size=96',
} as const;

export const EMOJIS = {
  llamushroom: '<:llamushroom:1513402349920714852>',
  jaimePog: '<:jaimePog:723406415917613056>',
  noAutorizo: '<:noautorizo:1116806520265506866>',
  tezzlar3: '<a:tezzlar3:1513802514884067409>',
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
