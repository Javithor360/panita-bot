import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, ModalSubmitInteraction, ComponentType, TextInputStyle, ModalBuilder, GuildMember } from 'discord.js';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

export const data = new SlashCommandBuilder()
  .setName('register')
  .setDescription('Activa tu cuenta para acceder al Panel Web.');

export const metadata = {
  aliases: ['registrar', 'activar'],
  category: 'Utilidad',
  description: 'Activa tu cuenta de Discord para iniciar sesión en el Panel Web.',
  usage: 'register',
  slashOnly: true,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const member = interaction.member as GuildMember;
  if (member?.roles.cache.has('900215815855546389')) {
    return interaction.reply({
      content: 'No puedes registrar una cuenta secundaria. Por favor, ejecuta este comando utilizando tu cuenta principal de Discord.',
      ephemeral: true
    });
  }

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
    .setStyle(ButtonStyle.Success)
    .setEmoji('🚀');

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });
};

export const executeButton = async (interaction: ButtonInteraction) => {
  if (interaction.customId === 'btn_activate_account') {
    const modal = new ModalBuilder({
      custom_id: 'modal_activate_account',
      title: 'Activación de Cuenta',
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              custom_id: 'input_ign',
              label: 'IGN de Minecraft',
              placeholder: 'Ej: Steve',
              style: TextInputStyle.Short,
              required: true,
              min_length: 3,
              max_length: 16
            }
          ]
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              custom_id: 'input_password',
              label: 'Contraseña',
              style: TextInputStyle.Short,
              required: true,
              min_length: 6,
              max_length: 32
            }
          ]
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              custom_id: 'input_confirm_password',
              label: 'Repetir Contraseña',
              style: TextInputStyle.Short,
              required: true,
              min_length: 6,
              max_length: 32
            }
          ]
        }
      ]
    });

    await interaction.showModal(modal);
  }
};

export const executeModal = async (interaction: ModalSubmitInteraction) => {
  if (interaction.customId === 'modal_activate_account') {
    const ign = interaction.fields.getTextInputValue('input_ign');
    const password = interaction.fields.getTextInputValue('input_password');
    const confirmPassword = interaction.fields.getTextInputValue('input_confirm_password');
    const discordId = interaction.user.id;

    if (password !== confirmPassword) {
      return interaction.reply({ content: 'Las contraseñas no coinciden. Por favor, intenta ejecutar el comando de nuevo.', ephemeral: true });
    }

    const specialCharRegex = /[!@#$%^&*(),.?":{}|<>_\-+=]/;
    if (!specialCharRegex.test(password)) {
      return interaction.reply({ content: 'La contraseña debe contener al menos un carácter especial (por ejemplo: !, @, #, $, -, _). Por favor, inténtalo de nuevo.', ephemeral: true });
    }

    try {
      // Defer reply immediately since hashing might take a bit
      await interaction.deferReply({ ephemeral: true });

      const hashedPassword = bcrypt.hashSync(password, 10);

      await prisma.user.update({
        where: { discord_id: discordId },
        data: {
          ign: ign,
          password: hashedPassword,
          enabled: true
        }
      });

      await interaction.editReply({
        content: `🎉 **¡Éxito!** Tu cuenta ha sido activada con el IGN \`${ign}\`.\n\nYa puedes iniciar sesión en: <https://panita.vercel.app/login>`
      });
    } catch (error) {
      console.error('[Activation Error]', error);
      await interaction.editReply('Ocurrió un error al activar tu cuenta. Por favor inténtalo de nuevo más tarde.');
    }
  }
};
