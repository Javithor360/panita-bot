import { EmbedBuilder } from 'discord.js';
import type { CommandContext } from '../../core/context';
import { UserError } from '../../core/errors';
import { features, featuresIntro, type Feature } from '../../data/enriquecraft';
import { author, COLOR, command, ICONS, imageOf, quote, type View } from './look';

/** `➔ Title` and its line under it, as the catalogs of Tezzlar are listed. */
const listing = (items: readonly Feature[]) => items.map(item => `**➔ ${item.title}**\n⠀\\- ${item.summary}`).join('\n\n');

/** The list of features, one line each. */
export const overview = (): View => ({
  embeds: [
    new EmbedBuilder()
      .setColor(COLOR)
      .setAuthor(author('Características'))
      .setTitle(`${ICONS.features} CARACTERÍSTICAS`)
      .setDescription(`*Features propias del SMP*\n\n${featuresIntro}`)
      .addFields({ name: 'LO QUE OFRECE EL SERVIDOR 🧩', value: quote(listing(features)) })
      .setFooter({ text: 'Usa !enriquecraft features <característica> para ver una completa.' }),
  ],
});

/** One feature in full, with its picture when it has one. */
export const single = (feature: Feature): View => {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor(author('Características'))
    .setTitle(`${ICONS.bullet} ${feature.title}`)
    .setDescription(feature.text);
  if (!feature.image) return { embeds: [embed] };
  return { embeds: [embed.setImage(`attachment://${feature.image}`)], files: [imageOf(feature.image)] };
};

export const run = async (ctx: CommandContext): Promise<void> => {
  const id = ctx.options.getString('caracteristica');
  if (!id) return ctx.reply(overview());

  const feature = features.find(candidate => candidate.id === id);
  if (!feature) throw new UserError(`no existe esa característica. Usa ${command('features')} para verlas todas.`);
  await ctx.reply(single(feature));
};
