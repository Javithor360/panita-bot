import { EMOJIS } from '../../config/emojis';

/** The views of `user` besides the profile and the badges: the voice section, `--cosmetics` and `--permissions`. Plain data in, text out. */

export interface VoiceInfo {
  channelId: string;
  serverMute: boolean;
  serverDeaf: boolean;
  selfMute: boolean;
  selfDeaf: boolean;
  streaming: boolean;
  camera: boolean;
}

/** What a person is doing in a voice channel, in words. Someone just connected is "Conectado". */
export const voiceStates = (voice: VoiceInfo): string[] => {
  const states = [
    ...(voice.serverMute ? ['silenciado por un moderador'] : voice.selfMute ? ['micrófono apagado'] : []),
    ...(voice.serverDeaf ? ['ensordecido por un moderador'] : voice.selfDeaf ? ['ensordecido'] : []),
    ...(voice.streaming ? ['transmitiendo'] : []),
    ...(voice.camera ? ['cámara encendida'] : []),
  ];
  return states.length > 0 ? states : ['conectado'];
};

/** The lines of the "Voz" section: shown only while the person is in a voice channel. */
export const voiceLines = (voice: VoiceInfo): string[] => [
  `• Canal: <#${voice.channelId}>`,
  `• Estado: ${voiceStates(voice).join(', ')}`,
];

/** The footer of the profile: the place by join date (when it is known) and the number of roles. */
export const profileFooter = (joinPosition: number | null, roles: number): string => {
  const count = `${roles} ${roles === 1 ? 'rol' : 'roles'}`;
  return joinPosition === null ? count : `Miembro #${joinPosition} en entrar · ${count}`;
};

export interface CosmeticsInput {
  decorationUrl: string | null;
  nameplate: { label: string; palette: string } | null;
  /** The server tag in the profile; `guildName` is the server it is for when the bot knows it. */
  tag: { text: string; badgeUrl: string | null; guildName: string | null } | null;
  hasBanner: boolean;
  accentColor: number | null;
}

const NONE = 'Ninguna';

/** The description of `--cosmetics`. */
export const cosmeticsLines = (cosmetics: CosmeticsInput): string[] => [
  '**Decoración de avatar**',
  cosmetics.decorationUrl ? `• [Ver la decoración](${cosmetics.decorationUrl})` : NONE,
  '',
  '**Placa de nombre**',
  cosmetics.nameplate ? `• Nombre: ${cosmetics.nameplate.label}\n• Paleta: ${cosmetics.nameplate.palette}` : NONE,
  '',
  '**Etiqueta del servidor**',
  cosmetics.tag
    ? [
        `• Etiqueta: \`${cosmetics.tag.text}\``,
        ...(cosmetics.tag.guildName ? [`• Servidor: ${cosmetics.tag.guildName}`] : []),
        ...(cosmetics.tag.badgeUrl ? [`• [Ver la insignia](${cosmetics.tag.badgeUrl})`] : []),
      ].join('\n')
    : NONE,
  '',
  '**Banner y color**',
  `• Banner: ${cosmetics.hasBanner ? 'Sí (míralo con `avatar --banner`)' : 'No tiene'}`,
  `• Color de acento: ${cosmetics.accentColor !== null ? `\`#${cosmetics.accentColor.toString(16).padStart(6, '0')}\`` : 'Ninguno'}`,
];

export interface PermissionsInput {
  channelId: string;
  /** Whether the channel is a voice channel, where talking and connecting matter. */
  voice: boolean;
  administrator: boolean;
  /** Names of the `PermissionFlagsBits` the person has in that channel. */
  allowed: readonly string[];
}

const TEXT_PERMISSIONS: Array<[string, string]> = [
  ['ViewChannel', 'Ver el canal'],
  ['SendMessages', 'Escribir mensajes'],
  ['ReadMessageHistory', 'Leer el historial'],
  ['EmbedLinks', 'Insertar enlaces'],
  ['AttachFiles', 'Adjuntar archivos'],
  ['AddReactions', 'Añadir reacciones'],
  ['UseExternalEmojis', 'Usar emojis externos'],
  ['MentionEveryone', 'Mencionar a todos'],
  ['ManageMessages', 'Gestionar mensajes'],
];

const VOICE_PERMISSIONS: Array<[string, string]> = [
  ['ViewChannel', 'Ver el canal'],
  ['Connect', 'Conectarse'],
  ['Speak', 'Hablar'],
  ['Stream', 'Transmitir'],
  ['UseVAD', 'Usar detección de voz'],
  ['MuteMembers', 'Silenciar a otros'],
  ['MoveMembers', 'Mover miembros'],
];

/** The description of `--permissions`: what the person can do in that channel, one line each with the check or the cross. */
export const permissionLines = (input: PermissionsInput): string[] => {
  const head = `**Permisos en <#${input.channelId}>**`;
  if (input.administrator) return [head, `${EMOJIS.check} Es Administrador: tiene todos los permisos en este canal.`];
  return [
    head,
    ...(input.voice ? VOICE_PERMISSIONS : TEXT_PERMISSIONS).map(
      ([flag, label]) => `${input.allowed.includes(flag) ? EMOJIS.check : EMOJIS.cross} ${label}`,
    ),
  ];
};
