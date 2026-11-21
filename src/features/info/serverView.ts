import { EmbedBuilder, type BaseMessageOptions } from 'discord.js';
import { EMOJIS } from '../../config/emojis';
import { UserError } from '../../core/errors';
import { discordTimestamp, formatDuration } from '../../lib/format';
import { clip } from '../moderation/messages';
import { dateWithAge } from './dates';
import { BOOST_TIER, boostsToNextTier, emojiLimit, featureLabels, stickerLimit, VERIFICATION } from './labels';
import { clampPage, pageRow, paginate, type PageSlot } from './pages';
import { pastel } from './palette';
import { presenceRow, type PresenceCounts } from './presence';
import {
  activityLines,
  communityLines,
  eventLine,
  EVENTS_PER_PAGE,
  soundLine,
  SOUNDS_PER_PAGE,
  stickerLines,
  type ServerExtra,
  type StickerRow,
} from './serverExtras';

/**
 * Noa's `server` embed (the `⚡ ~ name` header, "Creado el ... (Hace N días)" and the columns written `Label: **value**`),
 * and the views behind its flags. Built from plain data so it can be tested without Discord.
 */

export const SERVER_VIEWS = ['info', 'roles', 'emojis', 'channels', 'activity', 'community', 'stickers', 'events', 'sounds', 'boost', 'icon', 'banner'] as const;
export type ServerView = (typeof SERVER_VIEWS)[number];

/** The flags of `server`, in the order the "Parámetros" column lists them. */
export const SERVER_FLAGS: ReadonlyArray<{ flag: Exclude<ServerView, 'info'>; help: string }> = [
  { flag: 'roles', help: 'Muestra los roles del servidor' },
  { flag: 'emojis', help: 'Muestra los emojis del servidor' },
  { flag: 'channels', help: 'Muestra los canales que puedes ver' },
  { flag: 'activity', help: 'Muestra la actividad: voz, hilos y miembros' },
  { flag: 'community', help: 'Muestra la configuración de la comunidad' },
  { flag: 'stickers', help: 'Muestra los stickers del servidor' },
  { flag: 'events', help: 'Muestra los eventos programados' },
  { flag: 'sounds', help: 'Muestra los sonidos del tablero' },
  { flag: 'boost', help: 'Muestra el estado de las mejoras' },
  { flag: 'icon', help: 'Muestra el ícono del servidor' },
  { flag: 'banner', help: 'Muestra el banner del servidor' },
];

export type ChannelKind = 'text' | 'announcement' | 'voice' | 'stage' | 'forum' | 'other';

export interface ChannelNode {
  id: string;
  kind: ChannelKind;
  /** Whether the person who asked can see it. */
  visible: boolean;
}

export interface CategoryNode {
  /** `null` for the channels that are in no category. */
  id: string | null;
  name: string;
  channels: ChannelNode[];
}

export interface ServerData {
  id: string;
  name: string;
  iconUrl: string | null;
  bannerUrl: string | null;
  splashUrl: string | null;
  createdAt: Date;
  ownerId: string;
  verificationLevel: number;
  boostTier: number;
  boosts: number;
  memberCount: number;
  /** `null` when the members could not be counted. */
  humans: number | null;
  bots: number | null;
  /** `null` when the bot has no presences (the Presence intent is off). */
  presence: PresenceCounts | null;
  channelCounts: { total: number; categories: number; text: number; voice: number; announcements: number; forums: number; stages: number };
  afkChannelId: string | null;
  afkTimeoutSeconds: number;
  /** Highest first, without `@everyone`. */
  roles: Array<{ id: string; members: number }>;
  emojis: Array<{ markup: string; animated: boolean }>;
  stickers: number;
  features: string[];
  vanityCode: string | null;
  /** The server tag: `null` when the server has none. */
  serverTag: ServerTagData | null;
  /** Members that boost the server, oldest boost first. */
  boosters: Array<{ id: string; since: Date }>;
  /** Whether the member list was complete, so counts and lists are exact. */
  membersComplete: boolean;
  tree: CategoryNode[];
}

export interface ServerTagData {
  /** The tag itself, such as `PANA`, when someone wears it. */
  text: string | null;
  /** How many members wear it. */
  count: number;
  userIds: string[];
  /** Whether the member list was incomplete, so the count may be short. */
  approximate: boolean;
}

export const ROLES_PER_PAGE = 20;
export const EMOJIS_PER_PAGE = 40;
export const CHANNEL_LINES_PER_PAGE = 30;
/** How many of the members that wear the server tag are named. */
export const TAG_LIST_MAX = 25;


const field = (name: string, lines: string[], inline = true) => ({ name, value: lines.join('\n'), inline });

const header = (data: ServerData, random?: () => number) =>
  new EmbedBuilder()
    .setColor(pastel(random))
    .setAuthor({ name: clip(`⚡ ~ ${data.name}`, 256), ...(data.iconUrl ? { iconURL: data.iconUrl } : {}) });

const infoEmbed = (data: ServerData, random?: () => number): EmbedBuilder => {
  const { channelCounts: c } = data;
  const known = data.humans !== null && data.bots !== null;

  // Short lines in three even columns: long ones (an ID, "Humanos - Bots", a row of circles) wrap and look ragged
  const embed = header(data, random)
    .setDescription(`Creado el ${dateWithAge(data.createdAt)}`)
    .addFields(
      field('Miembros', [
        `Usuarios: **${data.memberCount}**`,
        ...(known ? [`Humanos: **${data.humans}**`, `Bots: **${data.bots}**`] : []),
      ]),
      field('Canales', [
        `Total: **${c.total}**`,
        `Categorías: **${c.categories}**`,
        `Texto: **${c.text}**`,
        `Voz: **${c.voice}**`,
        ...(c.announcements > 0 ? [`Anuncios: **${c.announcements}**`] : []),
        ...(c.forums > 0 ? [`Foros: **${c.forums}**`] : []),
        ...(c.stages > 0 ? [`Escenarios: **${c.stages}**`] : []),
      ]),
      field('Información', [
        `Propietario: <@${data.ownerId}>`,
        `Verificación: **${VERIFICATION[data.verificationLevel] ?? 'Desconocida'}**`,
      ]),
      field('Extras', [
        `AFK: ${data.afkChannelId ? `<#${data.afkChannelId}>` : '**Ninguno**'}`,
        `Espera: **${formatDuration(data.afkTimeoutSeconds * 1000)}**`,
      ]),
      field('Contenido', [`Roles: **${data.roles.length}**`, `Emotes: **${data.emojis.length}**`, `Stickers: **${data.stickers}**`]),
      field('Mejoras', [`Nivel: **${BOOST_TIER[data.boostTier] ?? BOOST_TIER[0]}**`, `Boosts: ${EMOJIS.boost} **${data.boosts}**`]),
      ...(data.presence ? [field('Estado', [presenceRow(data.presence)], false)] : []),
      field('Parámetros', SERVER_FLAGS.map(({ flag, help }) => `• \`--${flag}\`: ${help}`), false),
    )
    .setFooter({ text: `ID: ${data.id}` });
  if (data.iconUrl) embed.setThumbnail(data.iconUrl);
  return embed;
};

/** Paginated views return the page they show and how many there are. */
interface Paged {
  embed: EmbedBuilder;
  total: number;
  page: number;
}

const rolesPage = (data: ServerData, requested: number, random?: () => number): Paged => {
  const pages = paginate(data.roles, ROLES_PER_PAGE);
  const page = clampPage(requested, pages.length);
  const lines = pages[page].map(role => `<@&${role.id}> · ${role.members} miembro${role.members === 1 ? '' : 's'}`);
  const embed = header(data, random)
    .setDescription(`**Roles** (${data.roles.length})\n${lines.length > 0 ? lines.join('\n') : 'Este servidor no tiene roles.'}`);
  return { embed, total: pages.length, page };
};

/**
 * The pages of `--emojis`: the still emojis first and the animated ones after, **never mixed in a page**, so the title of a page
 * always matches what is on it.
 */
export const emojiPages = (emojis: ServerData['emojis'], perPage = EMOJIS_PER_PAGE): Array<{ animated: boolean; items: string[] }> => {
  const still = emojis.filter(emoji => !emoji.animated).map(emoji => emoji.markup);
  const animated = emojis.filter(emoji => emoji.animated).map(emoji => emoji.markup);
  return [
    ...(still.length > 0 ? paginate(still, perPage).map(items => ({ animated: false, items })) : []),
    ...(animated.length > 0 ? paginate(animated, perPage).map(items => ({ animated: true, items })) : []),
  ];
};

const emojisPage = (data: ServerData, requested: number, random?: () => number): Paged => {
  const pages = emojiPages(data.emojis);
  const page = clampPage(requested, Math.max(1, pages.length));
  const limit = emojiLimit(data.boostTier);
  const still = data.emojis.filter(emoji => !emoji.animated).length;
  const animated = data.emojis.length - still;

  const current = pages[page];
  // A line that starts with `# ` is a markdown title, and the emojis in a title are shown big
  const description = current
    ? `**${current.animated ? 'Animados' : 'Emojis'}** (${current.animated ? animated : still}/${limit})\n# ${current.items.join(' ')}`
    : 'Este servidor no tiene emojis.';
  const embed = header(data, random)
    .setDescription(description)
    .setFooter({ text: `Stickers: ${data.stickers}/${stickerLimit(data.boostTier)}` });
  return { embed, total: Math.max(1, pages.length), page };
};

/** The tree of categories and channels, packed into pages of at most `limit` lines; a category stays with its channels. */
export const channelPages = (tree: readonly CategoryNode[], limit = CHANNEL_LINES_PER_PAGE): string[][] => {
  const blocks = tree
    .map(category => {
      const visible = category.channels.filter(channel => channel.visible);
      return visible.length === 0
        ? []
        : [`**${clip(category.name, 80)}**`, ...visible.map(channel => `• <#${channel.id}>`)];
    })
    .filter(block => block.length > 0);

  const pages: string[][] = [];
  let current: string[] = [];
  for (const block of blocks) {
    for (let start = 0; start < block.length; start += limit) {
      const piece = block.slice(start, start + limit);
      if (current.length > 0 && current.length + piece.length > limit) {
        pages.push(current);
        current = [];
      }
      current.push(...piece);
    }
  }
  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
};

const channelsPage = (data: ServerData, requested: number, random?: () => number): Paged => {
  const pages = channelPages(data.tree);
  const page = clampPage(requested, pages.length);
  const hidden = data.tree.reduce((sum, category) => sum + category.channels.filter(channel => !channel.visible).length, 0);

  const embed = header(data, random).setDescription(pages[page].length > 0 ? pages[page].join('\n') : 'No hay canales que puedas ver.');
  // Only how many there are: the names of channels the person cannot see are never shown
  if (hidden > 0) embed.setFooter({ text: `y ${hidden} canal${hidden === 1 ? '' : 'es'} más que no puedes ver` });
  return { embed, total: pages.length, page };
};

/** The block of the boost view about the server tag. */
export const tagLines = (tag: ServerTagData | null): string[] => {
  if (!tag) return ['**Etiqueta del servidor**', 'Este servidor no tiene etiqueta.'];
  const title = tag.text ? `**Etiqueta del servidor** \`${tag.text}\`` : '**Etiqueta del servidor**';
  const count = `Miembros que la usan: **${tag.count}**${tag.approximate ? ' (aprox.)' : ''}`;
  if (tag.userIds.length === 0) return [title, count];
  const shown = tag.userIds.slice(0, TAG_LIST_MAX).map(id => `<@${id}>`).join(' ');
  const rest = tag.count - Math.min(tag.userIds.length, TAG_LIST_MAX);
  return [title, count, shown + (rest > 0 ? ` y ${rest} más` : '')];
};

/** The members that boost the server, with since when. The first 25 are named and the rest only counted. */
export const boosterLines = (boosters: ServerData['boosters']): string[] => {
  if (boosters.length === 0) return ['**Boosters**', 'Nadie impulsa el servidor todavía.'];
  const shown = boosters.slice(0, TAG_LIST_MAX).map(booster => `<@${booster.id}> ${discordTimestamp(booster.since, 'R')}`);
  const rest = boosters.length - shown.length;
  return [`**Boosters** (${boosters.length})`, ...shown, ...(rest > 0 ? [`… y ${rest} más`] : [])];
};

const boostEmbed = (data: ServerData, random?: () => number): EmbedBuilder => {
  const next = boostsToNextTier(data.boostTier, data.boosts);
  const perks = featureLabels(data.features);
  const embed = new EmbedBuilder()
    .setColor(pastel(random))
    .setAuthor({ name: clip(`Estado de boost en ${data.name}`, 256), ...(data.iconUrl ? { iconURL: data.iconUrl } : {}) })
    .setDescription(
      [
        `${EMOJIS.boost} Nivel de boost: **${BOOST_TIER[data.boostTier] ?? BOOST_TIER[0]}**`,
        `Miembros boosteando: **${data.boosts}**`,
        ...(next !== null ? [`Faltan **${next}** para el siguiente nivel`] : []),
        '',
        '**Ventajas del servidor**',
        perks.length > 0 ? perks.map(perk => `\`${perk}\``).join(', ') : 'Ninguna',
        '',
        ...tagLines(data.serverTag),
        '',
        ...boosterLines(data.boosters),
      ].join('\n'),
    );
  const thumbnail = data.splashUrl ?? data.iconUrl;
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (data.bannerUrl) embed.setImage(data.bannerUrl);
  return embed;
};

const imageEmbed = (data: ServerData, kind: 'icon' | 'banner', random?: () => number): EmbedBuilder => {
  const url = kind === 'icon' ? data.iconUrl : data.bannerUrl;
  if (!url) throw new UserError(kind === 'icon' ? 'este servidor no tiene ícono.' : 'este servidor no tiene banner.');
  return new EmbedBuilder()
    .setColor(pastel(random))
    .setTitle(`${kind === 'icon' ? 'Ícono' : 'Banner'} de ${data.name}`.slice(0, 256))
    .setURL(url)
    .setImage(url);
};

/** A paged list of lines (events, sounds, stickers). */
const listPage = (data: ServerData, title: string, lines: string[], perPage: number, empty: string, requested: number, random?: () => number): Paged => {
  const pages = paginate(lines, perPage);
  const page = clampPage(requested, pages.length);
  const embed = header(data, random).setDescription(
    pages[page].length > 0 ? `**${title}** (${lines.length})\n${pages[page].join('\n')}` : empty,
  );
  return { embed, total: pages.length, page };
};

/** `--stickers`: one sticker per page, with its picture. */
const stickersPage = (data: ServerData, stickers: StickerRow[], requested: number, random?: () => number): Paged => {
  const page = clampPage(requested, stickers.length);
  const embed = header(data, random);
  const current = stickers[page];
  if (!current) return { embed: embed.setDescription('Este servidor no tiene stickers.'), total: 1, page: 0 };
  embed.setDescription(stickerLines(current, page + 1, stickers.length).join('\n'));
  if (current.imageUrl) embed.setImage(current.imageUrl);
  return { embed, total: stickers.length, page };
};

const activityEmbed =(data: ServerData, extra: ServerExtra, random?: () => number): EmbedBuilder =>
  header(data, random).setDescription(
    extra.activity ? activityLines(extra.activity, data.presence, data.membersComplete).join('\n') : 'No pude leer la actividad del servidor.',
  );

const communityEmbed = (data: ServerData, extra: ServerExtra, random?: () => number): EmbedBuilder => {
  const lines = extra.community ? communityLines(extra.community) : [];
  return header(data, random).setDescription(lines.length > 0 ? lines.join('\n') : 'Este servidor no tiene configuración de comunidad que mostrar.');
};

/**
 * The reply for a view: the embed and, for the lists that have more than one page, the buttons. `makeId` builds the
 * custom id of a button from the page it leads to, so the buttons carry the page and need no memory.
 */
export const serverMessage = (
  view: ServerView,
  data: ServerData,
  page: number,
  makeId: (view: ServerView, page: number, slot: PageSlot) => string,
  random?: () => number,
  extra: ServerExtra = {},
): BaseMessageOptions => {
  const paged =
    view === 'roles' ? rolesPage(data, page, random)
    : view === 'emojis' ? emojisPage(data, page, random)
    : view === 'channels' ? channelsPage(data, page, random)
    : view === 'events' ? listPage(data, 'Eventos', (extra.events ?? []).map(eventLine), EVENTS_PER_PAGE, 'No hay eventos programados.', page, random)
    : view === 'sounds' ? listPage(data, 'Sonidos', (extra.sounds ?? []).map(soundLine), SOUNDS_PER_PAGE, 'Este servidor no tiene sonidos en el tablero.', page, random)
    : view === 'stickers' ? stickersPage(data, extra.stickers ?? [], page, random)
    : null;

  if (paged) {
    const row = pageRow((target, slot) => makeId(view, target, slot), paged.page, paged.total);
    return { embeds: [paged.embed], components: row ? [row] : [], allowedMentions: { parse: [] } };
  }

  const embed =
    view === 'boost' ? boostEmbed(data, random)
    : view === 'activity' ? activityEmbed(data, extra, random)
    : view === 'community' ? communityEmbed(data, extra, random)
    : view === 'icon' || view === 'banner' ? imageEmbed(data, view, random)
    : infoEmbed(data, random);
  return { embeds: [embed], components: [], allowedMentions: { parse: [] } };
};
