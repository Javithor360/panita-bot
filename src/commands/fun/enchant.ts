import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { toGalactic } from '../../utils/galactic';

export const data = new SlashCommandBuilder()
  .setName('enchant')
  .setDescription('Traduce tu texto al Standard Galactic Alphabet (Mesa de encantamientos).')
  .addStringOption(option =>
    option.setName('texto')
      .setDescription('El texto a encantar')
      .setRequired(true)
  );

export const metadata = {
  aliases: ['encantar'],
  category: 'Diversión',
  description: 'Traduce tu texto al Standard Galactic Alphabet.',
  usage: 'enchant <texto>',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  let text = interaction.options.getString('texto');
  
  // Use raw args from the prefix command adapter
  if ('args' in interaction && Array.isArray((interaction as any).args)) {
    const rawArgs = (interaction as any).args.join(' ');
    if (rawArgs.length > 0) {
      text = rawArgs;
    }
  }

  if (!text) {
    return interaction.reply({ content: 'Por favor, proporciona un texto para encantar.' });
  }

  const enchanted = toGalactic(text);
  await interaction.reply({ content: enchanted });
};
