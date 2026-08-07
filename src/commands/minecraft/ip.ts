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

  const ip = isNumeric ? '51.81.146.102:25593' : 'mc.panitacraft.com';
  const content = `🌐 **IP del Servidor:** \`${ip}\``;

  await interaction.reply({ content });
};
