/**
 * The badges Discord shows on a profile, from `user.flags`. Only public badges are listed: the internal flags
 * (spammer, quarantined, urgent messages...) are never shown. Nitro cannot be known from the flags, so it is never claimed.
 */

interface Badge {
  label: string;
  emoji: string;
}

const BADGES: Record<string, Badge> = {
  Staff: { label: 'Staff de Discord', emoji: '🛡️' },
  Partner: { label: 'Socio de Discord', emoji: '🤝' },
  Hypesquad: { label: 'Eventos de HypeSquad', emoji: '🎉' },
  HypeSquadOnlineHouse1: { label: 'HypeSquad Bravery', emoji: '🟣' },
  HypeSquadOnlineHouse2: { label: 'HypeSquad Brilliance', emoji: '🟠' },
  HypeSquadOnlineHouse3: { label: 'HypeSquad Balance', emoji: '🟢' },
  BugHunterLevel1: { label: 'Cazador de bugs', emoji: '🐛' },
  BugHunterLevel2: { label: 'Cazador de bugs de oro', emoji: '🏆' },
  PremiumEarlySupporter: { label: 'Seguidor de la primera hora', emoji: '🌟' },
  VerifiedDeveloper: { label: 'Desarrollador de bots verificado temprano', emoji: '🧑‍💻' },
  CertifiedModerator: { label: 'Moderador certificado', emoji: '⚖️' },
  ActiveDeveloper: { label: 'Desarrollador activo', emoji: '🛠️' },
  VerifiedBot: { label: 'Bot verificado', emoji: '✔️' },
  BotHTTPInteractions: { label: 'Bot con interacciones HTTP', emoji: '🔌' },
};

export interface BadgeInput {
  /** `user.flags?.toArray()`. */
  flags: readonly string[];
  /** Whether the member is boosting the server. Only members can. */
  boostingSince?: Date | null;
}

/** One line per badge, in a stable order. */
export const badgeLines = (input: BadgeInput): string[] => {
  const lines = Object.entries(BADGES)
    .filter(([flag]) => input.flags.includes(flag))
    .map(([, badge]) => `${badge.emoji} ${badge.label}`);
  if (input.boostingSince) lines.push('💎 Impulsor del servidor');
  return lines;
};

export const NO_BADGES = 'Sin insignias';
