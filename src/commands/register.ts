import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../lib/prisma';

export const data = new SlashCommandBuilder()
  .setName('register')
  .setDescription('Activa tu cuenta para acceder al Panel Web.');

export const aliases = ['registrar', 'activar'];

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const discordId = interaction.user.id;

  // 1. Ensure user exists
  let user = await prisma.user.findUnique({
    where: { discord_id: discordId }
  });

  if (!user) {
    // Create default account if missing
    const guestRole = await prisma.role.findUnique({ where: { id: 'default' } });
    const rolesToConnect = guestRole ? [{ id: guestRole.id }] : [];

    user = await prisma.user.create({
      data: {
        discord_id: discordId,
        discord_name: interaction.user.username,
        ign: null,
        enabled: false,
        password: null,
        trusted_author: false,
        joined_at: new Date(),
        avatar_url: interaction.user.displayAvatarURL({ size: 256, extension: 'png' }),
        roles: {
          connect: rolesToConnect
        }
      }
    });
  }

  // 2. Check if already activated
  if (user.enabled) {
    return interaction.reply({
      content: '¡Tu cuenta ya está activada! Puedes iniciar sesión en <https://panita.vercel.app/login>',
      ephemeral: true
    });
  }

  // 3. Build the embed instructions
  const embed = new EmbedBuilder()
    .setTitle('Activación de Cuenta')
    .setColor('#5865F2')
    .setDescription('Al activar tu cuenta tendrás acceso completo al Panel Web, permitiéndote ver tus estadísticas, subir fotos e interactuar con la plataforma de la comunidad.')
    .addFields(
      { name: 'Pasos para Activar', value: '1. Haz clic en el botón "Comenzar Activación" de abajo.\n2. Aparecerá un formulario privado emergente.\n3. Ingresa tu IGN de Minecraft y una contraseña segura.\n4. Envía el formulario para activar tu cuenta instantáneamente.' },
      { name: '⚠️ Aviso Importante', value: 'Tu nombre de Minecraft (IGN) **no se puede cambiar más adelante** y se utilizará para agregarte a la **whitelist** del servidor. Asegúrate de ingresar un nombre válido que te pertenezca legítimamente. Hacerse pasar por otros jugadores está estrictamente prohibido y puede resultar en un baneo.' }
    );

  const button = new ButtonBuilder()
    .setCustomId('btn_activate_account')
    .setLabel('Comenzar Activación')
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });
};
