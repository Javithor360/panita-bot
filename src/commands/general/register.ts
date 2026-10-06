import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalActionRowComponentBuilder,
} from 'discord.js';
import { CATEGORIES, COLORS, URLS } from '../../config/constants';
import { button, defineCommand, modal } from '../../core/command';
import { encodeCustomId } from '../../core/customId';
import { avatarUrlOf, isAltAccount } from '../../lib/discord';
import { isValidIgn } from '../../lib/minecraft';
import { SERVICE_UNAVAILABLE_ERROR } from '../../core/errors';
import { ApiError } from '../../lib/api';
import {
  activateAccount,
  AlreadyActivatedError,
  ensureUser,
  IgnTakenError,
  InvalidActivationError,
  profileOf,
  syncProfile,
  UserNotFoundError,
} from '../../services/users';

const NAME = 'register';

const MESSAGES = {
  alt: 'No puedes registrar una cuenta secundaria. Por favor, ejecuta este comando utilizando tu cuenta principal de Discord.',
  alreadyActive: `¡Tu cuenta ya está activada! Puedes iniciar sesión en <${URLS.login}>`,
  invalidIgn: 'El IGN no es válido. Debe tener entre 3 y 16 caracteres y solo puede contener letras, números y guiones bajos (`_`).',
  ignTaken: (ign: string) => `❌ El IGN \`${ign}\` ya está registrado por otra cuenta. Si crees que es un error, contacta al Staff.`,
  passwordMismatch:'Las contraseñas no coinciden. Por favor, intenta ejecutar el comando de nuevo.',
  passwordSpecial: 'La contraseña debe contener al menos un carácter especial (por ejemplo: !, @, #, $, -, _). Por favor, inténtalo de nuevo.',
  passwordLength: 'La contraseña debe tener entre 6 y 32 caracteres.',
  failure: 'Ocurrió un error al activar tu cuenta. Por favor inténtalo de nuevo más tarde.',
  success: (ign: string) => `🎉 **¡Éxito!** Tu cuenta ha sido activada con el IGN \`${ign}\`.\n\nYa puedes iniciar sesión en: <${URLS.login}>`,
};

/** The message for an activation that did not go through; unexpected failures are logged. */
const activationFailureMessage = (error: unknown, ign: string): string => {
  if (error instanceof InvalidActivationError) {
    return {
      ign_format: MESSAGES.invalidIgn,
      special: MESSAGES.passwordSpecial,
      length: MESSAGES.passwordLength,
    }[error.reason];
  }
  if (error instanceof IgnTakenError) return MESSAGES.ignTaken(ign);
  if (error instanceof AlreadyActivatedError) return MESSAGES.alreadyActive;
  if (error instanceof ApiError && error.transient) return SERVICE_UNAVAILABLE_ERROR;
  console.error('[Activation Error]', error);
  return MESSAGES.failure;
};

const buildInstructions = () =>
  new EmbedBuilder()
    .setTitle('Activación de Cuenta')
    .setColor(COLORS.blurple)
    .setDescription('Al activar tu cuenta tendrás acceso completo al Panel Web, permitiéndote ver tus estadísticas, subir fotos e interactuar con la plataforma de la comunidad.')
    .addFields(
      { name: 'Pasos para Activar', value: '1. Haz clic en el botón "Comenzar Activación" de abajo.\n2. Aparecerá un formulario privado emergente.\n3. Ingresa tu IGN de Minecraft y una contraseña segura.\n4. Envía el formulario para activar tu cuenta instantáneamente.' },
      { name: '⚠️ Aviso Importante', value: 'Tu nombre de Minecraft (IGN) **no se puede cambiar más adelante** y se utilizará para agregarte a la **whitelist** del servidor. Asegúrate de ingresar un nombre válido que te pertenezca legítimamente. Hacerse pasar por otros jugadores está estrictamente prohibido y puede resultar en un baneo.' },
    );

const textInput = (id: string, label: string, min: number, max: number, placeholder?: string) => {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(min)
    .setMaxLength(max);
  if (placeholder) input.setPlaceholder(placeholder);
  return new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(input);
};

const buildActivationModal = () =>
  new ModalBuilder()
    .setCustomId(encodeCustomId({ namespace: NAME, action: 'submit' }))
    .setTitle('Activación de Cuenta')
    .addComponents(
      textInput('input_ign', 'IGN de Minecraft', 3, 16, 'Ej: Steve'),
      textInput('input_password', 'Contraseña', 6, 32),
      textInput('input_confirm_password', 'Repetir Contraseña', 6, 32),
    );

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName(NAME)
    .setDescription('Activa tu cuenta para acceder al Panel Web.'),
  meta: {
    category: CATEGORIES.general,
    description: 'Activa tu cuenta de Discord para iniciar sesión en el Panel Web.',
    aliases: ['registrar', 'activar'],
  },
  async run(ctx) {
    // Acknowledge before calling the API
    await ctx.defer({ ephemeral: true });

    if (isAltAccount(ctx.member)) return ctx.reply({ content: MESSAGES.alt, ephemeral: true });

    const { user, created } = await ensureUser(profileOf(ctx.user, ctx.member.joinedAt));
    if (!created) await syncProfile(ctx.user.id, { username: ctx.user.username, avatarUrl: avatarUrlOf(ctx.user) });

    if (user.enabled) return ctx.reply({ content: MESSAGES.alreadyActive, ephemeral: true });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(ctx.customId('activate', [], { owned: true }))
        .setLabel('Comenzar Activación')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🚀'),
    );

    await ctx.reply({ embeds: [buildInstructions()], components: [row], ephemeral: true });
  },
  components: {
    activate: button({
      run: interaction => interaction.showModal(buildActivationModal()),
    }),
    submit: modal({
      async run(interaction) {
        const ign = interaction.fields.getTextInputValue('input_ign');
        const password = interaction.fields.getTextInputValue('input_password');
        const confirmPassword = interaction.fields.getTextInputValue('input_confirm_password');
        const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

        if (!isValidIgn(ign)) return reply(MESSAGES.invalidIgn);
        // The password rules (length, special character) live in the API; its answer is mapped below

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Re-validate: the state may have changed since the command was run
        if (!interaction.inCachedGuild() || isAltAccount(interaction.member)) return interaction.editReply(MESSAGES.alt);
        const profile = profileOf(interaction.user, interaction.member.joinedAt);
        const { user } = await ensureUser(profile);
        if (user.enabled) return interaction.editReply(MESSAGES.alreadyActive);

        try {
          try {
            await activateAccount(interaction.user.id, ign, password);
          } catch (error) {
            // The account vanished since it was ensured: create it again and retry once
            if (!(error instanceof UserNotFoundError)) throw error;
            await ensureUser(profile);
            await activateAccount(interaction.user.id, ign, password);
          }
          await interaction.editReply(MESSAGES.success(ign));
        } catch (error) {
          await interaction.editReply(activationFailureMessage(error, ign));
        }
      },
    }),
  },
});
