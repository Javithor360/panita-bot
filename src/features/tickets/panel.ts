import type { Client, GuildTextBasedChannel } from 'discord.js';
import { buildPanelMessage } from './embeds';

/** Deletes a panel's message if it still exists (ignores missing channels/messages). */
export const deletePanelMessage = async (client: Client, panel: { channel_id: string; message_id: string }) => {
  const channel = await client.channels.fetch(panel.channel_id).catch(() => null);
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(panel.message_id).catch(() => null);
  await message?.delete().catch(() => {});
};

export const sendPanel = (channel: GuildTextBasedChannel, panel: { id: string; title: string; description: string | null }) =>
  channel.send(buildPanelMessage(panel));
