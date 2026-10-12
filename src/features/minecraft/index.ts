import type { Server } from 'node:http';
import { env } from '../../config/env';
import { channelMapOf } from './channels';
import { BRIDGE_PATH, BridgeServer } from './server';

/** The Discord channels joined to the chat channels of the Minecraft server. */
export const channels = channelMapOf({ global: env.MC_CHANNEL_GLOBAL, staff: env.MC_CHANNEL_STAFF });

/** The line to the Minecraft server; null when the bridge is off because there is no key. */
export const bridge: BridgeServer | null = env.BRIDGE_KEY
  ? new BridgeServer({ key: env.BRIDGE_KEY, channels: () => channels.chatChannels() })
  : null;

/** Starts listening for the Minecraft server on the bot's HTTP server. */
export const startBridge = (http: Server) => {
  if (!bridge) {
    console.log('[Bridge] BRIDGE_KEY is not set, so the Minecraft bridge is off.');
    return;
  }
  bridge.attach(http);
  console.log(`[Bridge] Waiting for the Minecraft server on ${BRIDGE_PATH}.`);
};
