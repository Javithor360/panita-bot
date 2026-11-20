import { ActionRowBuilder, EmbedBuilder, MessageFlags, SlashCommandBuilder, StringSelectMenuBuilder } from 'discord.js';
import { CATEGORIES, COLORS } from '../../config/constants';
import { defineCommand, select } from '../../core/command';
import { DEFAULT_SKIN_VIEW, isSkinView, isValidIgn, SKIN_VIEWS, skinRenderUrl, type SkinView } from '../../lib/minecraft';
import { fail, whoOf } from '../../lib/voice';

const buildSkinEmbed = (ign: string, view: SkinView) =>
  new EmbedBuilder()
    .setTitle(`Skin de ${ign}`)
    .setColor(COLORS.green)
    .setImage(skinRenderUrl(ign, view));

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('skin')
    .setDescription('Muestra la skin de un jugador de Minecraft.')
    .addStringOption(option =>
      option.setName('jugador')
        .setDescription('El nombre de usuario (IGN) del jugador de Minecraft')
        .setRequired(true),
    ),
  meta: {
    category: CATEGORIES.minecraft,
    description: 'Muestra la skin de un jugador de Minecraft en diferentes vistas interactivas.',
    aliases: ['skins'],
  },
  async run(ctx) {
    const ign = ctx.options.getString('jugador', true).trim();
    if (!isValidIgn(ign)) {
      return ctx.reply({ content: fail(ctx.member, 'ese no es un nombre de Minecraft válido (3-16 caracteres: letras, números y `_`).'), ephemeral: true });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(ctx.customId('view', [ign], { owned: true }))
      .setPlaceholder('Selecciona una vista diferente...')
      .addOptions(SKIN_VIEWS.map(view => ({ ...view })));

    await ctx.reply({
      embeds: [buildSkinEmbed(ign, DEFAULT_SKIN_VIEW)],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    });
  },
  components: {
    view: select({
      async run(interaction, [ign]) {
        const [view] = interaction.values;
        if (!isSkinView(view)) {
          return interaction.reply({ content: fail(whoOf(interaction), 'vista no válida.'), flags: MessageFlags.Ephemeral });
        }
        await interaction.update({ embeds: [buildSkinEmbed(ign, view)] });
      },
    }),
  },
});
