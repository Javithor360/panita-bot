import { EmbedBuilder } from 'discord.js';
import type { CommandContext } from '../../core/context';
import { rules, rulesIntro, type Rule } from '../../data/enriquecraft';
import { UserError } from '../../core/errors';
import { author, COLOR, command, ICONS, quote, type View } from './look';

/** Every rule, one field each. */
export const overview = (): View => ({
  embeds: [
    new EmbedBuilder()
      .setColor(COLOR)
      .setAuthor(author('Reglamento'))
      .setTitle(`${ICONS.rules} REGLAMENTO`)
      .setDescription(`*Normativas del servidor de obligatoria lectura*\n\n${rulesIntro}`)
      .addFields(rules.map(rule => ({ name: `${ICONS.bullet} ${rule.title.toUpperCase()}`, value: quote(rule.text) })))
      .setFooter({ text: 'Usa !enriquecraft rules <regla> para ver una sola.' }),
  ],
});

/** One rule on its own. */
export const single = (rule: Rule): View => ({
  embeds: [
    new EmbedBuilder()
      .setColor(COLOR)
      .setAuthor(author('Reglamento'))
      .setTitle(`${ICONS.rules} ${rule.title}`)
      .setDescription(rule.text)
      .setFooter({ text: `Regla ${rules.indexOf(rule) + 1} de ${rules.length}` }),
  ],
});

export const run = async (ctx: CommandContext): Promise<void> => {
  const id = ctx.options.getString('regla');
  if (!id) return ctx.reply(overview());

  const rule = rules.find(candidate => candidate.id === id);
  if (!rule) throw new UserError(`no existe esa regla. Usa ${command('rules')} para verlas todas.`);
  await ctx.reply(single(rule));
};
