import { api } from '../lib/api';

/**
 * Removes the Discord mapping of a deleted Discord role. The web role itself is kept so relations
 * and historical data aren't lost. Returns how many web roles were unmapped (0 or 1).
 */
export const unmapDiscordRole = async (discordRoleId: string): Promise<number> => {
  const { unmapped } = await api.post<{ unmapped: number }>('/v1/discord/roles/{discordRoleId}/unmap', undefined, {
    params: { discordRoleId },
  });
  return unmapped;
};
