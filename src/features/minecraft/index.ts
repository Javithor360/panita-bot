import type { Server } from 'node:http';
import type { Client } from 'discord.js';
import { MINECRAFT_BRIDGE } from '../../config/constants';
import { env } from '../../config/env';
import { listEnabledMembers } from '../../services/users';
import { createAnnouncer } from './announcer';
import { channelMapOf } from './channels';
import { MemberDirectory } from './directory';
import { hookChannelsOf, memberFetcherOf, notifierOf, surroundingsOf, topicChannelOf } from './discord';
import { createInbound } from './inbound';
import { MESSAGES_FILE, loadMessageConfig } from './messageConfig';
import { createOutbound } from './outbound';
import { RateLimiter } from './rateLimit';
import { grantJoinedRole } from './roles';
import { BRIDGE_PATH, BridgeServer } from './server';
import { startSync } from './sync';
import { WebhookPoster } from './webhook';

/** The Discord channels joined to the chat channels of the Minecraft server. */
export const channels = channelMapOf({ global: env.MC_CHANNEL_GLOBAL, staff: env.MC_CHANNEL_STAFF });

/** The line to the Minecraft server; null when the bridge is off because there is no key. */
export const bridge: BridgeServer | null = env.BRIDGE_KEY
  ? new BridgeServer({ key: env.BRIDGE_KEY, channels: () => channels.chatChannels() })
  : null;

/** What the bot says for the Minecraft server, from `config/minecraft-messages.yml`. */
export const messages = loadMessageConfig(MESSAGES_FILE, console);

/** The linked members and their Minecraft names. */
export const directory = new MemberDirectory({ fetchAll: listEnabledMembers });

/** What members write is heard at most five times in ten seconds each. */
const limiter = new RateLimiter(5, 10_000);

/** Handles the messages of members in the bridged channels; nothing when the bridge is off. */
export const bridgeMessageHandler = bridge ? createOutbound({ link: bridge, channels, directory, limiter, logger: console }) : null;

/** Starts listening for the Minecraft server on the bot's HTTP server, and what goes with it once Discord is ready. */
export const startBridge = (http: Server, client: Client<true>) => {
  if (!bridge) {
    console.log('[Bridge] BRIDGE_KEY is not set, so the Minecraft bridge is off.');
    return;
  }
  bridge.attach(http);
  console.log(`[Bridge] Waiting for the Minecraft server on ${BRIDGE_PATH}.`);

  const members = memberFetcherOf(client);
  const avatars = { premium: env.MC_AVATAR_PREMIUM, cracked: env.MC_AVATAR_CRACKED };
  const announce = createAnnouncer({
    channels,
    config: messages,
    avatars,
    surroundings: surroundingsOf(client, bridge),
    notify: notifierOf(client),
  });
  bridge.onFrame(
    createInbound({
      channels,
      webhooks: new WebhookPoster(hookChannelsOf(client), MINECRAFT_BRIDGE.webhookName),
      messages,
      announce,
      avatars,
      onJoin: player =>
        grantJoinedRole(
          {
            roleId: env.MC_JOINED_ROLE_ID,
            directory,
            fetchMember: members.role,
            dryRun: env.MC_SYNC_DRY_RUN,
            logger: console,
          },
          player,
        ),
      logger: console,
    }),
  );

  startSync(
    {
      link: bridge,
      topicChannel: topicChannelOf(client, channels.main),
      directory,
      fetchMember: members.nickname,
      topicTemplate: env.MC_TOPIC_TEMPLATE,
      dryRun: env.MC_SYNC_DRY_RUN,
      logger: console,
    },
    env.MC_SYNC_MINUTES,
  );
  if (env.MC_SYNC_DRY_RUN) {
    console.log('[Minecraft] DRY RUN: the join role, the nicknames and the topic are only logged, not changed. Set MC_SYNC_DRY_RUN=false to apply them.');
  }
  if (!env.MC_JOINED_ROLE_ID) console.log('[Minecraft] MC_JOINED_ROLE_ID is not set, so nobody gets the joined role.');
  if (!channels.main) console.log('[Minecraft] MC_CHANNEL_GLOBAL is not set, so no event or chat is posted to Discord.');
};
