import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, COLORS, EMOJIS, MODERATION } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { warningLine } from '../../features/moderation/messages';
import { listWarnings } from '../../services/moderation';

const SHOWN = 15;

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('warns')
    .setDescription('Muestra las advertencias de un miembro.')
    .addUserOption(option => option.setName('usuario').setDescription('El miembro a consultar.').setRequired(true)),
  meta: {
    category: CATEGORIES.moderation,
    description: 'Muestra las advertencias de un miembro: las activas con el número que usa `unwarn`, y las quitadas tachadas.',
    access: 'staff',
  },
  async run(ctx) {
    const user = ctx.options.getUser('usuario', true);

    await ctx.defer({ ephemeral: true });
    const { warnings } = await listWarnings(user.id);
    const active = warnings.filter(warning => warning.revoked_at === null).length;

    let number = 0;
    const lines = warnings.slice(0, SHOWN).map(warning => warningLine(warning, warning.revoked_at === null ? ++number : null));
    const hidden = warnings.length - SHOWN;

    const embed = new EmbedBuilder()
      .setColor(COLORS.blurple)
      .setAuthor({ name: `Advertencias de ${user.username}`, iconURL: user.displayAvatarURL() })
      .setDescription(
        lines.length > 0
          ? `${lines.join('\n')}${hidden > 0 ? `\n… y ${hidden} más antiguas.` : ''}`
          : 'Esta persona no tiene advertencias.',
      )
      .setFooter({ text: `Activas: ${active}/${MODERATION.warnKickAt}` });

    await ctx.reply({ content: `${EMOJIS.stats} <@${user.id}>`, embeds: [embed], allowedMentions: { parse: [] }, ephemeral: true });
  },
});
