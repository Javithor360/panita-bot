import { readFile } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';
import { unzipSync } from 'fflate';

/**
 * Where the files of a resource pack come from. A path is the one inside the pack (`assets/minecraft/font/default.json`), so a
 * folder, a zip and the vanilla files are read the same way. Everything here is untrusted data from a pack: a path that tries
 * to leave the folder is not read.
 */
export interface ResourceSource {
  read(path: string): Promise<Buffer | null>;
}

/** The files in a folder on disk. */
export class DirectorySource implements ResourceSource {
  constructor(private readonly root: string) {}

  async read(path: string): Promise<Buffer | null> {
    const file = normalize(join(this.root, path));
    if (!file.startsWith(normalize(this.root) + sep)) return null;
    try {
      return await readFile(file);
    } catch {
      return null;
    }
  }
}

/**
 * The files in a zip held in memory. A file is unpacked when it is read and not before, so a big pack costs only the zip itself
 * and the few files its fonts use.
 */
export class ZipSource implements ResourceSource {
  constructor(private readonly zip: Uint8Array) {}

  async read(path: string): Promise<Buffer | null> {
    const found = unzipSync(this.zip, { filter: file => file.name === path && file.originalSize <= MAX_ENTRY_BYTES })[path];
    return found ? Buffer.from(found) : null;
  }
}

/** No single file of a pack may be bigger than this when it is unpacked. */
const MAX_ENTRY_BYTES = 16 * 1024 * 1024;

/** Every source's file, for the ones that add up (a font defined in several packs). */
export const readAll = async (sources: readonly ResourceSource[], path: string): Promise<Buffer[]> =>
  (await Promise.all(sources.map(source => source.read(path)))).filter((found): found is Buffer => found !== null);

/** `namespace:path` of a resource id, with the namespace `minecraft` when it has none. */
export const splitId = (id: string): { namespace: string; path: string } => {
  const colon = id.indexOf(':');
  return colon < 0 ? { namespace: 'minecraft', path: id } : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
};

/** Where a font definition lives inside a pack. */
export const fontPath = (id: string) => {
  const { namespace, path } = splitId(id);
  return `assets/${namespace}/font/${path}.json`;
};

/** Where a texture named by a font provider lives inside a pack (\`file\` already has the \`.png\`). */
export const texturePath = (id: string) => {
  const { namespace, path } = splitId(id);
  return `assets/${namespace}/textures/${path}`;
};

/** Where a file named by a font provider outside \`textures\` lives (the unifont zip). */
export const filePath = (id: string) => {
  const { namespace, path } = splitId(id);
  return `assets/${namespace}/${path}`;
};
