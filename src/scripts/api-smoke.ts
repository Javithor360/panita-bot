import { env } from '../config/env';
import { api, isApiError } from '../lib/api';
import type { ListMeta, WhoAmI } from '../lib/api/types';

/**
 * Read-only check of the API from the bot's own environment: proves the key, the URL and the response
 * shapes the bot depends on. It never writes. Run it after every deploy: `npm run smoke:api`.
 */

/** Ids that cannot belong to a real user or guild, for calls that must answer "nothing". */
const UNKNOWN_SNOWFLAKE = '100000000000000000';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const checks: Array<{ name: string; run: () => Promise<string> }> = [
  {
    name: 'whoami',
    run: async () => {
      const { client } = await api.get<WhoAmI>('/v1/whoami');
      assert(client === 'bot', `the key belongs to "${client}", expected "bot"`);
      return 'client bot';
    },
  },
  {
    name: 'photos/random',
    run: async () => {
      try {
        const photo = await api.get<unknown>('/v1/photos/random');
        assert(isObject(photo) && typeof photo.id === 'string' && typeof photo.url === 'string', 'unexpected photo shape');
        assert(Array.isArray(photo.categories), 'the photo has no categories array');
        return 'a photo';
      } catch (error) {
        if (isApiError(error, 404)) return 'empty gallery';
        throw error;
      }
    },
  },
  {
    name: 'tags',
    run: async () => {
      const { data, meta } = await api.getEnvelope<unknown[], ListMeta>('/v1/tags');
      assert(Array.isArray(data) && data.every(tag => isObject(tag) && typeof tag.name === 'string'), 'unexpected tag shape');
      return `${meta.count} tags`;
    },
  },
  {
    name: 'ticket-panels',
    run: async () => {
      const guildId = env.GUILD_ID ?? UNKNOWN_SNOWFLAKE;
      const panels = await api.get<unknown[]>('/v1/ticket-panels', { query: { guild_id: guildId } });
      assert(Array.isArray(panels) && panels.every(panel => isObject(panel) && typeof panel.id === 'string'), 'unexpected panel shape');
      return `${panels.length} panels${env.GUILD_ID ? '' : ' (GUILD_ID not set, asked for an unknown guild)'}`;
    },
  },
  {
    name: 'tickets/open',
    run: async () => {
      const ticket = await api.get<unknown>('/v1/tickets/open', {
        query: { creator_id: UNKNOWN_SNOWFLAKE, guild_id: env.GUILD_ID ?? UNKNOWN_SNOWFLAKE },
      });
      assert(ticket === null, 'expected no open ticket for an unknown user');
      return 'none, as expected';
    },
  },
  {
    name: 'discord/sync-events',
    run: async () => {
      const { data, meta } = await api.getEnvelope<unknown[], ListMeta & { cursor: number }>('/v1/discord/sync-events', {
        query: { after: 'latest' },
      });
      assert(Array.isArray(data) && data.length === 0, 'after=latest should return no events');
      assert(Number.isInteger(meta.cursor), 'the response has no cursor');
      return `cursor ${meta.cursor}`;
    },
  },
];

const main = async () => {
  let failed = 0;
  for (const { name, run } of checks) {
    try {
      console.log(`✓ ${name}: ${await run()}`);
    } catch (error) {
      failed++;
      console.error(`✗ ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(failed === 0 ? `All ${checks.length} checks passed.` : `${failed} of ${checks.length} checks failed.`);
  process.exit(failed === 0 ? 0 : 1);
};

void main();
