import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { enchantmentLevels, potionLevels, type MaxLevelEntry } from '../../data/enchantments';

export const data = new SlashCommandBuilder()
  .setName('enchantments')
  .setDescription('Muestra los nuevos niveles máximos de encantamiento en Tezzlar III.');

export const metadata = {
  aliases: ['enchantment', 'encantamientos', 'enchants'],
  category: 'Minecraft',
  description: 'Muestra la lista de encantamientos y sus nuevos niveles máximos permitidos en Tezzlar.',
  usage: 'enchantments',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const renderLevels = (entries: MaxLevelEntry[]) =>
  entries.map(e => `**◈ ${e.name}:** ${e.maxLevel}`).join('\n');

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const embed = new EmbedBuilder()
    .setAuthor({
      name: 'Sistema de Magia y Pociones',
      iconURL: 'https://media.discordapp.net/attachments/1032440236564824105/1513754769322414080/Picel.gif?ex=6a43e83d&is=6a4296bd&hm=2400706674437e00e7d3c1568db74b36023a1d2f0848416115937b2bf6a84f16&='
    })
    .setTitle('Libro de Niveles Máximos')
    .setDescription('>>> En Tezzlar III, la magia ha sido rebalanceada. Aquí tienes la lista completa de encantamientos y efectos de poción con sus **nuevos niveles máximos** alcanzables:\n\n**ENCANTAMIENTOS ✨**\n' + renderLevels(enchantmentLevels) + '\n\n**EFECTOS DE POCIÓN 🧪**\n' + renderLevels(potionLevels))
    .setColor(0x9b59b6) // Purple color for magic/enchantments
    .setFooter({ text: 'Nota: Algunos ítems pueden aparecer con efectos de pociones pasivos al encantarse.' });

  await interaction.reply({ embeds: [embed] });
};
