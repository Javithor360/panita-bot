import { createCanvas, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import type { TextRun } from '../protocol';
import { SCALE, colorOf, shadowOf, type Fonts, type Placed } from './fonts';

const tints = new WeakMap<Canvas, Map<string, Canvas>>();

/** The glyph multiplied by a color, as the game colors text; a glyph with colors of its own keeps them under a white run. */
const tinted = (glyph: Canvas, color: string): Canvas => {
  if (color === '#ffffff') return glyph;
  let byColor = tints.get(glyph);
  if (!byColor) {
    byColor = new Map();
    tints.set(glyph, byColor);
  }
  let found = byColor.get(color);
  if (!found) {
    found = createCanvas(glyph.width, glyph.height);
    const context = found.getContext('2d');
    context.drawImage(glyph, 0, 0);
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = color;
    context.fillRect(0, 0, glyph.width, glyph.height);
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(glyph, 0, 0);
    byColor.set(color, found);
  }
  return found;
};

const drawGlyph = (context: SKRSContext2D, placed: Placed, x: number, y: number, color: string, offset: number) => {
  const { glyph, run } = placed;
  if (!glyph?.canvas) return;
  const image = tinted(glyph.canvas, color);
  const left = x + placed.x + offset;
  const top = y + glyph.top + offset;
  context.save();
  if (run.italic) {
    // The slant leans from the foot of the line: the top moves right
    context.translate(left, y + 7 * SCALE + offset);
    context.transform(1, 0, -0.2, 1, 0, 0);
    context.drawImage(image, 0, top - (y + 7 * SCALE + offset));
    if (run.bold) context.drawImage(image, SCALE, top - (y + 7 * SCALE + offset));
  } else {
    context.drawImage(image, left, top);
    if (run.bold) context.drawImage(image, left + SCALE, top);
  }
  context.restore();
};

const drawLine = (context: SKRSContext2D, placed: Placed, x: number, y: number, color: string, offset: number) => {
  if (placed.to === undefined) return;
  context.fillStyle = color;
  const width = placed.to - placed.x;
  if (placed.run.underline) context.fillRect(x + placed.x + offset, y + 8 * SCALE + offset, width, SCALE);
  if (placed.run.strikethrough) context.fillRect(x + placed.x + offset, y + 4 * SCALE + offset, width, SCALE);
};

/** Draws a line of runs with its top left at (x, y), in canvas pixels. The fonts of the runs must have been loaded. */
export const drawRuns = (context: SKRSContext2D, fonts: Fonts, runs: readonly TextRun[], x: number, y: number, shadow = true) => {
  const { placed } = fonts.layout(runs);
  context.imageSmoothingEnabled = false;
  for (const withShadow of shadow ? [true, false] : [false]) {
    for (const piece of placed) {
      const color = withShadow ? shadowOf(colorOf(piece.run)) : colorOf(piece.run);
      const offset = withShadow ? SCALE : 0;
      drawGlyph(context, piece, x, y, color, offset);
      drawLine(context, piece, x, y, color, offset);
    }
  }
};
