import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('skin')
  .setDescription('Muestra la skin de un jugador de Minecraft.')
  .addStringOption(option => 
    option.setName('jugador')
      .setDescription('El nombre de usuario (IGN) del jugador de Minecraft')
      .setRequired(true)
  );

export const metadata = {
  aliases: ['skins'],
  category: 'Diversión',
  description: 'Muestra la skin de un jugador de Minecraft en diferentes vistas interactivas.',
  usage: 'skin <jugador>',
  slashOnly: true,
  devOnly: false,
  staffOnly: false
};

const skinOptions = [
  { label: 'Cuerpo Completo - 3D', value: '3d/full', description: 'Vista 3D del cuerpo completo', emoji: '🧍' },
  { label: 'Busto - 3D', value: '3d/bust', description: 'Vista 3D desde la cintura hacia arriba', emoji: '👤' },
  { label: 'Cabeza - 2D', value: '2d/head', description: 'Vista plana 2D de la cabeza', emoji: '🧑' },
  { label: 'Frente - 2D', value: '2d/front', description: 'Vista plana 2D del frente del jugador', emoji: '🖼️' },
  { label: 'Frente Completo - 2D', value: '2d/frontfull', description: 'Vista plana 2D del frente completo', emoji: '🧍‍♂️' }
];

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const jugador = interaction.options.getString('jugador', true);
  
  // Default view is 3d/full
  const defaultView = '3d/full';
  
  // Use a query param (e.g. timestamp) to prevent Discord from caching the image if the skin updates
  const timeParam = Date.now();
  const imageUrl = `https://render.crafty.gg/${defaultView}/${jugador}?t=${timeParam}`;

  const embed = new EmbedBuilder()
    .setTitle(`Skin de ${jugador}`)
    .setColor('#38a169')
    .setImage(imageUrl);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`select_skin_${jugador}`)
    .setPlaceholder('Selecciona una vista diferente...')
    .addOptions(skinOptions);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.reply({
    embeds: [embed],
    components: [row]
  });
};

export const executeStringSelect = async (interaction: StringSelectMenuInteraction) => {
  const customId = interaction.customId;
  const jugador = customId.replace('select_skin_', '');
  const selectedView = interaction.values[0];

  const timeParam = Date.now();
  const imageUrl = `https://render.crafty.gg/${selectedView}/${jugador}?t=${timeParam}`;

  const embed = new EmbedBuilder()
    .setTitle(`Skin de ${jugador}`)
    .setColor('#38a169')
    .setImage(imageUrl);

  await interaction.update({
    embeds: [embed]
  });
};
