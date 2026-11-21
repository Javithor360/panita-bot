import { EMOJIS } from '../../config/emojis';
import { discordTimestamp } from '../../lib/format';
import { clip } from '../moderation/messages';
import { localeLabel, MFA_LEVEL, NOTIFICATIONS, EXPLICIT_FILTER, NSFW_LEVEL } from './labels';
import type { PresenceCounts } from './presence';

/**
 * The extra views of `server`: `--activity`, `--community`, `--events`, `--sounds` and `--stickers`. They are built from plain
 * data that is read from Discord only when that flag is asked for, so the plain `server` never pays for it.
 */

export interface MemberStamp {
  id: string;
  joinedAt: Date;
}

export interface ActivityData {
  voiceTotal: number;
  /** The voice channels with somebody in them. */
  voiceChannels: Array<{ id: string; count: number }>;
  activeThreads: number;
  oldest: MemberStamp[];
  newest: MemberStamp[];
}

export interface CommunityData {
  description: string | null;
  rulesChannelId: string | null;
  systemChannelId: string | null;
  updatesChannelId: string | null;
  safetyChannelId: string | null;
  vanityCode: string | null;
  locale: string;
  mfaLevel: number;
  explicitFilter: number;
  notifications: number;
  maxMembers: number | null;
  nsfwLevel: number;
}

export interface EventRow {
  name: string;
  startsAt: Date | null;
  /** `true` while it is going on. */
  active: boolean;
  /** A channel id, or the text of an event outside Discord. */
  where: { channelId: string } | { location: string } | null;
}

export interface SoundRow {
  name: string;
  /** The emoji as text to show, or `null`. */
  emoji: string | null;
  /** 0 to 1. */
  volume: number;
  uploader: string | null;
  available: boolean;
}

export interface StickerRow {
  id: string;
  name: string;
  description: string | null;
  /** The picture, or `null` for a Lottie sticker (its file is a JSON animation). */
  imageUrl: string | null;
  tags: string | null;
  /** `PNG`, `APNG`, `Lottie` or `GIF`. */
  format: string;
  available: boolean;
}

/** What the flags that need more than the plain data bring. */
export interface ServerExtra {
  activity?: ActivityData;
  community?: CommunityData;
  events?: EventRow[];
  sounds?: SoundRow[];
  stickers?: StickerRow[];
}

export const EVENTS_PER_PAGE = 8;
export const SOUNDS_PER_PAGE = 20;
/** The voice channels, newest and oldest members named in `--activity`. */
export const ACTIVITY_VOICE_MAX = 10;
export const ACTIVITY_MEMBERS = 5;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The description of `--activity`. A list of members that is not complete says it is approximate. */
export const activityLines = (activity: ActivityData, presence: PresenceCounts | null, membersComplete: boolean): string[] => {
  const voice = activity.voiceChannels.slice(0, ACTIVITY_VOICE_MAX).map(channel => `• <#${channel.id}>: ${plural(channel.count, 'persona', 'personas')}`);
  const hiddenVoice = activity.voiceChannels.length - voice.length;
  const stamp = (member: MemberStamp) => `• <@${member.id}> ${discordTimestamp(member.joinedAt, 'R')}`;
  const approximate = membersComplete ? '' : ' (aprox.)';

  return [
    `**En voz ahora** (${activity.voiceTotal})`,
    ...(voice.length > 0 ? voice : ['Nadie en voz']),
    ...(hiddenVoice > 0 ? [`… y ${plural(hiddenVoice, 'canal más', 'canales más')}`] : []),
    '',
    `**Hilos activos**: ${activity.activeThreads}`,
    ...(presence
      ? ['', `**Conectados**: ${EMOJIS.online} ${presence.online} · ${EMOJIS.idle} ${presence.idle} · ${EMOJIS.dnd} ${presence.dnd}`]
      : []),
    ...(activity.newest.length > 0 ? ['', `**Miembros más nuevos**${approximate}`, ...activity.newest.map(stamp)] : []),
    ...(activity.oldest.length > 0 ? ['', `**Miembros más antiguos**${approximate}`, ...activity.oldest.map(stamp)] : []),
  ];
};

/** The description of `--community`. A setting the server does not have is left out. */
export const communityLines = (community: CommunityData): string[] => {
  const channel = (id: string | null) => (id ? `<#${id}>` : null);
  const rows: Array<[string, string | null]> = [
    ['Descripción', community.description ? clip(community.description, 300) : null],
    ['Reglas', channel(community.rulesChannelId)],
    ['Mensajes del sistema', channel(community.systemChannelId)],
    ['Novedades de Discord', channel(community.updatesChannelId)],
    ['Alertas de seguridad', channel(community.safetyChannelId)],
    ['URL personalizada', community.vanityCode ? `discord.gg/${community.vanityCode}` : null],
    ['Idioma', localeLabel(community.locale)],
    ['Verificación en dos pasos', MFA_LEVEL[community.mfaLevel] ?? null],
    ['Filtro de contenido', EXPLICIT_FILTER[community.explicitFilter] ?? null],
    ['Notificaciones', NOTIFICATIONS[community.notifications] ?? null],
    ['Contenido NSFW', NSFW_LEVEL[community.nsfwLevel] ?? null],
    ['Máximo de miembros', community.maxMembers !== null ? String(community.maxMembers) : null],
  ];
  return rows.filter((row): row is [string, string] => row[1] !== null).map(([label, value]) => `• ${label}: **${value}**`);
};

/** One line per event, soonest first. */
export const eventLine = (event: EventRow): string => {
  const when = event.startsAt ? `${discordTimestamp(event.startsAt, 'F')} (${discordTimestamp(event.startsAt, 'R')})` : 'sin fecha';
  const where = event.where ? ('channelId' in event.where ? `<#${event.where.channelId}>` : clip(event.where.location, 80)) : null;
  return `${event.active ? `${EMOJIS.online} ` : ''}**${clip(event.name, 80)}**\n${when}${where ? ` · ${where}` : ''}`;
};

export const soundLine = (sound: SoundRow): string => {
  const emoji = sound.emoji ? `${sound.emoji} ` : '';
  const owner = sound.uploader ? ` · de ${clip(sound.uploader, 30)}` : '';
  return `${emoji}**${clip(sound.name, 40)}** · volumen ${Math.round(sound.volume * 100)}%${owner}${sound.available ? '' : ' · no disponible'}`;
};

/** The text under a sticker's picture, one sticker per page. */
export const stickerLines = (sticker: StickerRow, position: number, total: number): string[] => [
  `**${clip(sticker.name, 80)}** (${position}/${total})`,
  ...(sticker.description ? [clip(sticker.description, 200)] : []),
  `Formato: **${sticker.format}** · ID: \`${sticker.id}\``,
  ...(sticker.tags ? [`Etiquetas: ${clip(sticker.tags, 100)}`] : []),
  ...(sticker.imageUrl ? [] : ['Es un sticker Lottie (una animación en JSON): Discord no da una imagen que mostrar.']),
  ...(sticker.available ? [] : ['No disponible']),
];
