import type { ApiClient } from './client';
import { ApiError } from './errors';
import type { WhoAmI } from './types';

const STARTUP_TIMEOUT_MS = 5_000;

/**
 * Checks the service key with `GET /v1/whoami`. Returns false only when the key is definitely unusable
 * (rejected, or it belongs to another client), so the caller can exit. An unreachable API only logs a
 * warning: the bot should still start while the API is briefly down.
 */
export const verifyApiAccess = async (client: ApiClient): Promise<boolean> => {
  try {
    const { client: name } = await client.get<WhoAmI>('/v1/whoami', { timeoutMs: STARTUP_TIMEOUT_MS });
    if (name !== 'bot') {
      console.error(`[API] PANITA_API_KEY belongs to the "${name}" client; the bot needs the key of the "bot" client.`);
      return false;
    }
    console.log('[API] Connected as bot');
    return true;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      console.error(
        `[API] The API rejected PANITA_API_KEY (${error.status} ${error.code}${error.requestId ? `, req=${error.requestId}` : ''}). Check the key.`,
      );
      return false;
    }
    console.warn('[API] Could not verify the API key; starting anyway. Commands that need data will fail until the API answers.');
    return true;
  }
};
