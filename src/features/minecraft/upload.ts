import type { ChannelMap } from './channels';
import { avatarOf, type AvatarTemplates } from './inbound';
import { readPlayer, type BridgePlayer } from './protocol';
import { displayNameOf } from './render';
import type { HookFile, PostedFile } from './webhook';

/**
 * The screenshots of the game (section 4.4 of `docs/minecraft-bridge-plan.md`): the mod posts one image here, the bot has
 * Discord keep it and answers with its address. Everything in the request is untrusted: the image is told by its first bytes,
 * the metadata is checked for shape, and the bytes live in memory only for the length of the request.
 */

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_CAPTION = 200;
/** How long the bot remembers who posted an image, so that only they can take it back; as long as its address lives. */
const SHARE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SHARES = 2000;
const MAX_SIDE = 16_384;

export type UploadImageType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ImageInfo {
  type: UploadImageType;
  width: number;
  height: number;
}

const EXTENSION: Record<UploadImageType, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** The kind and size of an image, read from its own bytes; null when it is not a PNG, JPEG or WebP whose size can be read. */
export const sniffImage = (data: Buffer): ImageInfo | null => {
  const found = readHeader(data);
  if (!found || found.width < 1 || found.height < 1 || found.width > MAX_SIDE || found.height > MAX_SIDE) return null;
  return found;
};

const readHeader = (data: Buffer): ImageInfo | null => {
  if (data.length >= 24 && data.readUInt32BE(0) === 0x89504e47 && data.readUInt32BE(4) === 0x0d0a1a0a && data.toString('latin1', 12, 16) === 'IHDR') {
    return { type: 'image/png', width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return readJpeg(data);
  if (data.length >= 30 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') return readWebp(data);
  return null;
};

const readJpeg = (data: Buffer): ImageInfo | null => {
  let at = 2;
  while (at + 9 < data.length) {
    if (data[at] !== 0xff) return null;
    const marker = data[at + 1];
    if (marker === 0xff) {
      at++;
      continue;
    }
    // The frame header holds the size; the markers between 0xC0 and 0xCF other than these three are frame headers
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { type: 'image/jpeg', height: data.readUInt16BE(at + 5), width: data.readUInt16BE(at + 7) };
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2;
      continue;
    }
    at += 2 + data.readUInt16BE(at + 2);
  }
  return null;
};

const readWebp = (data: Buffer): ImageInfo | null => {
  const kind = data.toString('latin1', 12, 16);
  if (kind === 'VP8 ') return { type: 'image/webp', width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') {
    const bits = data.readUInt32LE(21);
    return { type: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') return { type: 'image/webp', width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
  return null;
};

export interface MultipartPart {
  name: string;
  filename: string | null;
  data: Buffer;
}

/** The parts of a `multipart/form-data` body; null when it is not well formed. At most four parts, so a body cannot be a swarm. */
export const parseMultipart = (contentType: string | undefined, body: Buffer): MultipartPart[] | null => {
  const boundary = contentType?.match(/^multipart\/form-data;\s*boundary=(?:"([^"]{1,70})"|([^\s;"]{1,70}))\s*$/i);
  const token = boundary?.[1] ?? boundary?.[2];
  if (!token) return null;
  const delimiter = Buffer.from(`--${token}`);
  const parts: MultipartPart[] = [];
  let at = body.indexOf(delimiter);
  if (at !== 0) return null;
  for (;;) {
    at += delimiter.length;
    if (body.toString('latin1', at, at + 2) === '--') return parts.length > 0 ? parts : null;
    if (body.toString('latin1', at, at + 2) !== '\r\n') return null;
    at += 2;
    const headerEnd = body.indexOf('\r\n\r\n', at);
    if (headerEnd < 0 || headerEnd - at > 1024) return null;
    const headers = body.toString('utf8', at, headerEnd);
    const disposition = headers.match(/^content-disposition:\s*form-data;\s*name="([^"]{1,32})"(?:;\s*filename="([^"]{0,128})")?/im);
    if (!disposition) return null;
    const start = headerEnd + 4;
    const next = body.indexOf(Buffer.concat([Buffer.from('\r\n'), delimiter]), start);
    if (next < 0 || parts.length >= 4) return null;
    parts.push({ name: disposition[1], filename: disposition[2] ?? null, data: body.subarray(start, next) });
    at = next + 2;
  }
};

export type UploadDestination = 'discord' | 'media';

export interface UploadMeta {
  player: BridgePlayer;
  channel: string;
  caption: string;
  destination: UploadDestination;
}

const CHANNEL = /^[a-z0-9_-]{1,32}$/;

/** The metadata part, checked for shape; null when anything is wrong with it. */
export const readUploadMeta = (raw: Buffer): UploadMeta | null => {
  let value: unknown;
  try {
    value = JSON.parse(raw.toString('utf8'));
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { player, channel, caption, destination } = value as Record<string, unknown>;
  const reader = readPlayer(player);
  if (!reader || typeof channel !== 'string' || !CHANNEL.test(channel)) return null;
  if (typeof caption !== 'string' || (destination !== 'discord' && destination !== 'media')) return null;
  // No control or invisible formatting characters, and never longer than the limit
  const clean = caption.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, MAX_CAPTION);
  return { player: reader, channel, caption: clean, destination };
};

export interface UploadAnswer {
  url: string;
  type: UploadImageType;
  size: number;
  width: number;
  height: number;
  messageId: string;
}

export type UploadError = 'bad_request' | 'auth' | 'channel' | 'too_large' | 'type' | 'rate' | 'unavailable';

const STATUS: Record<UploadError, number> = { bad_request: 400, auth: 401, channel: 404, too_large: 413, type: 415, rate: 429, unavailable: 503 };

export interface UploadResult {
  status: number;
  body: UploadAnswer | { error: UploadError } | null;
}

const failure = (error: UploadError): UploadResult => ({ status: STATUS[error], body: { error } });

/** Where the bot posts, as far as the upload needs; discord.js stays behind it. */
export interface UploadTargets {
  postAsPlayer(channelId: string, post: { username: string; avatarUrl: string; content: string }, file: HookFile): Promise<PostedFile | null>;
  deleteFromChannel(channelId: string, messageId: string): Promise<boolean>;
  media: {
    configured: boolean;
    post(file: HookFile): Promise<PostedFile | null>;
    remove(messageId: string): Promise<boolean>;
  };
}

export interface Limiter {
  take(key: string): boolean;
}

export interface UploadDeps {
  channels: ChannelMap;
  targets: UploadTargets;
  avatars: AvatarTemplates;
  /** At most this many images per player in a minute. */
  perPlayer: Limiter;
  /** And this many in all. */
  overall: Limiter;
  logger: Pick<Console, 'error'>;
  now?: () => number;
}

interface Share {
  player: string;
  where: { channelId: string } | 'media';
  at: number;
}

/** Takes the screenshots of the game and takes them back. The table of who posted what is in memory and bounded. */
export class MediaUploads {
  private readonly shares = new Map<string, Share>();
  private readonly now: () => number;

  constructor(private readonly deps: UploadDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** `parts` come from {@link parseMultipart}; the caller has already checked the key. */
  async upload(parts: MultipartPart[] | null): Promise<UploadResult> {
    const meta = parts?.find(part => part.name === 'meta');
    const file = parts?.find(part => part.name === 'file');
    if (!meta || !file || parts?.length !== 2) return failure('bad_request');
    const info = readUploadMeta(meta.data);
    if (!info) return failure('bad_request');
    if (file.data.length === 0) return failure('bad_request');
    if (file.data.length > MAX_UPLOAD_BYTES) return failure('too_large');
    const image = sniffImage(file.data);
    if (!image) return failure('type');
    const channelId = this.deps.channels.discordIdOf(info.channel);
    if (!channelId) return failure('channel');
    if (info.destination === 'media' && !this.deps.targets.media.configured) return failure('unavailable');
    if (!this.deps.perPlayer.take(info.player.uuid) || !this.deps.overall.take('all')) return failure('rate');

    const upload: HookFile = { data: file.data, name: `captura.${EXTENSION[image.type]}` };
    try {
      const posted =
        info.destination === 'discord'
          ? await this.deps.targets.postAsPlayer(
              channelId,
              { username: displayNameOf(info.player), avatarUrl: avatarOf(this.deps.avatars, info.player), content: info.caption },
              upload,
            )
          : await this.deps.targets.media.post(upload);
      if (!posted) return failure('unavailable');
      this.remember(posted.messageId, { player: info.player.uuid.toLowerCase(), where: info.destination === 'discord' ? { channelId } : 'media', at: this.now() });
      return { status: 200, body: { url: posted.url, type: image.type, size: file.data.length, width: image.width, height: image.height, messageId: posted.messageId } };
    } catch (error) {
      this.deps.logger.error('[Minecraft] Could not post a screenshot of the game:', error);
      return failure('unavailable');
    }
  }

  /** Takes back an image its poster asks to; `204` for done, `404` for anything else, so nobody learns what exists. */
  async remove(messageId: string, player: string | undefined): Promise<number> {
    this.forget();
    const share = this.shares.get(messageId);
    if (!share || !player || share.player !== player.toLowerCase()) return 404;
    try {
      const done = share.where === 'media' ? await this.deps.targets.media.remove(messageId) : await this.deps.targets.deleteFromChannel(share.where.channelId, messageId);
      if (done) this.shares.delete(messageId);
      return done ? 204 : 404;
    } catch (error) {
      this.deps.logger.error('[Minecraft] Could not delete a screenshot of the game:', error);
      return 404;
    }
  }

  private remember(messageId: string, share: Share) {
    this.forget();
    if (this.shares.size >= MAX_SHARES) {
      const oldest = this.shares.keys().next().value;
      if (oldest !== undefined) this.shares.delete(oldest);
    }
    this.shares.set(messageId, share);
  }

  private forget() {
    const limit = this.now() - SHARE_TTL_MS;
    for (const [id, share] of this.shares) {
      if (share.at >= limit) break;
      this.shares.delete(id);
    }
  }
}
