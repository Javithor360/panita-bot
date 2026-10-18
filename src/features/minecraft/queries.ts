import { UserError } from '../../core/errors';
import { BridgeQueryError, BridgeUnavailableError, type BridgeLink } from './link';
import { MC_TEXT } from './messages';
import type { QueryData, QueryKind } from './protocol';

/**
 * Asks the Minecraft server something for a command. A bridge that is off, a server that is not connected and one that does not
 * answer in time each become a message for the member.
 */
export const queryMinecraft = async <K extends QueryKind>(
  link: Pick<BridgeLink, 'request'> | null,
  what: K,
  options?: { player?: string },
): Promise<QueryData[K]> => {
  if (!link) throw new UserError(MC_TEXT.bridgeOff);
  try {
    return await link.request(what, options);
  } catch (error) {
    if (error instanceof BridgeUnavailableError) throw new UserError(MC_TEXT.notConnected);
    if (error instanceof BridgeQueryError) throw new UserError(MC_TEXT.noAnswer);
    throw error;
  }
};
