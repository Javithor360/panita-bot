import { UserError } from '../../core/errors';
import { createCooldown, type Cooldown } from '../../lib/cooldown';
import { ocr } from '../../lib/ocr';
import { downloadImage } from './source';
import { ocrMessage } from './view';

/** Time one person has to wait between two readings. Reading is heavy, so this protects the bot. */
export const OCR_COOLDOWN_MS = 15_000;

export const ocrCooldown = createCooldown(OCR_COOLDOWN_MS);

export const NO_IMAGE =
  'no encontré ninguna imagen. Adjunta una, responde con el comando a un mensaje que la tenga o usa la opción `imagen`.';

/** Starts the person's waiting time. Throws when they are still inside the previous one. */
export const claimTurn = (userId: string, cooldown: Cooldown = ocrCooldown) => {
  if (!cooldown.tryAcquire(userId)) {
    throw new UserError(`espera unos ${Math.round(OCR_COOLDOWN_MS / 1000)} segundos entre cada lectura.`);
  }
};

/** Downloads the image and reads its text, in the format of the reply. */
export const readImage = async (url: string, read: (image: Buffer) => Promise<string> = image => ocr.readText(image)) => {
  const image = await downloadImage(url).catch(() => {
    throw new UserError('no pude descargar esa imagen (debe ser PNG, JPG, WEBP o BMP y pesar menos de 8 MB).');
  });
  const text = await read(image);
  if (!text) throw new UserError('no encontré texto en esa imagen.');
  return ocrMessage(text);
};
