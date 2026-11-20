import { ActionRowBuilder, StringSelectMenuBuilder, type BaseMessageOptions } from 'discord.js';
import { ask, type Who } from '../../lib/voice';
import { clip } from '../moderation/messages';
import type { LookupMember } from './rank';

const LABEL_MAX = 100;
const DESCRIPTION_MAX = 100;

/**
 * Noa asked "pick a number" when several people matched a name. Here it is a menu: who asked sees the matches (up to
 * 25) and chooses one. `customId` carries what the command needs to finish (such as its flags), so nothing is stored.
 */
export const pickMenu = (who: Who, query: string, candidates: readonly LookupMember[], customId: string): BaseMessageOptions => {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Elige a quién te refieres')
    .addOptions(
      candidates.slice(0, 25).map(member => ({
        label: clip(member.displayName, LABEL_MAX),
        description: clip(`@${member.username} · ${member.id}`, DESCRIPTION_MAX),
        value: member.id,
      })),
    );

  const shown = clip(query.replace(/`/g, ''), 40);
  return {
    content: ask(who, `encontré varias personas con \`${shown}\`, elige a quién te refieres:`),
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    allowedMentions: { parse: [] },
  };
};
