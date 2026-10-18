/**
 * Minecraft-related external APIs (player heads, skin renders). The only place these URLs live.
 */

export const IGN_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

export const isValidIgn = (ign: string) => IGN_PATTERN.test(ign);

/** Square player head avatar (mc-heads.net). */
export const mcHeadUrl = (ign: string, size = 256) =>
  `https://mc-heads.net/avatar/${encodeURIComponent(ign)}/${size}`;

/** Default head templates of the Minecraft bridge; `{uuid}` (no dashes), `{name}`, `{nickname}` and `{skin}` are replaced. */
export const DEFAULT_AVATAR_PREMIUM = 'https://mc-heads.net/avatar/{uuid}/128';
export const DEFAULT_AVATAR_CRACKED = 'https://mc-heads.net/avatar/MHF_Steve/128';
/** Used when the server says which skin the player wears; `{skin}` is its hash, which mc-heads.net draws like a UUID. */
export const DEFAULT_AVATAR_SKIN = 'https://mc-heads.net/avatar/{skin}/128';

export interface AvatarSubject {
  uuid: string;
  name: string;
  nickname: string | null;
  skin: string | null;
}

/** The head of a player from a template. The names are encoded; the UUID has no dashes; the skin is a hash of hex digits. */
export const avatarFromTemplate = (template: string, { uuid, name, nickname, skin }: AvatarSubject) =>
  template
    .replaceAll('{uuid}', uuid.replaceAll('-', ''))
    .replaceAll('{skin}', skin ?? '')
    .replaceAll('{name}', encodeURIComponent(name))
    .replaceAll('{nickname}', encodeURIComponent(nickname ?? name));

export const SKIN_VIEWS = [
  { label: 'Cuerpo Completo - 3D', value: '3d/full', description: 'Vista 3D del cuerpo completo', emoji: '🧍' },
  { label: 'Busto - 3D', value: '3d/bust', description: 'Vista 3D desde la cintura hacia arriba', emoji: '👤' },
  { label: 'Cabeza - 2D', value: '2d/head', description: 'Vista plana 2D de la cabeza', emoji: '🧑' },
  { label: 'Frente - 2D', value: '2d/front', description: 'Vista plana 2D del frente del jugador', emoji: '🖼️' },
  { label: 'Frente Completo - 2D', value: '2d/frontfull', description: 'Vista plana 2D del frente completo', emoji: '🧍‍♂️' },
] as const;

export type SkinView = (typeof SKIN_VIEWS)[number]['value'];

export const DEFAULT_SKIN_VIEW: SkinView = '3d/full';

export const isSkinView = (value: string): value is SkinView => SKIN_VIEWS.some(v => v.value === value);

/**
 * Skin render (render.crafty.gg). A timestamp is appended so Discord doesn't serve a cached
 * image after the player changes their skin.
 */
export const skinRenderUrl = (ign: string, view: SkinView = DEFAULT_SKIN_VIEW) =>
  `https://render.crafty.gg/${view}/${encodeURIComponent(ign)}?t=${Date.now()}`;
