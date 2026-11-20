import type { Client, EmbedBuilder } from 'discord.js';
import { env } from '../../config/env';

/** What can be sent to the log channel: embeds only, and never a mention. */
export interface ModlogEntry {
  embeds: EmbedBuilder[];
}

export interface ModlogDeps {
  channelId: string | undefined;
  /** The channel to write in, or `null` when it does not exist or cannot be written to. */
  fetchChannel(id: string): Promise<{ send(payload: ModlogEntry & { allowedMentions: { parse: [] } }): Promise<unknown> } | null>;
  logger?: Pick<Console, 'log' | 'error'>;
}

export interface Modlog {
  /** Whether a log channel is configured. */
  readonly enabled: boolean;
  /** Writes an entry. It never throws: a failure is logged once until the next success. */
  post(entry: ModlogEntry): Promise<void>;
}

export const createModlog = ({ channelId, fetchChannel, logger = console }: ModlogDeps): Modlog => {
  let failing = false;
  let warnedAboutMissingChannel = false;

  return {
    enabled: channelId !== undefined,
    async post(entry) {
      if (!channelId) {
        if (!warnedAboutMissingChannel) {
          warnedAboutMissingChannel = true;
          logger.log('[Modlog] MODLOG_CHANNEL_ID is not set; the audit log is off.');
        }
        return;
      }
      try {
        const channel = await fetchChannel(channelId);
        if (!channel) throw new Error('the channel does not exist or cannot be written to');
        await channel.send({ ...entry, allowedMentions: { parse: [] } });
        failing = false;
      } catch (error) {
        if (!failing) logger.error('[Modlog] Could not write in the log channel:', error);
        failing = true;
      }
    },
  };
};

const forClient = new WeakMap<Client, Modlog>();

/** The log of the running bot. */
export const modlogOf = (client: Client): Modlog => {
  let modlog = forClient.get(client);
  if (!modlog) {
    modlog = createModlog({
      channelId: env.MODLOG_CHANNEL_ID,
      fetchChannel: async id => {
        const channel = await client.channels.fetch(id);
        return channel?.isSendable() ? channel : null;
      },
    });
    forClient.set(client, modlog);
  }
  return modlog;
};

/** Whether a message belongs to the log channel itself, which the audit log must not report (it would feed on itself). */
export const isModlogChannel = (channelId: string): boolean => channelId === env.MODLOG_CHANNEL_ID;
