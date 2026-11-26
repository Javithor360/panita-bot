import { EmbedBuilder } from 'discord.js';
import type { CommandContext } from '../../core/context';
import { info } from '../../data/enriquecraft';
import { arrow, author, COLOR, command, ICONS, quote, type View } from './look';

export const view = (): View => ({
  embeds: [
    new EmbedBuilder()
      .setColor(COLOR)
      .setAuthor(author('Información'))
      .setTitle(`${ICONS.info} INFORMACIÓN GENERAL DE ENRIQUECRAFT`)
      .setDescription(`*Objetivo del servidor*\n\n${info.about}`)
      .addFields(
        { name: 'PROPÓSITO 🎯', value: quote(info.goal) },
        { name: 'TECNOLOGÍAS 🛠️', value: quote(info.technology) },
        {
          name: 'MÁS INFORMACIÓN 📌',
          value: quote(
            [
              arrow(command('rules'), 'El reglamento que se debe cumplir.'),
              arrow(command('pranks'), 'El sistema de pranks y sus niveles.'),
              arrow(command('features'), 'Lo que ofrece el servidor: cuenta, launcher, mod, chat y más.'),
              arrow(command('join'), 'La IP, la versión y cómo entrar.'),
            ].join('\n\n'),
          ),
        },
      ),
  ],
});

export const run = async (ctx: CommandContext): Promise<void> => {
  await ctx.reply(view());
};
