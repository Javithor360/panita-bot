import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { tezzlarDays } from '../../utils/tezzlarData';

export const data = new SlashCommandBuilder()
  .setName('tezzlar')
  .setDescription('Comandos de Tezzlar')
  .addSubcommand(subcommand =>
    subcommand
      .setName('day')
      .setDescription('Muestra la información de un día específico de Tezzlar III.')
      .addIntegerOption(option =>
        option.setName('numero')
          .setDescription('Número de día (1-31)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(31)
      )
      .addBooleanOption(option =>
        option.setName('force')
          .setDescription('Forzar bypass de fecha (Solo Dev)')
          .setRequired(false)
      )
  );
export const metadata = {
  aliases: ['tez', 'tz'],
  category: 'Utilidad',
  description: 'Proporciona información diaria sobre el evento Tezzlar III.',
  usage: 'tezzlar day <numero>',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const args = (interaction as any).args as string[] | undefined;
  
  let numero = 1;
  let isForce = false;

  if (args) {
    if (args.length === 0 || args[0].toLowerCase() !== 'day') {
      return interaction.reply({ content: '❌ Subcomando inválido. Uso correcto: `!tezzlar day <numero>`', ephemeral: true });
    }
    const num = parseInt(args[1]);
    if (isNaN(num) || num < 1 || num > 31) {
      return interaction.reply({ content: '❌ Debes proporcionar un número de día válido entre 1 y 31.', ephemeral: true });
    }
    numero = num;
    isForce = args.includes('--force');
  } else {
    numero = interaction.options.getInteger('numero', true);
    isForce = interaction.options.getBoolean('force') || false;
  }

  // Time logic: July = month 6 in Date.UTC
  // 14:00 UTC-6 is equivalent to 20:00 UTC
  const unlockTime = Date.UTC(2026, 6, numero, 20, 0, 0, 0);

  if (Date.now() < unlockTime) {
    if (isForce && interaction.user.id === process.env.DEVELOPER_ID) {
      // Bypass the time restriction for the developer
    } else {
      const timestampSeconds = Math.floor(unlockTime / 1000);
      return interaction.reply({ 
        content: `<:noautorizo:1116806520265506866> ¡Alto ahí, viajero del tiempo! La información del **Día ${numero}** se desbloqueará <t:${timestampSeconds}:R>.`,
        ephemeral: true
      });
    }
  }

  const dayData = tezzlarDays[numero];
  const fields = dayData?.fields || [];
  if (fields.length === 0 && !dayData?.image) {
    return interaction.reply({ content: `Aún no hay información configurada para el **Día ${numero}**.`, ephemeral: true });
  }

  // Determine color
  // 1-10: Light blue
  // 11-21: Pastel yellow
  // 22-31: Red
  let color = 0xadd8e6; // Light blue
  if (numero >= 11 && numero <= 21) color = 0xfdfd96; // Pastel yellow
  if (numero >= 22 && numero <= 31) color = 0xe74c3c; // Red

  const embed = new EmbedBuilder()
    .setAuthor({
      name: `Tezzlar III ~ Día ${numero}`,
      iconURL: 'https://media.discordapp.net/attachments/1032440236564824105/1513754769322414080/Picel.gif?ex=6a43e83d&is=6a4296bd&hm=2400706674437e00e7d3c1568db74b36023a1d2f0848416115937b2bf6a84f16&=',
      url: 'https://panita.vercel.app/tezzlar3'
    })
    .setTitle('Menú del Día en Tezzlar')
    .setDescription(`Para el día número **${numero}**, los supervivientes tienen que afrontar nuevas adversidades y peligros letales que pondrán a prueba su instinto en este mundo implacable.`)
    .setThumbnail('https://media.discordapp.net/attachments/1032440236564824105/1519191750948819025/corazonestezzlar.png?ex=6a43e952&is=6a4297d2&hm=aa4cabc21f3ea3d19283a2e0dadb950a762861b92f6bf42879d75a75640225c7&=&format=webp&quality=lossless&width=960&height=960')
    .setColor(color)
    .addFields(fields);

  if (dayData?.image) {
    embed.setImage(dayData.image);
  }

  await interaction.reply({ embeds: [embed] });
};
