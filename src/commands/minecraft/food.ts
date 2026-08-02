import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('food')
  .setDescription('Muestra la información del rebalanceo de comidas en Tezzlar III.');

export const metadata = {
  aliases: ['comida', 'foods', 'comidas'],
  category: 'Minecraft',
  description: 'Muestra los nuevos valores de nutrición y los efectos especiales de las comidas.',
  usage: 'food',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const vanillaFoods = `
**◈ Estofado de Conejo:** +12 🍗 | +25 Sat. *(Resistencia II x 1m)*
**◈ Sopa de Remolacha:** +12 🍗 | +16 Sat.
**◈ Pastel (Por porción):** +10 🍗 | +10 Sat.
**◈ Pastel de Calabaza:** +10 🍗 | +14.5 Sat. *(Resistencia al Fuego x 1m)*
**◈ Patata Asada:** +7 🍗 | +9 Sat.
**◈ Pan:** +7 🍗 | +12 Sat.
**◈ Galleta:** +7 🍗 | +9 Sat. *(Velocidad II x 1m)*
**◈ Bayas Brillantes:** +7 🍗 | +9 Sat. *(Glowing Verde x 1m)*
**◈ Bayas Dulces:** +7 🍗 | +9 Sat. *(Salud Instantánea I)*
**◈ Zanahoria:** +6 🍗 | +12 Sat.
**◈ Remolacha:** +5 🍗 | +7 Sat.
**◈ Algas Secas:** +4 🍗 | +4 Sat. *(Resistencia al Fuego x 30s)*
  `.trim();

  const customFoods = `
**◈ Remolacha Dorada:**
⠀\\- Restaura toda la barra (20 🍗 | 20 Sat.)
⠀\\- *Efectos:* Resistencia IV, Regeneración II, Velocidad II y Absorción IV (por 2m).

**◈ Manzana de Manzanium:**
⠀\\- Restaura toda la barra (20 🍗 | 20 Sat.)

**◈ Manzana de Cobre:**
⠀\\- Restaura toda la barra (20 🍗 | 20 Sat.)
⠀\\- *Efectos:* Vida Extra III (por 5m).

**◈ Zanahoria de Cobre:**
⠀\\- *Efectos:* Visión Nocturna (por 1m).
  `.trim();

  const embed = new EmbedBuilder()
    .setAuthor({
      name: 'Rebalanceo Gastronómico',
      iconURL: 'https://media.discordapp.net/attachments/1032440236564824105/1513754769322414080/Picel.gif?ex=6a43e83d&is=6a4296bd&hm=2400706674437e00e7d3c1568db74b36023a1d2f0848416115937b2bf6a84f16&='
    })
    .setTitle('Menú Nutricional de Tezzlar')
    .setDescription('>>> La supervivencia requiere buena alimentación. Varias comidas clásicas han sido mejoradas drásticamente y se han introducido nuevos manjares con efectos únicos.\n\n**COMIDAS CLÁSICAS MEJORADAS 🍎**\n' + vanillaFoods + '\n\n**PLATILLOS ESPECIALES ✨**\n' + customFoods)
    .setColor(0xe67e22) // Orange color for food
    .setFooter({ text: 'Nota: Los efectos especiales aplican desde el Día 2, y los bufos de curación/saturación desde el Día 15.' });

  await interaction.reply({ embeds: [embed] });
};
