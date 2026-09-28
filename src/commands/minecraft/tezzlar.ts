import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { ASSETS, CATEGORIES, EMOJIS, URLS } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { tezzlarDays } from '../../data/tezzlar';
import { tezzlarAuthor } from '../../lib/embeds';
import { discordTimestamp } from '../../lib/format';
import { isDeveloper } from '../../lib/discord';

const TOTAL_DAYS = 32;

/** Day N unlocks on July N 2026 at 14:00 UTC-6 (20:00 UTC). */
const unlockTimeOf = (day: number) => Date.UTC(2026, 6, day, 20, 0, 0, 0);

/** 1-10 light blue, 11-21 pastel yellow, 22-31 red, final day gold. */
const colorOf = (day: number) => {
  if (day === TOTAL_DAYS) return 0xffd700;
  if (day >= 22) return 0xe74c3c;
  if (day >= 11) return 0xfdfd96;
  return 0xadd8e6;
};

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('tezzlar')
    .setDescription('Comandos de Tezzlar')
    .addSubcommand(subcommand =>
      subcommand
        .setName('day')
        .setDescription('Muestra la información de un día específico de Tezzlar III.')
        .addIntegerOption(option =>
          option.setName('numero')
            .setDescription(`Número de día (1-${TOTAL_DAYS})`)
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(TOTAL_DAYS),
        )
        .addBooleanOption(option =>
          option.setName('force')
            .setDescription('Forzar bypass de fecha (Solo Dev)')
            .setRequired(false),
        ),
    ),
  meta: {
    category: CATEGORIES.minecraft,
    description: 'Proporciona información diaria sobre el evento Tezzlar III.',
    aliases: ['tez', 'tz'],
  },
  prefix: { defaultSubcommand: 'day' },
  async run(ctx) {
    const day = ctx.options.getInteger('numero', true);
    const bypass = !!ctx.options.getBoolean('force') && isDeveloper(ctx.user.id);
    const unlockTime = unlockTimeOf(day);

    if (Date.now() < unlockTime && !bypass) {
      return ctx.reply({
        content: `${EMOJIS.noAutorizo} ¡Alto ahí, viajero del tiempo! La información del **Día ${day}** se desbloqueará ${discordTimestamp(unlockTime, 'R')}.`,
        ephemeral: true,
      });
    }

    const dayData = tezzlarDays[day];
    const fields = dayData?.fields ?? [];
    if (fields.length === 0 && !dayData?.image) {
      return ctx.reply({ content: `Aún no hay información configurada para el **Día ${day}**.`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setAuthor(tezzlarAuthor(`Tezzlar III ~ Día ${day}`, URLS.tezzlar3))
      .setTitle('Menú del Día en Tezzlar')
      .setDescription(`Para el día número **${day}**, los supervivientes tienen que afrontar nuevas adversidades y peligros letales que pondrán a prueba su instinto en este mundo implacable.`)
      .setThumbnail(ASSETS.tezzlarHearts)
      .setColor(colorOf(day))
      .addFields(fields);

    if (dayData?.image) embed.setImage(dayData.image);

    await ctx.reply({ embeds: [embed] });
  },
});
