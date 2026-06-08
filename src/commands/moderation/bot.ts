import { ChatInputCommandInteraction, SlashCommandBuilder, ActivityType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('bot')
  .setDescription('Maneja el estado y la actividad del bot.')
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Cambia el estado del bot.')
      .addStringOption(option =>
        option.setName('state')
          .setDescription('El estado que quieres ponerle al bot.')
          .setRequired(true)
          .addChoices(
            { name: 'Disponible', value: 'online' },
            { name: 'Ausente', value: 'idle' },
            { name: 'No Molestar', value: 'dnd' },
            { name: 'Invisible', value: 'invisible' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('activity')
      .setDescription('Cambia el texto de la actividad del bot.')
      .addStringOption(option =>
        option.setName('text')
          .setDescription('El texto que quieres ponerle a la actividad del bot.')
          .setRequired(true)
      )
  );

export const metadata = {
  aliases: [],
  category: 'Moderación',
  description: 'Permite cambiar el estado y la actividad del bot.',
  usage: 'bot <status|activity> <value>',
  slashOnly: false,
  devOnly: false,
  staffOnly: true // Restricted to Staff only
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  // Get the chosen subcommand
  const subcommand = interaction.options.getSubcommand();
  
  if (!subcommand) {
    return interaction.reply({
      content: '❌ Invalid subcommand. Use `status` or `activity`.',
      ephemeral: true
    });
  }

  if (subcommand === 'status') {
    // Cast the string to the correct literal types expected by Discord.js
    const state = interaction.options.getString('state', true) as 'online' | 'idle' | 'dnd' | 'invisible';
    
    // Set the bot status (online, idle, dnd, invisible)
    interaction.client.user.setStatus(state);
    
    // Reply to the staff member
    await interaction.reply({
      content: `✅ Bot status successfully changed to **${state}**.`,
      ephemeral: true
    });
  } else if (subcommand === 'activity') {
    const text = interaction.options.getString('text', true);
    
    // Set the bot activity. ActivityType.Custom allows it to show just the text without "Playing"
    interaction.client.user.setActivity({
      name: 'Custom Status',
      type: ActivityType.Custom,
      state: text
    });
    
    // Reply to the staff member
    await interaction.reply({
      content: `✅ Bot activity successfully changed to: **${text}**.`,
      ephemeral: true
    });
  }
};
