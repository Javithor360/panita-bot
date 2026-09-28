import type { EmbedAuthorOptions } from 'discord.js';
import { ASSETS } from '../config/constants';

/** Embed author with the animated Tezzlar icon, shared by the Tezzlar information commands. */
export const tezzlarAuthor = (name: string, url?: string): EmbedAuthorOptions => ({
  name,
  iconURL: ASSETS.picel,
  ...(url ? { url } : {}),
});

/** `➔ Name / - ID: id` list used by catalog commands (`!recipes list`, `!minievent list`). */
export const renderCatalogList = (entries: Array<{ label: string; id: string }>) =>
  entries.map(e => `**➔ ${e.label}**\n⠀\\- \`ID:\` ${e.id}`).join('\n\n');
