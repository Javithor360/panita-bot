import { MAX_MEDIA, mediaHostAllowed, toMediaEntry, type MediaEntry } from './protocol';

/**
 * Images that a member pasted as links instead of uploading them. A direct link to an image on an allowed host is an image
 * as it stands. A link to a page of Klipy, Tenor or Giphy is not an image, but those pages say which image they stand for in
 * their social preview (`og:image`), and that is what Discord shows too. Only those pages are ever requested by the bot, with
 * a short time, a small size, and no redirect to another host.
 */

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** The pages that are asked what image they stand for. */
const PAGE_HOSTS: readonly string[] = ['klipy.com', 'www.klipy.com', 'tenor.com', 'www.tenor.com', 'giphy.com', 'www.giphy.com'];

const URL_PATTERN = /<?(https?:\/\/[^\s<>|]+)>?/gi;
const MAX_PAGE_BYTES = 1024 * 1024;
const PAGE_TIMEOUT_MS = 4000;
const MAX_REDIRECTS = 3;
const MAX_LINKS = MAX_MEDIA;

/**
 * Asks Discord for the current signed address of an attachment (the `/attachments/refresh-urls` endpoint). Discord stopped serving
 * an attachment address without its signature, and a signature expires, so a link pasted in a message is often dead as written.
 * The answer maps each address asked about to its fresh one; whatever could not be refreshed is left out.
 */
export type RefreshAddresses = (addresses: string[]) => Promise<Record<string, string>>;

/** What a page request gives: the text of the page, or null when it could not be read. */
export type FetchPage = (url: string) => Promise<string | null>;

export interface LinkedMedia {
  entries: MediaEntry[];
  /** The links that became images, exactly as written in the message, so that they leave its text. */
  consumed: string[];
}

const EMPTY: LinkedMedia = { entries: [], consumed: [] };

const entities = (value: string) =>
  value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');

const extensionOf = (pathname: string): string | null => {
  const match = /\.([a-z0-9]{3,4})$/i.exec(pathname);
  return match && IMAGE_TYPES[match[1].toLowerCase()] ? match[1].toLowerCase() : null;
};

const nameOf = (pathname: string, fallback: string) => {
  const last = decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '').trim();
  return last || fallback;
};

/** Whether the address is an attachment of Discord, whose signature may be missing or out of date. */
const isDiscordAttachment = (address: URL) =>
  ['cdn.discordapp.com', 'media.discordapp.net'].includes(address.hostname) && /^\/(ephemeral-)?attachments\//.test(address.pathname);

/** The entry with the fresh address Discord gives, or as it is when Discord cannot (never an error, never a different host). */
const withFreshAddress = async (entry: MediaEntry, refresh: RefreshAddresses): Promise<MediaEntry> => {
  try {
    const fresh = (await refresh([entry.url]))[entry.url];
    return (fresh && toMediaEntry({ ...entry, contentType: entry.type, url: fresh })) || entry;
  } catch {
    return entry;
  }
};

/** The image a link is, if it points straight at one on an allowed host. */
const direct = (address: URL): MediaEntry | null => {
  const extension = extensionOf(address.pathname);
  if (!extension || address.protocol !== 'https:' || !mediaHostAllowed(address.hostname)) return null;
  return toMediaEntry({
    url: address.toString(),
    name: nameOf(address.pathname, `imagen.${extension}`),
    contentType: IMAGE_TYPES[extension],
    size: 0,
    width: null,
    height: null,
    spoiler: false,
  });
};

/** The `og:image` addresses of a page with the type each one says it has, in the order of the page. */
export const previewImages = (html: string): { url: string; type: string | null }[] => {
  const images: { url: string; type: string | null }[] = [];
  for (const tag of html.match(/<meta\s[^>]*>/gi) ?? []) {
    const property = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (!property || content === undefined) continue;
    if (property === 'og:image' || property === 'og:image:url') images.push({ url: entities(content), type: null });
    else if (property === 'og:image:type' && images.length > 0 && images[images.length - 1].type === null) images[images.length - 1].type = content.toLowerCase();
  }
  return images;
};

/** A GIF if there is one (the page may offer a still too), then a PNG or JPEG, and a WebP only when there is nothing else. */
const preference = (type: string | null, url: string): number => {
  const known = type ?? IMAGE_TYPES[extensionOf(new URL(url).pathname) ?? ''] ?? null;
  return known === 'image/gif' ? 0 : known === 'image/png' || known === 'image/jpeg' ? 1 : known === 'image/webp' ? 2 : 3;
};

const fromPage = async (page: URL, fetchPage: FetchPage): Promise<MediaEntry | null> => {
  const html = await fetchPage(page.toString());
  if (html === null) return null;
  const candidates = previewImages(html)
    .flatMap(image => {
      try {
        return [{ address: new URL(image.url), type: image.type }];
      } catch {
        return [];
      }
    })
    .filter(({ address }) => address.protocol === 'https:' && mediaHostAllowed(address.hostname))
    .sort((a, b) => preference(a.type, a.address.toString()) - preference(b.type, b.address.toString()));
  for (const { address, type } of candidates) {
    const extension = extensionOf(address.pathname);
    const contentType = type ?? (extension ? IMAGE_TYPES[extension] : null);
    if (!contentType) continue;
    const slug = nameOf(page.pathname, 'imagen');
    const entry = toMediaEntry({
      url: address.toString(),
      name: slug.includes('.') ? slug : `${slug}.${extension ?? contentType.split('/')[1]}`,
      contentType,
      size: 0,
      width: null,
      height: null,
      spoiler: false,
    });
    if (entry) return entry;
  }
  return null;
};

/** Finds the images among the links of a message. At most `room` are returned, in the order of the message. */
export const createLinkMedia = (deps: { fetchPage: FetchPage; refresh?: RefreshAddresses }) => async (content: string, room: number): Promise<LinkedMedia> => {
  if (room <= 0) return EMPTY;
  const entries: MediaEntry[] = [];
  const consumed: string[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(URL_PATTERN)) {
    if (seen.size >= MAX_LINKS || entries.length >= room) break;
    // A sentence ends with a dot or a comma that is not part of the link
    const written = match[1].replace(/[.,;:!?)\]]+$/, '');
    if (seen.has(written)) continue;
    seen.add(written);
    let address: URL;
    try {
      address = new URL(written);
    } catch {
      continue;
    }
    let entry = address.protocol === 'https:' && PAGE_HOSTS.includes(address.hostname) ? await fromPage(address, deps.fetchPage) : direct(address);
    if (entry && deps.refresh && isDiscordAttachment(address)) entry = await withFreshAddress(entry, deps.refresh);
    if (entry) {
      entries.push(entry);
      consumed.push(written);
    }
  }
  return { entries, consumed };
};

/**
 * Reads a page of one of the PAGE_HOSTS: https only, a few redirects that stay on those hosts, a size limit and a time limit.
 * Anything else is null, never an error, so a link that cannot be read is just left as text.
 */
export const fetchPreviewPage: FetchPage = async url => {
  let current = url;
  for (let hops = 0; hops <= MAX_REDIRECTS; hops++) {
    let address: URL;
    try {
      address = new URL(current);
    } catch {
      return null;
    }
    if (address.protocol !== 'https:' || !PAGE_HOSTS.includes(address.hostname)) return null;
    try {
      const response = await fetch(address, {
        redirect: 'manual',
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)', Accept: 'text/html' },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return null;
        current = new URL(location, address).toString();
        continue;
      }
      if (!response.ok || !response.body) return null;
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > MAX_PAGE_BYTES) return null;
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString('utf8');
    } catch {
      return null;
    }
  }
  return null;
};
