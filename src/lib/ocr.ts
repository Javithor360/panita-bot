import fs from 'fs';
import path from 'path';
import { UserError } from '../core/errors';

/**
 * Optical character recognition on top of tesseract.js. One worker is created the first time it is needed and
 * reused, and images are read one at a time: recognition is CPU heavy, so a queue keeps the bot responsive.
 */

export interface OcrWorker {
  recognize(image: Buffer): Promise<{ data: { text: string } }>;
}
export type WorkerFactory = () => Promise<OcrWorker>;

const LANGUAGES = ['spa', 'eng'];
/** Language data is downloaded once and kept here. */
const CACHE_PATH = path.join(process.cwd(), 'data', 'tesseract');
/** Images waiting behind the one being read; more than this is refused instead of piling up. */
const MAX_WAITING = 3;

const defaultFactory: WorkerFactory = async () => {
  fs.mkdirSync(CACHE_PATH, { recursive: true });
  const { createWorker } = await import('tesseract.js');
  return createWorker(LANGUAGES, 1, { cachePath: CACHE_PATH });
};

/** Trims the text and collapses the blank lines OCR tends to leave between blocks. */
export const cleanText = (text: string) => text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

export const createOcr = (factory: WorkerFactory = defaultFactory) => {
  let worker: Promise<OcrWorker> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let pending = 0;

  const readText = (image: Buffer): Promise<string> => {
    if (pending > MAX_WAITING) throw new UserError('estoy leyendo varias imágenes a la vez, inténtalo de nuevo en unos segundos.');
    pending += 1;

    const job = queue.then(async () => {
      worker ??= factory().catch(error => {
        worker = null;
        throw error;
      });
      const { data } = await (await worker).recognize(image);
      return cleanText(data.text);
    });
    const done = () => { pending -= 1; };
    queue = job.then(done, done);
    return job;
  };

  return { readText };
};

export const ocr = createOcr();
