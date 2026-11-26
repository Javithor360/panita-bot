import { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import type { CommandContext } from '../../core/context';
import { UserError } from '../../core/errors';
import { features, featuresIntro, type Feature } from '../../data/enriquecraft';
import { author, COLOR, command, ICONS, imageOf, quote, type View } from './look';

/** What the menu sends to go back to the list. */
export const LIST = 'list';

/** `➔ Title` and its line under it, as the catalogs of Tezzlar are listed. */
const listing = (items: readonly Feature[]) => items.map(item => `**➔ ${item.title}**\n⠀\\- ${item.summary}`).join('\n\n');

/**
 * The menu under the list and under every feature: it opens any of them in place, with no retyping. The one that is on
 * screen is marked, and the first option goes back to the list. `customId` is the one the router sends to `components.feature`.
 */
export const menu = (customId: string, current?: Feature): ActionRowBuilder<StringSelectMenuBuilder> =>
  new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Elige una característica')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setValue(LIST)
          .setLabel('Lista de características')
          .setDescription('Vuelve al resumen de todas.')
          .setEmoji(ICONS.features)
          .setDefault(!current),
        ...features.map(feature =>
          new StringSelectMenuOptionBuilder()
            .setValue(feature.id)
            .setLabel(feature.label)
            .setDescription(feature.summary)
            .setDefault(feature === current),
        ),
      ),
  );

/** The list of features, one line each. Without a `customId` there is no menu. */
export const overview = (customId?: string): View => ({
  embeds: [
    new EmbedBuilder()
      .setColor(COLOR)
      .setAuthor(author('Características'))
      .setTitle(`${ICONS.features} CARACTERÍSTICAS`)
      .setDescription(`*Features propias del SMP*\n\n${featuresIntro}`)
      .addFields({ name: 'LO QUE OFRECE EL SERVIDOR 🧩', value: quote(listing(features)) })
      .setFooter({ text: 'Elige una en el menú de abajo, o usa !enriquecraft features <característica>.' }),
  ],
  ...(customId ? { components: [menu(customId)] } : {}),
});

/** One feature in full, with its picture when it has one. Without a `customId` there is no menu. */
export const single = (feature: Feature, customId?: string): View => {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor(author('Características'))
    .setTitle(`${ICONS.bullet} ${feature.title}`)
    .setDescription(feature.text);
  return {
    embeds: [feature.image ? embed.setImage(`attachment://${feature.image}`) : embed],
    ...(feature.image ? { files: [imageOf(feature.image)] } : {}),
    ...(customId ? { components: [menu(customId, feature)] } : {}),
  };
};

/** What the menu picked: the list, or a feature. */
export const answer = (id: string, customId: string): View => {
  if (id === LIST) return overview(customId);
  const feature = features.find(candidate => candidate.id === id);
  if (!feature) throw new UserError('esa característica ya no existe.');
  return single(feature, customId);
};

export const run = async (ctx: CommandContext): Promise<void> => {
  const customId = ctx.customId('feature', [], { owned: true });
  const id = ctx.options.getString('caracteristica');
  if (!id) return ctx.reply(overview(customId));

  const feature = features.find(candidate => candidate.id === id);
  if (!feature) throw new UserError(`no existe esa característica. Usa ${command('features')} para verlas todas.`);
  await ctx.reply(single(feature, customId));
};
