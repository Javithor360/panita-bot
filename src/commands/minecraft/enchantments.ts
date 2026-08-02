import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';

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

export const execute = async (interaction: ChatInputCommandInteraction) => {
  // Enchantment list
  const enchantsList = `
**◈ Aqua Affinity:** 1
**◈ Bane Of Arthropods:** 7
**◈ Binding Curse:** 1
**◈ Blast Protection:** 5
**◈ Breach:** 4
**◈ Channeling:** 1
**◈ Density:** 7
**◈ Depth Strider:** 5
**◈ Efficiency:** 7
**◈ Feather Falling:** 8
**◈ Fire Aspect:** 4
**◈ Fire Protection:** 5
**◈ Flame:** 1
**◈ Fortune:** 8
**◈ Frost Walker:** 2
**◈ Impaling:** 10
**◈ Infinity:** 2
**◈ Knockback:** 5
**◈ Looting:** 6
**◈ Loyalty:** 3
**◈ Luck Of The Sea:** 8
**◈ Lunge:** 5
**◈ Lure:** 3
**◈ Mending:** 2
**◈ Multishot:** 1
**◈ Piercing:** 6
**◈ Power:** 12
**◈ Projectile Protection:** 5
**◈ Protection:** 5
**◈ Punch:** 5
**◈ Quick Charge:** 5
**◈ Respiration:** 10
**◈ Riptide:** 4
**◈ Sharpness:** 10
**◈ Silk Touch:** 2
**◈ Sweeping Edge:** 5
**◈ Swift Sneak:** 5
**◈ Smite:** 7
**◈ Soul Speed:** 5
**◈ Thorns:** 10
**◈ Unbreaking:** 5
**◈ Vanishing Curse:** 1
**◈ Wind Burst:** 5
  `.trim();

  const potionsList = `
**◈ Absorption:** 1
**◈ Bad Omen:** 1
**◈ Blindness:** 1
**◈ Conduit Power:** 1
**◈ Confusion:** 1
**◈ Damage Resistance:** 1
**◈ Darkness:** 1
**◈ Dolphins Grace:** 1
**◈ Fast Digging:** 2
**◈ Fire Resistance:** 1
**◈ Glowing:** 1
**◈ Health Boost:** 1
**◈ Hero Of The Village:** 2
**◈ Hunger:** 5
**◈ Infested:** 1
**◈ Harm:** 1
**◈ Heal:** 1
**◈ Increase Damage:** 2
**◈ Invisibility:** 1
**◈ Jump:** 2
**◈ Levitation:** 2
**◈ Luck:** 5
**◈ Night Vision:** 1
**◈ Oozing:** 1
**◈ Poison:** 5
**◈ Raid Omen:** 1
**◈ Regeneration:** 1
**◈ Saturation:** 1
**◈ Slow Digging:** 5
**◈ Slow Falling:** 1
**◈ Slow:** 5
**◈ Speed:** 2
**◈ Trial Omen:** 1
**◈ Unluck:** 5
**◈ Water Breathing:** 1
**◈ Weakness:** 5
**◈ Weaving:** 1
**◈ Wind Charged:** 1
**◈ Wither:** 5
  `.trim();

  const embed = new EmbedBuilder()
    .setAuthor({
      name: 'Sistema de Magia y Pociones',
      iconURL: 'https://media.discordapp.net/attachments/1032440236564824105/1513754769322414080/Picel.gif?ex=6a43e83d&is=6a4296bd&hm=2400706674437e00e7d3c1568db74b36023a1d2f0848416115937b2bf6a84f16&='
    })
    .setTitle('Libro de Niveles Máximos')
    .setDescription('>>> En Tezzlar III, la magia ha sido rebalanceada. Aquí tienes la lista completa de encantamientos y efectos de poción con sus **nuevos niveles máximos** alcanzables:\n\n**ENCANTAMIENTOS ✨**\n' + enchantsList + '\n\n**EFECTOS DE POCIÓN 🧪**\n' + potionsList)
    .setColor(0x9b59b6) // Purple color for magic/enchantments
    .setFooter({ text: 'Nota: Algunos ítems pueden aparecer con efectos de pociones pasivos al encantarse.' });

  await interaction.reply({ embeds: [embed] });
};
