import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import type { ListedPlayer, TextRun } from '../protocol';
import { SCALE, lineHeight, type Fonts } from './fonts';
import type { ResourceSource } from './resources';
import { drawRuns } from './text';

/** Loads the head of a player for the list; null when it cannot be had, and the list draws a gray square. */
export type HeadLoader = (player: ListedPlayer) => Promise<Image | null>;

const PING_SPRITE_FOLDER = 'assets/minecraft/textures/gui/sprites/icon/';
const PING_WIDTH = 10;
const PING_HEIGHT = 8;
const ROW_HEIGHT = 10;
const HEAD = 8;
const GREEN = '#55ff55';
const RED = '#ff5555';
const GRAY = '#aaaaaa';

/** The sprite for a latency, the way the game picks it: more bars for less delay, a broken one when unknown. */
export const pingSprite = (ping: number | undefined): string => {
  if (ping === undefined || ping < 0) return 'ping_unknown';
  if (ping < 150) return 'ping_5';
  if (ping < 300) return 'ping_4';
  if (ping < 600) return 'ping_3';
  if (ping < 1000) return 'ping_2';
  return 'ping_1';
};

/** What the line of a player says when the server gave none: the name they use in chat. */
export const runsOf = (player: ListedPlayer): TextRun[] =>
  player.display && player.display.length > 0 ? player.display : [{ text: player.nickname ?? player.name }];

const fontsOf = (runs: readonly TextRun[]) => runs.flatMap(run => (run.font ? [run.font] : []));

/**
 * Draws the pictures the Minecraft commands answer with: the list of players as the game's tab list shows it, and a player's
 * card as the game shows an item's tooltip. Pure drawing: the fonts, sprites and heads come in from outside.
 */
export class Cards {
  constructor(
    private readonly fonts: Fonts,
    private readonly sprites: ResourceSource,
    private readonly heads: HeadLoader,
  ) {}

  private pings = new Map<string, Promise<Image | null>>();

  private ping(name: string): Promise<Image | null> {
    let found = this.pings.get(name);
    if (!found) {
      found = this.sprites.read(`${PING_SPRITE_FOLDER}${name}.png`).then(data => (data ? loadImage(data) : null)).catch(() => null);
      this.pings.set(name, found);
    }
    return found;
  }

  /** The tab list: a title and a row for each player with the head, the line the server shows, and the latency bars. */
  async playerList(players: readonly ListedPlayer[], max: number): Promise<Buffer> {
    const title: TextRun[] = [{ text: `Jugadores en línea (${players.length}/${max})`, color: GREEN }];
    const rows = players.map(runsOf);
    await this.fonts.ensure([...fontsOf(title), ...rows.flatMap(fontsOf)]);
    const heads = await Promise.all(players.map(player => this.heads(player)));
    const sprites = await Promise.all(players.map(player => this.ping(pingSprite(player.ping))));

    const textWidth = Math.max(0, ...rows.map(row => this.fonts.layout(row).width));
    const titleWidth = this.fonts.layout(title).width;
    const inner = Math.max(120 * SCALE, titleWidth, (1 + HEAD + 2) * SCALE + textWidth + 6 * SCALE + PING_WIDTH * SCALE);
    const pad = 2 * SCALE;
    const width = inner + 2 * pad;
    const height = pad + ROW_HEIGHT * SCALE + (rows.length * (ROW_HEIGHT + 1) * SCALE) + pad;
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;

    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    context.fillRect(0, 0, width, height);
    drawRuns(context, this.fonts, title, Math.round((width - titleWidth) / 2), pad + SCALE);

    rows.forEach((row, index) => {
      const top = pad + (ROW_HEIGHT + index * (ROW_HEIGHT + 1)) * SCALE + SCALE;
      context.fillStyle = 'rgba(255, 255, 255, 0.13)';
      context.fillRect(pad, top, inner, ROW_HEIGHT * SCALE);
      this.head(context, heads[index], pad + SCALE, top + SCALE);
      drawRuns(context, this.fonts, row, pad + (1 + HEAD + 2) * SCALE, top + SCALE);
      const sprite = sprites[index];
      if (sprite) context.drawImage(sprite, pad + inner - PING_WIDTH * SCALE - SCALE, top + SCALE, PING_WIDTH * SCALE, PING_HEIGHT * SCALE);
    });
    return canvas.toBuffer('image/png');
  }

  /** A player's card: their line and whether they are online, in a box like an item's tooltip. */
  async playerCard(player: ListedPlayer, online: boolean): Promise<Buffer> {
    const line = runsOf(player);
    const status: TextRun[] = [
      { text: 'Status: ', color: GRAY },
      { text: online ? 'Online' : 'Offline', color: online ? GREEN : RED },
    ];
    await this.fonts.ensure([...fontsOf(line), ...fontsOf(status)]);
    const widest = Math.max(this.fonts.layout(line).width, this.fonts.layout(status).width);
    const pad = 4 * SCALE;
    const margin = 2 * SCALE;
    const boxWidth = widest + 2 * pad;
    const boxHeight = 2 * lineHeight + 2 * pad - SCALE;
    const canvas = createCanvas(boxWidth + 2 * margin, boxHeight + 2 * margin);
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    this.tooltip(context, margin, margin, boxWidth, boxHeight);
    drawRuns(context, this.fonts, line, margin + pad, margin + pad);
    drawRuns(context, this.fonts, status, margin + pad, margin + pad + lineHeight + SCALE);
    return canvas.toBuffer('image/png');
  }

  /** The game's tooltip: a very dark purple box with a purple border that fades down, and its corners cut. */
  private tooltip(context: SKRSContext2D, x: number, y: number, width: number, height: number) {
    const edge = SCALE;
    context.fillStyle = 'rgba(16, 0, 16, 0.94)';
    context.fillRect(x + edge, y, width - 2 * edge, height);
    context.fillRect(x, y + edge, width, height - 2 * edge);
    const border = context.createLinearGradient(0, y, 0, y + height);
    border.addColorStop(0, 'rgba(110, 40, 255, 0.85)');
    border.addColorStop(1, 'rgba(60, 0, 140, 0.85)');
    context.fillStyle = border;
    context.fillRect(x + edge, y + edge, width - 2 * edge, edge);
    context.fillRect(x + edge, y + height - 2 * edge, width - 2 * edge, edge);
    context.fillRect(x + edge, y + edge, edge, height - 2 * edge);
    context.fillRect(x + width - 2 * edge, y + edge, edge, height - 2 * edge);
  }

  private head(context: SKRSContext2D, image: Image | null, x: number, y: number) {
    if (!image) {
      context.fillStyle = 'rgba(120, 120, 120, 0.8)';
      context.fillRect(x, y, HEAD * SCALE, HEAD * SCALE);
      return;
    }
    context.imageSmoothingEnabled = false;
    context.drawImage(image, x, y, HEAD * SCALE, HEAD * SCALE);
  }
}
