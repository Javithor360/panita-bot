import { env } from '../../config/env';
import { ApiClient } from './client';

export { API_TIMEOUTS, PRE_ACK_REQUEST } from './client';
export { ApiError, isApiError } from './errors';
export { verifyApiAccess } from './startup';

/** The shared client, authenticated with the bot's service key. */
export const api = new ApiClient(env.PANITA_API_URL, env.PANITA_API_KEY);
