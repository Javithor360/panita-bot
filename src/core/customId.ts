/**
 * Component custom ID codec.
 *
 * Format: `namespace:action[:arg...][|ownerId]`
 * - `namespace` is the owning command name, used to route the interaction.
 * - `ownerId`, when present, restricts the component to that user (checked centrally by the router).
 */

export const MAX_CUSTOM_ID_LENGTH = 100;
const RESERVED = /[:|]/;

export interface CustomId {
  namespace: string;
  action: string;
  args: string[];
  owner?: string;
}

export const encodeCustomId = ({ namespace, action, args = [], owner }: Omit<CustomId, 'args'> & { args?: string[] }): string => {
  for (const part of [namespace, action, ...args]) {
    if (RESERVED.test(part)) throw new Error(`[customId] Reserved character in segment "${part}"`);
  }
  const id = [namespace, action, ...args].join(':') + (owner ? `|${owner}` : '');
  if (id.length > MAX_CUSTOM_ID_LENGTH) {
    throw new Error(`[customId] "${id}" exceeds ${MAX_CUSTOM_ID_LENGTH} characters`);
  }
  return id;
};

/** Returns `null` for IDs that don't follow the format (e.g. legacy `btn_*` IDs). */
export const decodeCustomId = (id: string): CustomId | null => {
  const [body, owner, ...rest] = id.split('|');
  if (rest.length > 0) return null;
  const [namespace, action, ...args] = body.split(':');
  if (!namespace || !action) return null;
  return { namespace, action, args, ...(owner ? { owner } : {}) };
};
