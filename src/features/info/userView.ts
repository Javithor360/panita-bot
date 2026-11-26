import { EmbedBuilder, escapeMarkdown } from 'discord.js';
import { badgeLines, NO_BADGES } from './badges';
import { dateWithAge } from './dates';
import { pastel } from './palette';
import { activityText, statusColor, statusText, type PresenceInfo } from './presence';
import { discordTimestamp } from '../../lib/format';
import { clip } from '../moderation/messages';
import { viewMenu, type ViewOption } from './viewMenu';
import { cosmeticsLines, permissionLines, profileFooter, voiceLines, type CosmeticsInput, type PermissionsInput, type VoiceInfo } from './userExtras';

/**
 * Noa's `user` embed: bold headings with `•` bullets in the description (Identificación, Cuenta, Actividad, Roles) and a
 * color that follows the online status. Everything that needs the server (nickname, join date, roles, status) is
 * left out for someone who is not in it, never an error.
 */

export interface UserViewUser {
  id: string;
  username: string;
  displayName: string;
  bot: boolean;
  createdAt: Date;
  avatarUrl: string;
  bannerUrl: string | null;
  accentColor: number | null;
  /** `user.flags?.toArray()`. */
  flags: string[];
}

export interface UserViewMember {
  nickname: string | null;
  displayName: string;
  joinedAt: Date | null;
  boostingSince: Date | null;
  timeoutUntil: Date | null;
  /** The server avatar, when they have one. */
  avatarUrl: string | null;
  /** Without `@everyone`, highest first. */
  roles: Array<{ id: string; color: number }>;
  /** Color of the highest role that has one, or 0. */
  roleColor: number;
  /** Names of `PermissionFlagsBits` the member holds, for `KEY_PERMISSIONS` to pick from. */
  permissions: string[];
  /** Their place by join date, 1 being the first; `null` when the member list is incomplete. */
  joinPosition: number | null;
  /** Set only while they are in a voice channel. */
  voice: VoiceInfo | null;
}

/** What `user` shows: the profile, or one of its flags. */
export type UserView = 'profile' | 'badges' | 'cosmetics' | 'permissions';

/** The options of the menu of `user`: the profile, then every flag. */
export const USER_VIEW_OPTIONS: ReadonlyArray<ViewOption<UserView>> = [
  { value: 'profile', label: 'Perfil', description: 'La cuenta, cuándo entró, sus roles y su estado' },
  { value: 'badges', label: 'Insignias', description: 'Las insignias de Discord' },
  { value: 'cosmetics', label: 'Cosméticos', description: 'La decoración, la placa de nombre y la etiqueta de servidor' },
  { value: 'permissions', label: 'Permisos', description: 'Lo que puede hacer en este canal' },
];

/** The menu under every view of `user`; the view on screen is marked. */
export const userMenu = (customId: string, view: UserView) => viewMenu(customId, USER_VIEW_OPTIONS, view, 'Elige qué ver de esta persona');

export interface UserViewInput {
  user: UserViewUser;
  member: UserViewMember | null;
  presence: PresenceInfo | null;
  view: UserView;
  /** For `--cosmetics`. */
  cosmetics?: CosmeticsInput;
  /** For `--permissions`. */
  permissions?: PermissionsInput | null;
  now?: Date;
  random?: () => number;
}

/** The permissions worth telling about, in the order they are shown. */
const KEY_PERMISSIONS: Array<[string, string]> = [
  ['ManageGuild', 'Gestionar servidor'],
  ['ManageRoles', 'Gestionar roles'],
  ['ManageChannels', 'Gestionar canales'],
  ['ManageMessages', 'Gestionar mensajes'],
  ['KickMembers', 'Expulsar miembros'],
  ['BanMembers', 'Banear miembros'],
  ['ModerateMembers', 'Moderar miembros'],
  ['ManageNicknames', 'Gestionar apodos'],
  ['ManageGuildExpressions', 'Gestionar emojis y stickers'],
  ['MentionEveryone', 'Mencionar a todos'],
];

/** Noa listed the roles up to 1000 characters; past that only how many there are. */
export const ROLE_LIST_MAX = 1000;

export const permissionLabels = (permissions: readonly string[]): string[] =>
  permissions.includes('Administrator')
    ? ['Administrador (todos los permisos)']
    : KEY_PERMISSIONS.filter(([flag]) => permissions.includes(flag)).map(([, label]) => label);

export const roleList = (roles: ReadonlyArray<{ id: string }>): string => {
  const list = roles.map(role => `<@&${role.id}>`).join(' | ');
  return list.length >= ROLE_LIST_MAX ? `${roles.length} roles` : list;
};

const bullet = (label: string, value: string) => `• ${label}: ${value}`;

const section = (title: string, lines: string[]) => `**${title}**\n${lines.join('\n')}`;

/** The color: the status first (as Noa did), then the highest role, then the account's own, then a pastel. */
export const userColor = (input: Pick<UserViewInput, 'user' | 'member' | 'presence' | 'random'>): number =>
  (input.presence ? statusColor(input.presence.status) : null)
  ?? (input.member?.roleColor ? input.member.roleColor : null)
  ?? (input.user.accentColor ? input.user.accentColor : null)
  ?? pastel(input.random);

const identification = (input: UserViewInput): string => {
  const { user, member } = input;
  return section('Identificación', [
    bullet('Usuario', `${escapeMarkdown(user.username)}`),
    bullet('ID', `\`${user.id}\``),
    ...(member?.nickname ? [bullet('Apodo', escapeMarkdown(clip(member.nickname, 64)))] : []),
    ...(user.bot ? [bullet('Tipo', 'Bot')] : []),
  ]);
};

const header = (input: UserViewInput): EmbedBuilder => {
  const { user, member } = input;
  return new EmbedBuilder()
    .setColor(userColor(input))
    .setAuthor({ name: clip(member?.displayName ?? user.displayName, 100), iconURL: member?.avatarUrl ?? user.avatarUrl })
    .setThumbnail(member?.avatarUrl ?? user.avatarUrl);
};

/** The embed of `--badges`: only the badges of the account, and the server's booster badge for a member. */
export const userBadgesEmbed = (input: UserViewInput): EmbedBuilder => {
  const lines = badgeLines({ flags: input.user.flags, boostingSince: input.member?.boostingSince });
  return header(input).setDescription(`${identification(input)}\n\n${section('Insignias', lines.length > 0 ? lines : [NO_BADGES])}`);
};

/** The embed of `--cosmetics`: decoration, nameplate, server tag, banner and accent color. */
export const userCosmeticsEmbed = (input: UserViewInput): EmbedBuilder => {
  const embed = header(input).setDescription(cosmeticsLines(input.cosmetics!).join('\n'));
  if (input.cosmetics?.decorationUrl) embed.setThumbnail(input.cosmetics.decorationUrl);
  return embed;
};

/** The embed of `--permissions`. A person outside the server has no permissions, which is said and not guessed. */
export const userPermissionsEmbed = (input: UserViewInput): EmbedBuilder =>
  header(input).setDescription(
    input.permissions && input.member
      ? permissionLines(input.permissions).join('\n')
      : 'Esa persona no está en el servidor, así que no tiene permisos en ningún canal.',
  );

export const userEmbed = (input: UserViewInput): EmbedBuilder => {
  if (input.view === 'badges') return userBadgesEmbed(input);
  if (input.view === 'cosmetics') return userCosmeticsEmbed(input);
  if (input.view === 'permissions') return userPermissionsEmbed(input);

  const { user, member, presence } = input;
  const now = (input.now ?? new Date()).getTime();

  const account = [
    bullet('Creada el', dateWithAge(user.createdAt)),
    ...(member?.joinedAt ? [bullet('Ingresó al servidor', dateWithAge(member.joinedAt))] : []),
    ...(member?.boostingSince ? [bullet('Boosteando desde', dateWithAge(member.boostingSince))] : []),
    ...(member?.timeoutUntil && member.timeoutUntil.getTime() > now
      ? [bullet('Silenciado hasta', discordTimestamp(member.timeoutUntil, 'R'))]
      : []),
  ];

  const sections = [identification(input), section('Cuenta', account)];

  if (presence) {
    const activity = activityText(presence.activities);
    sections.push(section('Actividad', [bullet('Estado', statusText(presence)), ...(activity ? [`• ${activity}`] : [])]));
  }

  if (member?.voice) sections.push(section('Voz', voiceLines(member.voice)));

  if (member) {
    const roles = member.roles.length > 0
      ? [
        bullet('Rol destacado', `<@&${member.roles[0].id}>`),
        // The highlighted role is not repeated in the list
        ...(member.roles.length > 1 ? [bullet('Otros roles', roleList(member.roles.slice(1)))] : []),
      ]
      : ['• Sin roles'];
    sections.push(section('Roles', roles));

    const permissions = permissionLabels(member.permissions);
    if (permissions.length > 0) sections.push(section('Permisos clave', [permissions.join(', ')]));
  }

  const embed = header(input).setDescription(sections.join('\n\n'));
  if (member) embed.setFooter({ text: profileFooter(member.joinPosition, member.roles.length) });
  if (user.bannerUrl) embed.setImage(user.bannerUrl);
  return embed;
};
