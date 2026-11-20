import { EmbedBuilder, type BaseMessageOptions } from 'discord.js';
import { EMOJIS } from '../../config/emojis';
import { UserError } from '../../core/errors';
import { formatDuration } from '../../lib/format';
import { clip } from '../moderation/messages';
import { dateWithAge } from './dates';
import { BOOST_TIER, boostsToNextTier, emojiLimit, featureLabels, stickerLimit, VERIFICATION } from './labels';
import { clampPage, pageRow, paginate, type PageSlot } from './pages';
import { pastel } from './palette';
import { presenceRow, type PresenceCounts } from './presence';

/**
 * Noa's `server` embed (the `⚡ ~ name` header, "Creado el ... (Hace N días)" and the columns written `Label: **value**`),
 * and the views behind its flags. Built from plain data so it can be tested without Discord.
 */

export const SERVER_VIEWS = ['info', 'roles', 'emojis', 'channels', 'boost', 'icon', 'banner'] as const;
export type ServerView = (typeof SERVER_VIEWS)[number];

/** The flags of `server`, in the order the "Parámetros" column lists them. */
export const SERVER_FLAGS: ReadonlyArray<{ flag: Exclude<ServerView, 'info'>; help: string }> = [
  { flag: 'roles', help: 'Muestra los roles del servidor' },
  { flag: 'emojis', help: 'Muestra los emojis del servidor' },
  { flag: 'channels', help: 'Muestra los canales que puedes ver' },
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
  tree: CategoryNode[];
}

export const ROLES_PER_PAGE = 20;
export const EMOJIS_PER_PAGE = 40;
export const CHANNEL_LINES_PER_PAGE = 30;

const CHANNEL_SYMBOL: Record<ChannelKind, string> = { text: '#', announcement: '📢', voice: '🔊', stage: '🎙️', forum: '💬', other: '•' };

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

const emojisPage = (data: ServerData, requested: number, random?: () => number): Paged => {
  const items = [...data.emojis.filter(e => !e.animated), ...data.emojis.filter(e => e.animated)];
  const pages = paginate(items, EMOJIS_PER_PAGE);
  const page = clampPage(requested, pages.length);
  const limit = emojiLimit(data.boostTier);
  const still = data.emojis.filter(e => !e.animated).length;
  const animated = data.emojis.length - still;

  const stillHere = pages[page].filter(e => !e.animated);
  const animatedHere = pages[page].filter(e => e.animated);
  const sections = [
    ...(stillHere.length > 0 ? [`**Emojis** (${still}/${limit})\n${stillHere.map(e => e.markup).join(' ')}`] : []),
    ...(animatedHere.length > 0 ? [`**Animados** (${animated}/${limit})\n${animatedHere.map(e => e.markup).join(' ')}`] : []),
  ];
  const embed = header(data, random)
    .setDescription(sections.length > 0 ? sections.join('\n\n') : 'Este servidor no tiene emojis.')
    .setFooter({ text: `Stickers: ${data.stickers}/${stickerLimit(data.boostTier)}` });
  return { embed, total: pages.length, page };
};

/** The tree of categories and channels, packed into pages of at most `limit` lines; a category stays with its channels. */
export const channelPages = (tree: readonly CategoryNode[], limit = CHANNEL_LINES_PER_PAGE): string[][] => {
  const blocks = tree
    .map(category => {
      const visible = category.channels.filter(channel => channel.visible);
      return visible.length === 0
        ? []
        : [`**${clip(category.name, 80)}**`, ...visible.map(channel => `${CHANNEL_SYMBOL[channel.kind]} <#${channel.id}>`)];
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
): BaseMessageOptions => {
  const paged =
    view === 'roles' ? rolesPage(data, page, random)
    : view === 'emojis' ? emojisPage(data, page, random)
    : view === 'channels' ? channelsPage(data, page, random)
    : null;

  if (paged) {
    const row = pageRow((target, slot) => makeId(view, target, slot), paged.page, paged.total);
    return { embeds: [paged.embed], components: row ? [row] : [], allowedMentions: { parse: [] } };
  }

  const embed =
    view === 'boost' ? boostEmbed(data, random)
    : view === 'icon' || view === 'banner' ? imageEmbed(data, view, random)
    : infoEmbed(data, random);
  return { embeds: [embed], components: [], allowedMentions: { parse: [] } };
};
