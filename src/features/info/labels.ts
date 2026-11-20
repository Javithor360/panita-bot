/** Spanish names and limits for what Discord reports about a server. The limits are Discord's today and live only here. */

/** Noa's own jokes for the two highest levels. Keys are `GuildVerificationLevel`. */
export const VERIFICATION: Record<number, string> = {
  0: 'Ninguno',
  1: 'Bajo',
  2: 'Medio',
  3: 'Alto (╯°□°）╯︵ ┻━┻',
  4: 'Muy alto ┻━┻ ﾐヽ(ಠ益ಠ)ﾉ彡┻━┻',
};

/** `GuildPremiumTier`, by number. */
export const BOOST_TIER: Record<number, string> = { 0: 'Ninguno', 1: 'Nivel 1', 2: 'Nivel 2', 3: 'Nivel 3' };

/** Boosts a server needs for each tier (1, 2 and 3). */
const BOOSTS_FOR_TIER = [2, 7, 14] as const;

/** How many more boosts reach the next tier, or `null` at the highest tier. */
export const boostsToNextTier = (tier: number, boosts: number): number | null => {
  const needed = BOOSTS_FOR_TIER[tier];
  return needed === undefined ? null : Math.max(0, needed - boosts);
};

/** How many emojis of each kind (still and animated count apart) and stickers a server has room for, by boost tier. */
const EMOJI_SLOTS = [50, 100, 150, 250] as const;
const STICKER_SLOTS = [5, 15, 30, 60] as const;

const slot = <T extends readonly number[]>(table: T, tier: number): number => table[Math.min(Math.max(tier, 0), table.length - 1)];

export const emojiLimit = (tier: number): number => slot(EMOJI_SLOTS, tier);
export const stickerLimit = (tier: number): number => slot(STICKER_SLOTS, tier);

/** The features worth telling about; the ones that are not here (internal or obscure ones) are left out. */
const FEATURES: Record<string, string> = {
  ANIMATED_BANNER: 'Banner animado',
  ANIMATED_ICON: 'Ícono animado',
  AUTO_MODERATION: 'AutoMod',
  BANNER: 'Banner',
  COMMUNITY: 'Comunidad',
  DISCOVERABLE: 'Descubrible',
  ENHANCED_ROLE_COLORS: 'Colores de rol mejorados',
  GUILD_TAGS: 'Etiquetas de servidor',
  INVITE_SPLASH: 'Fondo de invitación',
  MEMBER_VERIFICATION_GATE_ENABLED: 'Selección de miembros',
  MORE_SOUNDBOARD: 'Más sonidos',
  MORE_STICKERS: 'Más stickers',
  NEWS: 'Canales de anuncios',
  PARTNERED: 'Socio de Discord',
  PRIVATE_THREADS: 'Hilos privados',
  ROLE_ICONS: 'Íconos de roles',
  SOUNDBOARD: 'Tablero de sonidos',
  VANITY_URL: 'URL personalizada',
  VERIFIED: 'Verificado',
  WELCOME_SCREEN_ENABLED: 'Pantalla de bienvenida',
};

export const featureLabels = (features: readonly string[]): string[] =>
  features.map(feature => FEATURES[feature]).filter((label): label is string => !!label);

/** `GuildMFALevel`: whether moderators need two-step verification. */
export const MFA_LEVEL: Record<number, string> = { 0: 'Ninguno', 1: 'Obligatoria para moderadores' };

/** `GuildExplicitContentFilter`. */
export const EXPLICIT_FILTER: Record<number, string> = { 0: 'Desactivado', 1: 'Miembros sin rol', 2: 'Todos los miembros' };

/** `GuildDefaultMessageNotifications`. */
export const NOTIFICATIONS: Record<number, string> = { 0: 'Todos los mensajes', 1: 'Solo menciones' };

/** `GuildNSFWLevel`. */
export const NSFW_LEVEL: Record<number, string> = { 0: 'Por defecto', 1: 'Explícito', 2: 'Seguro', 3: 'Solo adultos' };

/** The languages Discord offers for a server, with their flag; an unknown code is shown as it is. */
const LOCALES: Record<string, string> = {
  'es-ES': 'Español (España) 🇪🇸',
  'es-419': 'Español (Latinoamérica) 🌎',
  'en-US': 'Inglés (EE. UU.) 🇺🇸',
  'en-GB': 'Inglés (Reino Unido) 🇬🇧',
  'pt-BR': 'Portugués (Brasil) 🇧🇷',
  fr: 'Francés 🇫🇷',
  de: 'Alemán 🇩🇪',
  it: 'Italiano 🇮🇹',
  ja: 'Japonés 🇯🇵',
  ko: 'Coreano 🇰🇷',
  ru: 'Ruso 🇷🇺',
  'zh-CN': 'Chino (China) 🇨🇳',
  'zh-TW': 'Chino (Taiwán) 🇹🇼',
  pl: 'Polaco 🇵🇱',
  tr: 'Turco 🇹🇷',
  nl: 'Neerlandés 🇳🇱',
};

export const localeLabel = (code: string): string => LOCALES[code] ?? code;

/** `StickerFormatType`: the file format of a sticker. Lottie is an animation in JSON that Discord gives no picture of. */
export const STICKER_FORMAT: Record<number, string> = { 1: 'PNG', 2: 'APNG', 3: 'Lottie', 4: 'GIF' };

export const stickerFormatName = (format: number): string => STICKER_FORMAT[format] ?? 'Desconocido';
