import { ChatInputCommandInteraction, SlashCommandBuilder, Message } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ip')
  .setDescription('Muestra la dirección IP del servidor de Minecraft.')
  .addBooleanOption(option => 
    option.setName('numeric')
      .setDescription('Muestra la IP numérica en lugar del dominio')
      .setRequired(false)
  );

export const metadata = {
  aliases: ['server', 'jugar'],
  category: 'Minecraft',
  description: 'Proporciona la IP y estado actual del servidor de Minecraft.',
  usage: 'ip',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction | any) => {
  const args = interaction.args as string[] | undefined;
  const isPrefix = !!args;
  
  let isNumeric = false;
  if (isPrefix) {
    isNumeric = args.includes('--numeric');
  } else {
    isNumeric = interaction.options.getBoolean('numeric') ?? false;
  }

  const now = new Date();
  const start = new Date('2026-07-01T20:00:00-06:00');
  const end = new Date('2026-08-01T00:00:00-06:00');

  let content = '<:noautorizo:1116806520265506866> **Por el momento no hay servidor de Minecraft vigente.**';

  if (now >= start && now <= end) {
    const ip = isNumeric ? '142.44.255.131:25599' : 'tezzlar3.my.pebble.host';
    content = `🌐 **IP del Servidor:** \`${ip}\``;
  }

  await interaction.reply({ content });
};
