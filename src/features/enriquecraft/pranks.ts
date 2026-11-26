import { EmbedBuilder } from 'discord.js';
import type { CommandContext } from '../../core/context';
import { UserError } from '../../core/errors';
import { prankClarifications, prankLevels, pranksIntro, pranksPrinciple, pranksStart, type PrankClarification, type PrankLevel } from '../../data/enriquecraft';
import { arrow, author, COLOR, command, ICONS, quote, type View } from './look';

const NOTHING_ALLOWED = 'Ninguna broma.';

const levelText = (level: PrankLevel) => `${level.text}\n\n${arrow('Permitido', level.allowed ?? NOTHING_ALLOWED)}`;

/** The principle, the four levels and the clarifications. */
export const overview = (): View => ({
  embeds: [
    new EmbedBuilder()
      .setColor(COLOR)
      .setAuthor(author('Pranks'))
      .setTitle(`${ICONS.pranks} SISTEMA DE PRANKS`)
      .setDescription(`*Explicación y limitaciones*\n\n${pranksIntro}\n> **${pranksPrinciple}**\n\n${pranksStart}`)
      .addFields(
        ...prankLevels.map(level => ({ name: `${ICONS.level} ${level.title.toUpperCase()}`, value: quote(levelText(level)) })),
        ...prankClarifications.map(item => ({ name: `${ICONS.warning} ${item.title.toUpperCase()}`, value: quote(item.text) })),
      )
      .setFooter({ text: 'Usa !enriquecraft pranks <nivel> para ver uno solo.' }),
  ],
});

/** One level on its own. */
export const level = (item: PrankLevel): View => ({
  embeds: [
    new EmbedBuilder()
      .setColor(COLOR)
      .setAuthor(author('Pranks'))
      .setTitle(`${ICONS.pranks} ${item.title}`)
      .setDescription(item.text)
      .addFields({ name: 'PERMITIDO 🎯', value: quote(item.allowed ?? NOTHING_ALLOWED) })
      .setFooter({ text: 'Cambia tu nivel en el juego con /prank set <level>.' }),
  ],
});

/** One clarification on its own (the Extremo indicator has a choice of its own). */
export const clarification = (item: PrankClarification): View => ({
  embeds: [
    new EmbedBuilder()
      .setColor(COLOR)
      .setAuthor(author('Pranks'))
      .setTitle(`${ICONS.warning} ${item.title}`)
      .setDescription(item.text),
  ],
});

export const run = async (ctx: CommandContext): Promise<void> => {
  const id = ctx.options.getString('nivel');
  if (!id) return ctx.reply(overview());

  const found = prankLevels.find(candidate => candidate.id === id);
  if (found) return ctx.reply(level(found));
  const extra = prankClarifications.find(candidate => candidate.id === id);
  if (extra) return ctx.reply(clarification(extra));
  throw new UserError(`no existe ese nivel. Usa ${command('pranks')} para verlos todos.`);
};
