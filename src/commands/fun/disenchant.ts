import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { fromGalactic } from '../../utils/galactic';

export const data = new SlashCommandBuilder()
  .setName('disenchant')
  .setDescription('Traduce un texto del Standard Galactic Alphabet al español.')
  .addStringOption(option =>
    option.setName('texto')
      .setDescription('El texto a desencantar')
      .setRequired(true)
  );

export const metadata = {
  aliases: ['desencantar'],
  category: 'Diversión',
  description: 'Traduce un texto del Standard Galactic Alphabet al español.',
  usage: 'disenchant <texto>',
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
    return interaction.reply({ content: 'Por favor, proporciona un texto para desencantar.' });
  }

  const normalText = fromGalactic(text);
  await interaction.reply({ content: normalText });
};
