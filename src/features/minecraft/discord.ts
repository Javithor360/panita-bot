import { TextChannel, type Client, type EmbedBuilder, type Guild } from 'discord.js';
import { env } from '../../config/env';
import type { RoleMember } from './roles';
import type { NicknameMember, TopicChannel } from './sync';
import type { HookChannelResolver } from './webhook';

/**
 * The few places where the bridge touches discord.js objects. Everything else works with small interfaces, so it can be
 * tested without Discord.
 */

const textChannel = async (client: Client<true>, channelId: string): Promise<TextChannel | null> => {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  return channel instanceof TextChannel ? channel : null;
};

const homeGuild = (client: Client<true>): Guild | undefined =>
  env.GUILD_ID ? client.guilds.cache.get(env.GUILD_ID) : client.guilds.cache.first();

/** The webhooks of a channel: the bot's own, and a way to make one. */
export const hookChannelsOf =
  (client: Client<true>): HookChannelResolver =>
  async channelId => {
    const channel = await textChannel(client, channelId);
    if (!channel) return null;
    return {
      ownHooks: async () =>
        [...(await channel.fetchWebhooks()).values()]
          // Discord only gives the address of a webhook to the one that made it
          .filter(hook => hook.owner?.id === client.user.id && hook.token)
          .map(hook => ({ name: hook.name, send: message => hook.send(message) })),
      createHook: async name => {
        const hook = await channel.createWebhook({ name });
        return { name: hook.name, send: message => hook.send(message) };
      },
    };
  };

/** Posts an embed as the bot, mentioning nobody. */
export const notifierOf =
  (client: Client<true>) =>
  async (channelId: string, embed: EmbedBuilder): Promise<void> => {
    const channel = await textChannel(client, channelId);
    await channel?.send({ embeds: [embed], allowedMentions: { parse: [] } });
  };

/** The guild members the sync and the join role touch. */
export const memberFetcherOf = (client: Client<true>) => {
  const fetch = async (discordId: string) => homeGuild(client)?.members.fetch(discordId).catch(() => null) ?? null;
  return {
    role: async (discordId: string): Promise<RoleMember | null> => fetch(discordId),
    nickname: async (discordId: string): Promise<NicknameMember | null> => {
      const member = await fetch(discordId);
      return member
        ? { nickname: member.nickname, manageable: member.manageable, setNickname: nickname => member.setNickname(nickname) }
        : null;
    },
  };
};

/** The channel whose topic shows the server. */
export const topicChannelOf =
  (client: Client<true>, channelId: string | undefined) =>
  async (): Promise<TopicChannel | null> => {
    if (!channelId) return null;
    const channel = await textChannel(client, channelId);
    return channel ? { topic: channel.topic, setTopic: text => channel.setTopic(text) } : null;
  };
