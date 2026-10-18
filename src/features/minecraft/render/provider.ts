import { loadImage, type Image } from '@napi-rs/canvas';
import { avatarOf, type AvatarTemplates } from '../inbound';
import type { ListedPlayer } from '../protocol';
import { Cards } from './cards';
import { Fonts } from './fonts';
import { DirectorySource, ZipSource, type ResourceSource } from './resources';

const FONT_PROBE = 'assets/minecraft/font/default.json';
const PACK_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_PACK_BYTES = 120 * 1024 * 1024;
const MAX_HEAD_BYTES = 1024 * 1024;
const HEAD_TTL_MS = 10 * 60 * 1000;
const NO_UUID = '00000000-0000-0000-0000-000000000000';

export interface CardProviderOptions {
  /** The folder made by `npm run assets:minecraft`: the game's fonts and ping icons. */
  assetsDir: string;
  /** A resource pack to take extra fonts from (the rank icons), downloaded and kept for a few hours. */
  packUrl?: string;
  avatars: AvatarTemplates;
  logger: Pick<Console, 'log' | 'error'>;
  fetchFile?: (url: string, maxBytes: number) => Promise<Buffer>;
  now?: () => number;
}

/** Downloads a file, refusing one that announces or turns out bigger than the limit. */
export const downloadFile = async (url: string, maxBytes: number, timeoutMs = 60_000): Promise<Buffer> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const announced = Number(response.headers.get('content-length') ?? 0);
  if (announced > maxBytes) throw new Error('the file is too large');
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > maxBytes) throw new Error('the file is too large');
  return data;
};

/**
 * Makes the drawing of the Minecraft pictures available when the game's assets are in place, and tells the commands when
 * they are not (they then answer with text). The resource pack is fetched the first time it is needed and renewed every few
 * hours, so a new version of the pack reaches the pictures without restarting the bot.
 */
export const createCardProvider = (options: CardProviderOptions): (() => Promise<Cards | null>) => {
  const now = options.now ?? Date.now;
  const fetchFile = options.fetchFile ?? ((url, max) => downloadFile(url, max));
  const vanilla = new DirectorySource(options.assetsDir);
  const heads = new Map<string, { at: number; image: Promise<Image | null> }>();
  let warned = false;
  let current: { cards: Cards; at: number } | null = null;
  let building: Promise<Cards | null> | null = null;

  const head = (player: ListedPlayer): Promise<Image | null> => {
    const url = avatarOf(options.avatars, {
      uuid: player.uuid ?? NO_UUID,
      name: player.name,
      nickname: player.nickname,
      premium: player.premium ?? false,
      skin: player.skin ?? null,
    });
    const known = heads.get(url);
    if (known && now() - known.at < HEAD_TTL_MS) return known.image;
    const image = fetchFile(url, MAX_HEAD_BYTES)
      .then(data => loadImage(data))
      .catch(() => null);
    heads.set(url, { at: now(), image });
    return image;
  };

  const build = async (): Promise<Cards | null> => {
    if (!(await vanilla.read(FONT_PROBE))) {
      if (!warned) {
        warned = true;
        options.logger.log(`[Minecraft] The game's fonts are not in ${options.assetsDir}, so the pictures of /playerlist and /playerinfo are off. Run \`npm run assets:minecraft\`.`);
      }
      return null;
    }
    const sources: ResourceSource[] = [];
    if (options.packUrl) {
      try {
        sources.push(new ZipSource(await fetchFile(options.packUrl, MAX_PACK_BYTES)));
      } catch (error) {
        options.logger.error('[Minecraft] Could not download the resource pack; the pictures use the game\'s fonts only:', error);
      }
    }
    sources.push(vanilla);
    return new Cards(new Fonts(sources), vanilla, head);
  };

  return async () => {
    if (current && now() - current.at < PACK_TTL_MS) return current.cards;
    building ??= build()
      .then(cards => {
        if (cards) current = { cards, at: now() };
        return cards ?? current?.cards ?? null;
      })
      .finally(() => {
        building = null;
      });
    return building;
  };
};
