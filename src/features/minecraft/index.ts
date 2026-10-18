import type { Server } from 'node:http';
import type { Express } from 'express';
import type { Client } from 'discord.js';
import { MINECRAFT_BRIDGE } from '../../config/constants';
import { env } from '../../config/env';
import { listEnabledMembers } from '../../services/users';
import { createAnnouncer } from './announcer';
import { channelMapOf } from './channels';
import { watchForCrashes } from './crashWatch';
import { MemberDirectory } from './directory';
import { hookChannelsOf, memberFetcherOf, notifierOf, surroundingsOf, topicChannelOf } from './discord';
import { createInbound } from './inbound';
import { MESSAGES_FILE, loadMessageConfig } from './messageConfig';
import { createLinkMedia, fetchPreviewPage, type RefreshAddresses } from './linkMedia';
import { createOutbound } from './outbound';
import { RateLimiter } from './rateLimit';
import { grantJoinedRole } from './roles';
import { BRIDGE_PATH, BridgeServer } from './server';
import { FEATURE_MEDIA_UPLOAD, BOT_FEATURES } from './protocol';
import { startSync, syncTopic, type SyncDeps } from './sync';
import { MediaUploads } from './upload';
import { UPLOAD_PATH, mountUploadRoutes } from './uploadRoutes';
import { WebhookPoster } from './webhook';

/** The Discord channels joined to the chat channels of the Minecraft server. */
export const channels = channelMapOf({ global: env.MC_CHANNEL_GLOBAL, staff: env.MC_CHANNEL_STAFF });

/** The line to the Minecraft server; null when the bridge is off because there is no key. */
export const bridge: BridgeServer | null = env.BRIDGE_KEY
  ? new BridgeServer({ key: env.BRIDGE_KEY, channels: () => channels.chatChannels(), features: () => [...BOT_FEATURES, FEATURE_MEDIA_UPLOAD] })
  : null;

/** What the bot says for the Minecraft server, from `config/minecraft-messages.yml`. */
export const messages = loadMessageConfig(MESSAGES_FILE, console);

/** The linked members and their Minecraft names. */
export const directory = new MemberDirectory({ fetchAll: listEnabledMembers });

/** What members write is heard at most five times in ten seconds each. */
const limiter = new RateLimiter(5, 10_000);

/** Asks Discord for fresh attachment addresses. The client only exists once Discord is ready, so this waits for it. */
let discordRest: Client<true>['rest'] | null = null;
const refreshAddresses: RefreshAddresses = async addresses => {
  if (!discordRest) return {};
  const answer = (await discordRest.post('/attachments/refresh-urls', { body: { attachment_urls: addresses } })) as {
    refreshed_urls?: { original: string; refreshed: string }[];
  };
  return Object.fromEntries((answer.refreshed_urls ?? []).map(entry => [entry.original, entry.refreshed]));
};

/** Handles the messages of members in the bridged channels; nothing when the bridge is off. */
export const bridgeMessageHandler = bridge ? createOutbound({ link: bridge, channels, directory, links: createLinkMedia({ fetchPage: fetchPreviewPage, refresh: refreshAddresses }), limiter, logger: console }) : null;

/** Starts listening for the Minecraft server on the bot's HTTP server, and what goes with it once Discord is ready. */
export const startBridge = (http: Server, app: Express, client: Client<true>) => {
  if (!bridge) {
    console.log('[Bridge] BRIDGE_KEY is not set, so the Minecraft bridge is off.');
    return;
  }
  bridge.attach(http);
  discordRest = client.rest;
  console.log(`[Bridge] Waiting for the Minecraft server on ${BRIDGE_PATH}.`);

  const webhooks = new WebhookPoster(hookChannelsOf(client), MINECRAFT_BRIDGE.webhookName);
  mountUploadRoutes(
    app,
    new MediaUploads({
      channels,
      avatars: { premium: env.MC_AVATAR_PREMIUM, cracked: env.MC_AVATAR_CRACKED, skin: env.MC_AVATAR_SKIN },
      targets: {
        postAsPlayer: (channelId, post, file) => webhooks.postFile(channelId, post, file),
        deleteFromChannel: (channelId, messageId) => webhooks.deleteMessage(channelId, messageId),
      },
      // Each player gets 3 images a minute and everyone together 20
      perPlayer: new RateLimiter(3, 60_000),
      overall: new RateLimiter(20, 60_000),
      logger: console,
    }),
    header => bridge.authorized(header),
  );
  console.log(`[Bridge] Screenshots of the game are taken on ${UPLOAD_PATH}.`);

  const members = memberFetcherOf(client);
  const avatars = { premium: env.MC_AVATAR_PREMIUM, cracked: env.MC_AVATAR_CRACKED, skin: env.MC_AVATAR_SKIN };
  const surroundings = surroundingsOf(client, bridge);
  const announce = createAnnouncer({
    channels,
    config: messages,
    avatars,
    surroundings,
    notify: notifierOf(client),
  });
  bridge.onFrame(
    createInbound({
      channels,
      webhooks,
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

  const sync: SyncDeps = {
    link: bridge,
    topicChannel: topicChannelOf(client, channels.main),
    directory,
    fetchMember: members.nickname,
    topic: messages.topic,
    emoji: name => surroundings().emoji(name),
    dryRun: env.MC_SYNC_DRY_RUN,
    logger: console,
  };

  // The topic follows the server as it starts, stops or crashes, not only every few minutes
  watchForCrashes({
    link: bridge,
    graceSeconds: messages.crashAfterSeconds,
    onStarted: () => syncTopic(sync),
    onStopping: () => syncTopic(sync, { down: true }),
    onCrash: async () => {
      await Promise.all([announce('crashed'), syncTopic(sync, { down: true })]);
    },
    logger: console,
  });

  startSync(sync, env.MC_SYNC_MINUTES);
  if (env.MC_SYNC_DRY_RUN) {
    console.log('[Minecraft] DRY RUN: the join role, the nicknames and the topic are only logged, not changed. Set MC_SYNC_DRY_RUN=false to apply them.');
  }
  if (env.MC_TOPIC_TEMPLATE_IGNORED) {
    console.log('[Minecraft] MC_TOPIC_TEMPLATE is no longer read: the topic is in config/minecraft-messages.yml.');
  }
  if (!env.MC_JOINED_ROLE_ID) console.log('[Minecraft] MC_JOINED_ROLE_ID is not set, so nobody gets the joined role.');
  if (!channels.main) console.log('[Minecraft] MC_CHANNEL_GLOBAL is not set, so no event or chat is posted to Discord.');
};
