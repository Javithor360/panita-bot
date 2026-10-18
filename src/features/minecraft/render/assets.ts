import { createHash } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';

/**
 * The few files of the game the Minecraft pictures need: its fonts and the latency icons. They belong to Mojang, so they are
 * never committed; they are copied out of an installed client (`npm run assets:minecraft`) or downloaded from Mojang's own
 * servers, which is what the game's launcher does.
 */

/** The files in the client jar that the pictures use. */
export const wantedInJar = (name: string): boolean =>
  !name.endsWith('/') &&
  (name.startsWith('assets/minecraft/font/') ||
    name.startsWith('assets/minecraft/textures/font/') ||
    /^assets\/minecraft\/textures\/gui\/sprites\/icon\/ping_[a-z0-9]+\.png$/.test(name));

/** The files that are not in the jar but in the asset store, by their names there. */
export const STORE_FILES = ['minecraft/font/include/unifont.json', 'minecraft/font/unifont.zip'] as const;

/** The wanted files of a client jar, by their path in the pack. */
export const assetsFromJar = (jar: Uint8Array): Record<string, Uint8Array> =>
  Object.fromEntries(Object.entries(unzipSync(jar, { filter: file => wantedInJar(file.name) })).filter(([name]) => wantedInJar(name)));

/** Writes files under a folder; a path that would leave it is refused. */
export const writeAssets = async (folder: string, files: Record<string, Uint8Array>): Promise<void> => {
  for (const [path, data] of Object.entries(files)) {
    if (path.includes('..') || path.startsWith('/')) throw new Error(`unsafe path ${path}`);
    const file = join(folder, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
  }
};

/** Mojang's own hosts; nothing a manifest says is fetched from anywhere else. */
const MOJANG_HOSTS = ['piston-meta.mojang.com', 'piston-data.mojang.com', 'launchermeta.mojang.com', 'launcher.mojang.com', 'resources.download.minecraft.net'];
const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const RESOURCES = 'https://resources.download.minecraft.net';
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_JAR_BYTES = 80 * 1024 * 1024;
const MAX_OBJECT_BYTES = 8 * 1024 * 1024;

const sha1 = (data: Uint8Array) => createHash('sha1').update(data).digest('hex');
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const trusted = (address: unknown): string => {
  if (typeof address !== 'string') throw new Error('the manifest has no address where one is expected');
  const url = new URL(address);
  if (url.protocol !== 'https:' || !MOJANG_HOSTS.includes(url.hostname)) throw new Error(`${url.hostname} is not a Mojang host`);
  return address;
};

export interface DownloadOptions {
  /** The folder to fill; made if it does not exist. */
  folder: string;
  /** A game version such as `1.21.5`; the latest release when absent. */
  version?: string;
  fetchFile(url: string, maxBytes: number): Promise<Buffer>;
  logger: Pick<Console, 'log'>;
}

/** Reads a JSON file of the manifests. */
const getJson = async (options: DownloadOptions, url: string): Promise<Record<string, unknown>> => {
  const parsed: unknown = JSON.parse((await options.fetchFile(trusted(url), MAX_JSON_BYTES)).toString('utf8'));
  if (!isObject(parsed)) throw new Error('a manifest is not an object');
  return parsed;
};

/** A file whose hash the manifest gave; one that does not match is not used. */
const getChecked = async (options: DownloadOptions, url: string, hash: unknown, max: number): Promise<Buffer> => {
  const data = await options.fetchFile(trusted(url), max);
  if (typeof hash !== 'string' || sha1(data) !== hash) throw new Error(`${url} does not match its hash`);
  return data;
};

/**
 * Downloads the game's fonts and latency icons from Mojang: the version manifest, the client jar of the version (checked against
 * its hash) and, from the asset store, the files that are not in the jar. Everything is fetched into memory and written only when
 * all of it arrived, into a temporary folder that then takes the place of the real one, so a failure leaves nothing half done.
 */
export const downloadAssets = async (options: DownloadOptions): Promise<void> => {
  const manifest = await getJson(options, MANIFEST);
  const versions = Array.isArray(manifest.versions) ? manifest.versions.filter(isObject) : [];
  const latest = isObject(manifest.latest) && typeof manifest.latest.release === 'string' ? manifest.latest.release : undefined;
  const wanted = options.version ?? latest;
  const entry = versions.find(version => version.id === wanted);
  if (!entry) throw new Error(`Mojang has no version ${wanted ?? '(latest)'}`);

  options.logger.log(`[Minecraft] Downloading the fonts of Minecraft ${wanted} from Mojang.`);
  const version = await getJson(options, entry.url as string);
  const client = isObject(version.downloads) && isObject(version.downloads.client) ? version.downloads.client : null;
  const assetIndex = isObject(version.assetIndex) ? version.assetIndex : null;
  if (!client || !assetIndex) throw new Error('the version has no client or asset index');

  const files = assetsFromJar(await getChecked(options, client.url as string, client.sha1, MAX_JAR_BYTES));
  if (Object.keys(files).length === 0) throw new Error('the client jar has no fonts');

  const objects = (await getJson(options, assetIndex.url as string)).objects;
  for (const name of STORE_FILES) {
    const object = isObject(objects) ? objects[name] : undefined;
    const hash = isObject(object) ? object.hash : undefined;
    if (typeof hash !== 'string' || !/^[0-9a-f]{40}$/.test(hash)) throw new Error(`the asset index has no ${name}`);
    files[`assets/${name}`] = await getChecked(options, `${RESOURCES}/${hash.slice(0, 2)}/${hash}`, hash, MAX_OBJECT_BYTES);
  }

  const temporary = `${options.folder}.partial`;
  await rm(temporary, { recursive: true, force: true });
  await writeAssets(temporary, files);
  await rm(options.folder, { recursive: true, force: true });
  await rename(temporary, options.folder);
  options.logger.log(`[Minecraft] The fonts are in ${options.folder}.`);
};
