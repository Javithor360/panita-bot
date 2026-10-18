import { AttachmentBuilder, TextChannel, type Client, type Guild, type Webhook } from 'discord.js';
import { env } from '../../config/env';
import type { BridgeLink } from './link';
import type { Rendered, Surroundings } from './render';
import type { RoleMember } from './roles';
import type { NicknameMember, TopicChannel } from './sync';
import type { Hook, HookChannelResolver } from './webhook';

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

/** A webhook as the bridge uses it: to post, to post a file, and to take a message back. */
const hookOf = (hook: Webhook): Hook => ({
  name: hook.name,
  send: message => hook.send(message),
  sendFile: async (message, file) => {
    const posted = await hook.send({ ...message, files: [new AttachmentBuilder(file.data, { name: file.name })] });
    const url = posted.attachments.first()?.url;
    if (!url) throw new Error('Discord did not return the attachment');
    return { messageId: posted.id, url };
  },
  deleteMessage: async messageId => {
    await hook.deleteMessage(messageId);
  },
});

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
          .map(hook => hookOf(hook)),
      createHook: async name => {
        return hookOf(await channel.createWebhook({ name }));
      },
    };
  };

/** Posts a message as the bot. It may mention only the users the message names, which is nobody but the owner at a crash. */
export const notifierOf =
  (client: Client<true>) =>
  async (channelId: string, message: Rendered): Promise<void> => {
    const channel = await textChannel(client, channelId);
    await channel?.send({
      content: message.content,
      embeds: message.embeds,
      files: message.files.map(file => new AttachmentBuilder(file.data, { name: file.name })),
      allowedMentions: { parse: [], users: message.mentions },
    });
  };

/** What the messages need from Discord and from the icon of the server. */
export const surroundingsOf =
  (client: Client<true>, link: Pick<BridgeLink, 'serverIcon'>) =>
  (): Surroundings => {
    const guild = homeGuild(client);
    return {
      botName: client.user.displayName,
      botAvatar: client.user.displayAvatarURL(),
      ownerId: guild?.ownerId,
      serverIcon: link.serverIcon,
      emoji: name => guild?.emojis.cache.find(emoji => emoji.name === name)?.toString(),
    };
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
