import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { enchantmentLevels, potionLevels, type MaxLevelEntry } from '../../data/enchantments';
import { tezzlarAuthor } from '../../lib/embeds';

export const renderLevels = (entries: MaxLevelEntry[]) =>
  entries.map(e => `**◈ ${e.name}:** ${e.maxLevel}`).join('\n');

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('enchantments')
    .setDescription('Muestra los nuevos niveles máximos de encantamiento en Tezzlar III.'),
  meta: {
    category: CATEGORIES.minecraft,
    description: 'Muestra la lista de encantamientos y sus nuevos niveles máximos permitidos en Tezzlar.',
    aliases: ['enchantment', 'encantamientos', 'enchants'],
  },
  async run(ctx) {
    const embed = new EmbedBuilder()
      .setAuthor(tezzlarAuthor('Sistema de Magia y Pociones'))
      .setTitle('Libro de Niveles Máximos')
      .setDescription(
        '>>> En Tezzlar III, la magia ha sido rebalanceada. Aquí tienes la lista completa de encantamientos y efectos de poción con sus **nuevos niveles máximos** alcanzables:' +
        `\n\n**ENCANTAMIENTOS ✨**\n${renderLevels(enchantmentLevels)}` +
        `\n\n**EFECTOS DE POCIÓN 🧪**\n${renderLevels(potionLevels)}`,
      )
      .setColor(0x9b59b6)
      .setFooter({ text: 'Nota: Algunos ítems pueden aparecer con efectos de pociones pasivos al encantarse.' });

    await ctx.reply({ embeds: [embed] });
  },
});
