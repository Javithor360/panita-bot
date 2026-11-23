import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import { avatarOf, type AvatarTemplates } from '../inbound';
import type { ListedPlayer } from '../protocol';
import type { HeadLoader } from './cards';

const NO_UUID = '00000000-0000-0000-0000-000000000000';
const MAX_HEAD_BYTES = 1024 * 1024;
const MAX_SKIN_BYTES = 256 * 1024;
const MAX_PROFILE_BYTES = 64 * 1024;
/** A head that was had is kept for a while; one that was not is tried again soon, since the usual cause is a passing one. */
const HEAD_TTL_MS = 10 * 60 * 1000;
const MISS_TTL_MS = 60 * 1000;
const TEXTURES_HOST = 'textures.minecraft.net';
const TEXTURE_FOLDER = `https://${TEXTURES_HOST}/texture/`;
const SESSION_PROFILE = 'https://sessionserver.mojang.com/session/minecraft/profile/';

export interface HeadLoaderOptions {
  avatars: AvatarTemplates;
  fetchFile: (url: string, maxBytes: number) => Promise<Buffer>;
  now: () => number;
  logger: Pick<Console, 'error'>;
}

/** The face of a skin, with the layer over it (the hat), as the 8 by 8 picture the card draws. */
export const headOfSkin = async (skin: Buffer): Promise<Image> => {
  const image = await loadImage(skin);
  const canvas = createCanvas(8, 8);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 8, 8, 8, 8, 0, 0, 8, 8);
  // The old skins are 64 by 32 and have no layer over the face
  if (image.height >= 64) context.drawImage(image, 40, 8, 8, 8, 0, 0, 8, 8);
  return loadImage(canvas.toBuffer('image/png'));
};

/** The address of the skin in the textures of a profile of Mojang's session server, only when it is on Mojang's textures host. */
export const skinAddressOf = (profile: string): string | null => {
  try {
    const properties = (JSON.parse(profile) as { properties?: { name?: unknown; value?: unknown }[] }).properties ?? [];
    const textures = properties.find(property => property.name === 'textures');
    if (typeof textures?.value !== 'string') return null;
    const document = JSON.parse(Buffer.from(textures.value, 'base64').toString('utf8')) as { textures?: { SKIN?: { url?: unknown } } };
    const address = document.textures?.SKIN?.url;
    if (typeof address !== 'string') return null;
    const url = new URL(address);
    return url.protocol === 'https:' && url.hostname === TEXTURES_HOST ? url.href : null;
  } catch {
    return null;
  }
};

/**
 * Loads the head of a player for the pictures. It comes from the avatar template that applies to them. When that cannot be had, which
 * the host of the bot may cause (a head service can refuse a server), it is drawn from their skin straight from Mojang: the hash of the
 * skin the server shows when it says one, else the skin of their account. What failed is logged once, and a head that could not be had
 * is tried again after a minute.
 */
export const createHeadLoader = (options: HeadLoaderOptions): HeadLoader => {
  const kept = new Map<string, { at: number; ttl: number; image: Promise<Image | null> }>();

  const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

  const fromMojang = async (player: ListedPlayer): Promise<Image | null> => {
    let address: string | null = null;
    if (player.skin) {
      address = `${TEXTURE_FOLDER}${player.skin}`;
    } else if (player.premium && player.uuid) {
      const profile = await options.fetchFile(`${SESSION_PROFILE}${player.uuid.replaceAll('-', '')}`, MAX_PROFILE_BYTES);
      address = skinAddressOf(profile.toString('utf8'));
    }
    return address ? headOfSkin(await options.fetchFile(address, MAX_SKIN_BYTES)) : null;
  };

  const load = async (player: ListedPlayer, url: string): Promise<Image | null> => {
    try {
      return await loadImage(await options.fetchFile(url, MAX_HEAD_BYTES));
    } catch (error) {
      options.logger.error(`[Minecraft] The head of ${player.name} could not be had from ${new URL(url).host} (${describe(error)}); trying Mojang's skin.`);
    }
    try {
      return await fromMojang(player);
    } catch (error) {
      options.logger.error(`[Minecraft] The head of ${player.name} could not be had from Mojang either (${describe(error)}).`);
      return null;
    }
  };

  return player => {
    const url = avatarOf(options.avatars, {
      uuid: player.uuid ?? NO_UUID,
      name: player.name,
      nickname: player.nickname,
      premium: player.premium ?? false,
      skin: player.skin ?? null,
    });
    const known = kept.get(url);
    if (known && options.now() - known.at < known.ttl) return known.image;
    const image = load(player, url);
    const entry = { at: options.now(), ttl: HEAD_TTL_MS, image };
    kept.set(url, entry);
    void image.then(found => {
      if (!found) entry.ttl = MISS_TTL_MS;
    });
    return image;
  };
};
