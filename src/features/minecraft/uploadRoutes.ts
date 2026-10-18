import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { MAX_UPLOAD_BYTES, parseMultipart, type MediaUploads } from './upload';

export const UPLOAD_PATH = '/bridge/media';

/** The room for the metadata and the multipart framing around the largest image. */
const BODY_LIMIT = MAX_UPLOAD_BYTES + 16 * 1024;

/**
 * The HTTP side of the screenshots of the game. The key is checked before the body is read, so a request without it costs
 * nothing; the body is then read as raw bytes up to the limit and handed to {@link MediaUploads}, which checks the rest.
 */
export const mountUploadRoutes = (app: Express, uploads: MediaUploads, isAuthorized: (authorization: string | undefined) => boolean) => {
  const authorized = (request: Request, response: Response, next: NextFunction) => {
    if (isAuthorized(request.headers.authorization)) return next();
    response.status(401).json({ error: 'auth' });
  };

  app.post(
    UPLOAD_PATH,
    authorized,
    express.raw({ type: () => true, limit: BODY_LIMIT }),
    async (request: Request, response: Response) => {
      const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
      const result = await uploads.upload(parseMultipart(request.headers['content-type'], body));
      response.status(result.status).json(result.body);
    },
  );

  app.delete(`${UPLOAD_PATH}/:messageId`, authorized, async (request: Request, response: Response) => {
    const id = String(request.params.messageId);
    const player = request.headers['x-player-uuid'];
    const status = /^\d{1,24}$/.test(id) ? await uploads.remove(id, typeof player === 'string' ? player : undefined) : 404;
    response.status(status).end();
  });

  // A body past the limit is refused by the reader before it reaches anything else
  app.use(UPLOAD_PATH, (error: { type?: string }, _request: Request, response: Response, next: NextFunction) => {
    if (error?.type === 'entity.too.large') return void response.status(413).json({ error: 'too_large' });
    next(error);
  });
};
