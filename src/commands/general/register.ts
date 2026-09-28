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
import { activateAccount, ensureUser, profileOf, syncProfile } from '../../services/users';

const NAME = 'register';
const SPECIAL_CHARACTER = /[!@#$%^&*(),.?":{}|<>_\-+=]/;

const MESSAGES = {
  alt: 'No puedes registrar una cuenta secundaria. Por favor, ejecuta este comando utilizando tu cuenta principal de Discord.',
  alreadyActive: `¡Tu cuenta ya está activada! Puedes iniciar sesión en <${URLS.login}>`,
  passwordMismatch: 'Las contraseñas no coinciden. Por favor, intenta ejecutar el comando de nuevo.',
  passwordSpecial: 'La contraseña debe contener al menos un carácter especial (por ejemplo: !, @, #, $, -, _). Por favor, inténtalo de nuevo.',
  failure: 'Ocurrió un error al activar tu cuenta. Por favor inténtalo de nuevo más tarde.',
  success: (ign: string) => `🎉 **¡Éxito!** Tu cuenta ha sido activada con el IGN \`${ign}\`.\n\nYa puedes iniciar sesión en: <${URLS.login}>`,
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
    if (isAltAccount(ctx.member)) return ctx.reply({ content: MESSAGES.alt, ephemeral: true });

    const { user, created } = await ensureUser(profileOf(ctx.user, ctx.member.joinedAt));
    if (!created) await syncProfile(ctx.user.id, { username: ctx.user.username, avatarUrl: avatarUrlOf(ctx.user) });

    if (user.enabled) return ctx.reply({ content: MESSAGES.alreadyActive, ephemeral: true });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(ctx.customId('activate'))
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

        if (password !== confirmPassword) return reply(MESSAGES.passwordMismatch);
        if (!SPECIAL_CHARACTER.test(password)) return reply(MESSAGES.passwordSpecial);

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          await activateAccount(interaction.user.id, ign, password);
          await interaction.editReply(MESSAGES.success(ign));
        } catch (error) {
          console.error('[Activation Error]', error);
          await interaction.editReply(MESSAGES.failure);
        }
      },
    }),
  },
});
