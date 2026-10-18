import { createCanvas, loadImage, type Canvas, type Image } from '@napi-rs/canvas';
import { unzipSync } from 'fflate';
import type { TextRun } from '../protocol';
import { filePath, fontPath, readAll, texturePath, type ResourceSource } from './resources';

/** Canvas pixels for each pixel of the game's screen: the game draws at 1, the images here at 2 so they read well in Discord. */
export const SCALE = 2;
/** The line a glyph sits on, in the game's pixels from the top of the line. */
const BASELINE = 7;
const LINE_HEIGHT = 9;
const DEFAULT_FONT = 'minecraft:default';
const MAX_PROVIDER_DEPTH = 8;
const MAX_GLYPH_IMAGE_PIXELS = 4096 * 4096;

/** One character ready to draw: its picture at the drawing scale, where it goes and how far it moves the pen. */
interface Glyph {
  canvas: Canvas | null;
  /** Pen advance, in canvas pixels. */
  advance: number;
  /** Distance from the top of the line to the top of the picture, in canvas pixels. */
  top: number;
}

interface Provider {
  glyph(codepoint: number): Glyph | null;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A bitmap provider: a picture with a grid of characters. Each character's width is its own, cut at its last visible column. */
const bitmapProvider = (image: Image, def: Json): Provider | null => {
  const rows = Array.isArray(def.chars) ? def.chars.filter((row): row is string => typeof row === 'string') : [];
  const height = typeof def.height === 'number' ? def.height : 8;
  const ascent = typeof def.ascent === 'number' ? def.ascent : 0;
  const columns = Math.max(0, ...rows.map(row => [...row].length));
  if (rows.length === 0 || columns === 0 || image.width * image.height > MAX_GLYPH_IMAGE_PIXELS) return null;
  const cellWidth = Math.floor(image.width / columns);
  const cellHeight = Math.floor(image.height / rows.length);
  if (cellWidth < 1 || cellHeight < 1 || height <= 0) return null;
  const scale = height / cellHeight;

  const sheet = createCanvas(image.width, image.height);
  const sheetContext = sheet.getContext('2d');
  sheetContext.drawImage(image, 0, 0);
  const pixels = sheetContext.getImageData(0, 0, image.width, image.height).data;

  const glyphs = new Map<number, Glyph>();
  rows.forEach((row, rowIndex) => {
    [...row].forEach((char, columnIndex) => {
      const codepoint = char.codePointAt(0) ?? 0;
      if (codepoint === 0 || glyphs.has(codepoint)) return;
      // The width is up to the last column with something visible in it
      let visible = 0;
      for (let column = cellWidth - 1; column >= 0 && visible === 0; column--) {
        for (let line = 0; line < cellHeight; line++) {
          const alpha = pixels[((rowIndex * cellHeight + line) * image.width + columnIndex * cellWidth + column) * 4 + 3];
          if (alpha !== 0) {
            visible = column + 1;
            break;
          }
        }
      }
      const advance = (Math.round(visible * scale) + 1) * SCALE;
      if (visible === 0) {
        glyphs.set(codepoint, { canvas: null, advance, top: 0 });
        return;
      }
      const canvas = createCanvas(Math.max(1, Math.round(visible * scale * SCALE)), Math.max(1, Math.round(cellHeight * scale * SCALE)));
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = false;
      context.drawImage(image, columnIndex * cellWidth, rowIndex * cellHeight, visible, cellHeight, 0, 0, canvas.width, canvas.height);
      glyphs.set(codepoint, { canvas, advance, top: Math.round((BASELINE - ascent) * SCALE) });
    });
  });
  return { glyph: codepoint => glyphs.get(codepoint) ?? null };
};

/** A space provider: characters that only move the pen. */
const spaceProvider = (def: Json): Provider => {
  const glyphs = new Map<number, Glyph>();
  if (isObject(def.advances)) {
    for (const [char, advance] of Object.entries(def.advances)) {
      const codepoint = char.codePointAt(0);
      if (codepoint !== undefined && typeof advance === 'number') glyphs.set(codepoint, { canvas: null, advance: Math.round(advance * SCALE), top: 0 });
    }
  }
  return { glyph: codepoint => glyphs.get(codepoint) ?? null };
};

interface SizeOverride {
  from: number;
  to: number;
  left: number;
  right: number;
}

/** A unihex provider: Unifont's 16-row bitmaps from a `.hex` file, drawn at half size, one hex pixel for each canvas pixel. */
const unihexProvider = (hex: Map<number, string>, overrides: SizeOverride[]): Provider => {
  const cache = new Map<number, Glyph | null>();
  return {
    glyph(codepoint) {
      if (cache.has(codepoint)) return cache.get(codepoint) ?? null;
      const glyph = hexGlyph(hex.get(codepoint), overrides.find(range => codepoint >= range.from && codepoint <= range.to));
      cache.set(codepoint, glyph);
      return glyph;
    },
  };
};

const hexGlyph = (data: string | undefined, override: SizeOverride | undefined): Glyph | null => {
  if (!data) return null;
  const digitsPerRow = data.length === 32 ? 2 : data.length === 64 ? 4 : 0;
  if (digitsPerRow === 0) return null;
  const width = digitsPerRow * 4;
  const rows = 16;
  const bit = (row: number, column: number) => (Number.parseInt(data.slice(row * digitsPerRow, (row + 1) * digitsPerRow), 16) >> (width - 1 - column)) & 1;
  let left = override?.left ?? width;
  let right = override?.right ?? -1;
  if (!override) {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < width; column++) {
        if (bit(row, column)) {
          left = Math.min(left, column);
          right = Math.max(right, column);
        }
      }
    }
  }
  if (right < left) return { canvas: null, advance: 4 * SCALE, top: 0 };
  const visible = right - left + 1;
  const canvas = createCanvas(visible, rows);
  const context = canvas.getContext('2d');
  const image = context.createImageData(visible, rows);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < visible; column++) {
      if (bit(row, left + column)) image.data.set([255, 255, 255, 255], (row * visible + column) * 4);
    }
  }
  context.putImageData(image, 0, 0);
  return { canvas, advance: visible + SCALE, top: 0 };
};

/** The glyphs of one font: its providers in order, the first that has a character wins. */
class FontSet {
  constructor(private readonly providers: readonly Provider[]) {}

  glyph(codepoint: number): Glyph | null {
    for (const provider of this.providers) {
      const found = provider.glyph(codepoint);
      if (found) return found;
    }
    return null;
  }
}

const withoutSign = (value: number) => (Number.isFinite(value) ? value : 0);

/**
 * The fonts of the game and of a resource pack, read from their JSON definitions: bitmap, space, unihex and reference
 * providers (TrueType is not supported). A font is loaded the first time it is asked for and kept. The definitions are
 * untrusted: a reference loop or a missing file just leaves that part of the font empty.
 */
export class Fonts {
  private readonly loading = new Map<string, Promise<FontSet>>();
  private readonly ready = new Map<string, FontSet>();

  /** @param sources the packs and the vanilla files, the first one first; fonts of the same id add up, first source first */
  constructor(private readonly sources: readonly ResourceSource[]) {}

  /** Loads fonts ahead of drawing, which has to be synchronous: {@link layout} only uses the fonts loaded here. */
  async ensure(ids: Iterable<string>): Promise<void> {
    await Promise.all([...new Set([DEFAULT_FONT, ...ids])].map(id => this.load(id)));
  }

  private async load(id: string): Promise<void> {
    let loading = this.loading.get(id);
    if (!loading) {
      loading = this.providersOf(id, 0).then(providers => new FontSet(providers));
      this.loading.set(id, loading);
    }
    this.ready.set(id, await loading);
  }

  private async providersOf(id: string, depth: number): Promise<Provider[]> {
    if (depth > MAX_PROVIDER_DEPTH) return [];
    const result: Provider[] = [];
    for (const raw of await readAll(this.sources, fontPath(id))) {
      let definition: unknown;
      try {
        definition = JSON.parse(raw.toString('utf8'));
      } catch {
        continue;
      }
      const list = isObject(definition) && Array.isArray(definition.providers) ? definition.providers : [];
      for (const entry of list) {
        if (isObject(entry)) result.push(...(await this.provider(entry, depth)));
      }
    }
    return result;
  }

  private async provider(def: Json, depth: number): Promise<Provider[]> {
    // The game's own filters only pick which of its files apply for an option the images do not have
    if (isObject(def.filter) && def.filter.uniform === true) return [];
    try {
      switch (def.type) {
        case 'reference':
          return typeof def.id === 'string' ? await this.providersOf(def.id, depth + 1) : [];
        case 'space':
          return [spaceProvider(def)];
        case 'bitmap': {
          if (typeof def.file !== 'string') return [];
          const data = await this.firstOf(texturePath(def.file));
          if (!data) return [];
          const provider = bitmapProvider(await loadImage(data), def);
          return provider ? [provider] : [];
        }
        case 'unihex': {
          if (typeof def.hex_file !== 'string') return [];
          const zip = await this.firstOf(filePath(def.hex_file));
          if (!zip) return [];
          return [unihexProvider(readHex(zip), readOverrides(def.size_overrides))];
        }
        default:
          return [];
      }
    } catch {
      return [];
    }
  }

  private async firstOf(path: string): Promise<Buffer | null> {
    for (const source of this.sources) {
      const found = await source.read(path);
      if (found) return found;
    }
    return null;
  }

  /** Where each glyph of the runs goes, and how wide the line is, in canvas pixels. A font not loaded with {@link ensure} is empty. */
  layout(runs: readonly TextRun[]): { width: number; placed: Placed[] } {
    const placed: Placed[] = [];
    let pen = 0;
    for (const run of runs) {
      const set = this.ready.get(run.font ?? DEFAULT_FONT);
      const start = pen;
      for (const char of run.text) {
        const codepoint = char.codePointAt(0) ?? 0;
        const glyph = set?.glyph(codepoint) ?? null;
        if (!glyph) {
          pen += 6 * SCALE;
          continue;
        }
        placed.push({ glyph, x: pen, run });
        pen += glyph.advance + (run.bold ? SCALE : 0);
      }
      if (run.underline || run.strikethrough) placed.push({ glyph: null, x: start, run, to: pen });
    }
    return { width: pen, placed };
  }

}

export interface Placed {
  glyph: Glyph | null;
  x: number;
  run: TextRun;
  /** For a line under or through a stretch of text: where it ends. */
  to?: number;
}

const readHex = (zip: Buffer): Map<number, string> => {
  const files = unzipSync(new Uint8Array(zip), { filter: file => file.name.endsWith('.hex') });
  const entry = Object.values(files)[0];
  const hex = new Map<number, string>();
  if (!entry) return hex;
  for (const line of Buffer.from(entry).toString('utf8').split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) hex.set(Number.parseInt(line.slice(0, colon), 16), line.slice(colon + 1).trim());
  }
  return hex;
};

const readOverrides = (value: unknown): SizeOverride[] =>
  (Array.isArray(value) ? value : []).flatMap(entry => {
    if (!isObject(entry) || typeof entry.from !== 'string' || typeof entry.to !== 'string') return [];
    const from = entry.from.codePointAt(0);
    const to = entry.to.codePointAt(0);
    return from !== undefined && to !== undefined && typeof entry.left === 'number' && typeof entry.right === 'number'
      ? [{ from, to, left: withoutSign(entry.left), right: withoutSign(entry.right) }]
      : [];
  });

export const lineHeight = LINE_HEIGHT * SCALE;

/** The color of a run, or white when it has none. */
export const colorOf = (run: TextRun) => run.color ?? '#ffffff';

/** `#rrggbb` darkened to a quarter, which is how the game colors the shadow of text. */
export const shadowOf = (color: string) => {
  const value = Number.parseInt(color.slice(1), 16);
  const part = (shift: number) => (((value >> shift) & 0xff) >> 2).toString(16).padStart(2, '0');
  return `#${part(16)}${part(8)}${part(0)}`;
};
