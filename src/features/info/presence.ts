import { COLORS } from '../../config/constants';
import { EMOJIS } from '../../config/emojis';

/**
 * Online status, as Noa showed it. It comes from Discord's Presence intent. A member with no presence (offline, or one the
 * bot has not been told about) is given `null`, and the commands then leave the status out instead of guessing.
 */

export type Status = 'online' | 'idle' | 'dnd' | 'offline';

export interface PresenceInfo {
  status: Status;
  /** Whether the member is on a phone. */
  mobile: boolean;
  activities: ActivityInfo[];
}

export interface ActivityInfo {
  /** discord.js `ActivityType`: 0 playing, 1 streaming, 2 listening, 3 watching, 4 custom status, 5 competing. */
  type: number;
  name: string;
  state: string | null;
}

const STATUS_EMOJI: Record<Status, string> = { online: EMOJIS.online, idle: EMOJIS.idle, dnd: EMOJIS.dnd, offline: EMOJIS.offline };
const STATUS_LABEL: Record<Status, string> = { online: 'Online', idle: 'Ausente', dnd: 'No molestar', offline: 'Desconectado' };

export const statusEmoji = (status: Status): string => STATUS_EMOJI[status];
export const statusLabel = (status: Status): string => STATUS_LABEL[status];

/** Noa's embed colors: green online, yellow idle, red do not disturb. Offline has none (the caller falls back). */
export const statusColor = (status: Status): number | null =>
  ({ online: COLORS.success, idle: COLORS.warning, dnd: COLORS.error, offline: null })[status];

/** `Online 🟢`, plus the phone when they are on one. */
export const statusText = (presence: PresenceInfo): string =>
  `${statusLabel(presence.status)} ${statusEmoji(presence.status)}${presence.mobile ? ` ${EMOJIS.mobile}` : ''}`;

const ACTIVITY_PREFIX: Record<number, string> = { 0: 'Jugando a', 1: 'Transmitiendo', 2: 'Escuchando', 3: 'Viendo', 5: 'Compitiendo en' };

/** What they are doing: `Jugando a: Minecraft`, or the text of their custom status. `null` when there is nothing to say. */
export const activityText = (activities: readonly ActivityInfo[]): string | null => {
  const custom = activities.find(activity => activity.type === 4 && activity.state);
  const main = activities.find(activity => activity.type !== 4 && ACTIVITY_PREFIX[activity.type]);
  if (main) return `${ACTIVITY_PREFIX[main.type]}: ${main.name}`;
  return custom ? `Estado personalizado: ${custom.state}` : null;
};

export interface PresenceCounts {
  online: number;
  idle: number;
  dnd: number;
  streaming: number;
  offline: number;
  mobile: number;
}

/** Noa's row of circles, counted from the presences of the members. Members without a presence are offline. */
export const countPresences = (presences: ReadonlyArray<PresenceInfo | null>, total: number): PresenceCounts => {
  const counts: PresenceCounts = { online: 0, idle: 0, dnd: 0, streaming: 0, offline: 0, mobile: 0 };
  let seen = 0;
  for (const presence of presences) {
    if (!presence || presence.status === 'offline') continue;
    seen++;
    counts[presence.status]++;
    if (presence.activities.some(activity => activity.type === 1)) counts.streaming++;
    if (presence.mobile) counts.mobile++;
  }
  counts.offline = Math.max(0, total - seen);
  return counts;
};

/** Noa's row of circles: online, idle, do not disturb, streaming, offline and on a phone. */
export const presenceRow = (counts: PresenceCounts): string =>
  [
    `${EMOJIS.online} ${counts.online}`,
    `${EMOJIS.idle} ${counts.idle}`,
    `${EMOJIS.dnd} ${counts.dnd}`,
    `${EMOJIS.streaming} ${counts.streaming}`,
    `${EMOJIS.offline} ${counts.offline}`,
    `${EMOJIS.mobile} ${counts.mobile}`,
  ].join(' · ');
