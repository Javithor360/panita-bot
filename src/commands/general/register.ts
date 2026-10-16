import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { CATEGORIES, COLORS, URLS } from '../../config/constants';
import { button, defineCommand, modal } from '../../core/command';
import { encodeCustomId } from '../../core/customId';
import { avatarUrlOf, isAltAccount } from '../../lib/discord';
import {
  buildRegisterModal,
  CONFIRM_INPUT,
  IGN_INPUT,
  parseStatus,
  PASSWORD_INPUT,
  PASSWORD_RULE_MESSAGES,
  registerStep,
  STATUS_LABEL,
  validateFields,
  type FormFields,
  type MinecraftStatus,
} from '../../lib/registration';
import { SERVICE_UNAVAILABLE_ERROR } from '../../core/errors';
import { passwordResetComponents } from '../../features/passwordReset/components';
import { ApiError } from '../../lib/api';
import {
  activateAccount,
  AlreadyActivatedError,
  ensureUser,
  IgnTakenError,
  InvalidActivationError,
  NotActivatedError,
  profileOf,
  setMinecraftStatus,
  setPassword,
  syncProfile,
  UserNotFoundError,
} from '../../services/users';

const NAME = 'register';
const MODAL_TITLE = 'Activación de Cuenta';

const MESSAGES = {
  alt: 'No puedes registrar una cuenta secundaria. Por favor, ejecuta este comando utilizando tu cuenta principal de Discord.',
  alreadyActive: '¡Tu cuenta ya está activada! Si prefieres una contraseña para iniciar sesión, usa `/register with_password`.',
  invalidIgn: 'El IGN no es válido. Debe tener entre 3 y 16 caracteres y solo puede contener letras, números y guiones bajos (`_`).',
  ignTaken: (ign: string) => `❌ El IGN \`${ign}\` ya está registrado por otra cuenta. Si crees que es un error, contacta al Staff.`,
  passwordMismatch: 'Las contraseñas no coinciden. Vuelve a ejecutar `/register with_password` para intentarlo de nuevo.',
  passwordSpecial: PASSWORD_RULE_MESSAGES.special,
  passwordLength: PASSWORD_RULE_MESSAGES.length,
  notActivated: 'Primero activa tu cuenta con `/register`.',
  lostIgn: 'No pudimos recuperar tu IGN guardado. Vuelve a ejecutar `/register`.',
  failure: 'Ocurrió un error al activar tu cuenta. Por favor inténtalo de nuevo más tarde.',
  success: (ign: string, status: MinecraftStatus, withPassword: boolean) =>
    `🎉 **¡Éxito!** Tu cuenta ha sido activada con el IGN \`${ign}\` (${STATUS_LABEL[status]}).\n\n` +
    `Ya puedes iniciar sesión en <${URLS.login}> y en el launcher con un código que confirmas con \`/confirm\`, y entrar al servidor de Minecraft.` +
    (withPassword ? '' : '\n\nSi prefieres una contraseña, usa `/register with_password`.'),
  statusSaved: (status: MinecraftStatus) => `✅ Listo, registramos tu cuenta como **${STATUS_LABEL[status]}**.`,
  passwordSet: 'Contraseña establecida. Ahora también puedes iniciar sesión con ella.',
  passwordReplaced: 'Contraseña actualizada. Se cerraron las sesiones que tenías abiertas.',
  statusPending: '\n\nTodavía no elegiste tu tipo de cuenta de Minecraft: ejecuta `/register` para hacerlo.',
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

const flag = (value: boolean) => (value ? '1' : '0');

/** A component id in this command's namespace, usable only by whoever the interaction belongs to. */
const ownedId = (user: { id: string }, action: string, args: string[]) =>
  encodeCustomId({ namespace: NAME, action, args, owner: user.id });

const statusPrompt = (step: 'new' | 'status_only' | 'returning', ign: string | null) => {
  const embed = new EmbedBuilder()
    .setTitle(step === 'new' ? 'Activación de Cuenta' : 'Tu cuenta de Minecraft')
    .setColor(COLORS.blurple)
    .setDescription('**¿Juegas con una cuenta premium de Minecraft?**\nPremium significa que compraste Minecraft Java y entras con tu cuenta de Microsoft.');

  if (step === 'new') {
    embed.addFields(
      { name: 'Pasos para Activar', value: '1. Elige si tu cuenta es premium o no.\n2. Ingresa tu IGN de Minecraft en el formulario privado.\n3. Listo: inicia sesión en la web y en el launcher con un código que confirmas en Discord.' },
      { name: '⚠️ Aviso Importante', value: 'Tu nombre de Minecraft (IGN) **no se puede cambiar más adelante** y se utilizará para agregarte a la **whitelist** del servidor. Asegúrate de ingresar un nombre válido que te pertenezca legítimamente. Hacerse pasar por otros jugadores está estrictamente prohibido y puede resultar en un baneo.' },
    );
  } else if (step === 'returning' && ign) {
    embed.addFields({ name: 'IGN guardado', value: `Tu cuenta sigue ligada al IGN \`${ign}\`.` });
  }
  return embed;
};

const statusButtons = (user: { id: string }, step: 'new' | 'status_only' | 'returning', withPassword: boolean, ign: string | null) => {
  // The stored IGN travels only to be shown; activation reads it again from the API
  const extra = step === 'returning' && ign ? [ign] : [];
  const id = (status: MinecraftStatus) => ownedId(user, 'status', [status, flag(withPassword), step, ...extra]);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(id('premium')).setLabel('Tengo cuenta premium').setStyle(ButtonStyle.Success).setEmoji('💎'),
    new ButtonBuilder().setCustomId(id('cracked')).setLabel('No tengo cuenta premium').setStyle(ButtonStyle.Secondary),
  );
};

const submitId = (status: MinecraftStatus, fields: FormFields) =>
  encodeCustomId({ namespace: NAME, action: 'submit', args: [status, flag(fields.askPassword), fields.askIgn ? 'ask' : 'stored'] });

const showRegisterModal = (interaction: ButtonInteraction, status: MinecraftStatus, fields: FormFields) =>
  interaction.showModal(buildRegisterModal(submitId(status, fields), MODAL_TITLE, fields));

/** Replaces whatever the member was looking at (an interaction that was deferred or deferred as an update). */
const finish = (interaction: ButtonInteraction | ModalSubmitInteraction, content: string) =>
  interaction.editReply({ content, embeds: [], components: [] });

/**
 * Activates the account of whoever pressed the button or sent the form. `ign` is the one they typed; without
 * it the one stored from before is used. The interaction must already be acknowledged.
 */
const activate = async (
  interaction: ButtonInteraction | ModalSubmitInteraction,
  status: MinecraftStatus,
  input: { ign?: string; password?: string },
) => {
  // Re-validate: the state may have changed since the command was run
  if (!interaction.inCachedGuild() || isAltAccount(interaction.member)) return finish(interaction, MESSAGES.alt);
  const profile = profileOf(interaction.user, interaction.member.joinedAt);
  const { user } = await ensureUser(profile);
  if (user.enabled) return finish(interaction, MESSAGES.alreadyActive);

  const ign = input.ign ?? user.ign;
  if (!ign) return finish(interaction, MESSAGES.lostIgn);

  const activation = { ign, minecraftStatus: status, password: input.password };
  try {
    try {
      await activateAccount(interaction.user.id, activation);
    } catch (error) {
      // The account vanished since it was ensured: create it again and retry once
      if (!(error instanceof UserNotFoundError)) throw error;
      await ensureUser(profile);
      await activateAccount(interaction.user.id, activation);
    }
    await finish(interaction, MESSAGES.success(ign, status, input.password !== undefined));
  } catch (error) {
    await finish(interaction, activationFailureMessage(error, ign));
  }
};

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName(NAME)
    .setDescription('Activa tu cuenta para acceder al Panel Web.')
    .addBooleanOption(option =>
      option.setName('with_password').setDescription('Agrega o cambia una contraseña para iniciar sesión (opcional).'),
    ),
  meta: {
    category: CATEGORIES.general,
    description: 'Activa tu cuenta de Discord e indica si juegas con cuenta premium de Minecraft. Con `with_password` (`--with_password` en prefijo) también puedes agregar o cambiar una contraseña, que es opcional: normalmente inicias sesión con un código que confirmas en Discord.',
    aliases: ['registrar', 'activar'],
  },
  async run(ctx) {
    // Acknowledge before calling the API
    await ctx.defer({ ephemeral: true });

    if (isAltAccount(ctx.member)) return ctx.reply({ content: MESSAGES.alt, ephemeral: true });

    const { user, created } = await ensureUser(profileOf(ctx.user, ctx.member.joinedAt));
    if (!created) await syncProfile(ctx.user.id, { username: ctx.user.username, avatarUrl: avatarUrlOf(ctx.user) });

    const withPassword = ctx.options.getBoolean('with_password') ?? false;
    const step = registerStep(user, withPassword);

    if (step === 'done') return ctx.reply({ content: MESSAGES.alreadyActive, ephemeral: true });

    if (step === 'password') {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ctx.customId('password', [flag(user.has_password)], { owned: true }))
          .setLabel(user.has_password ? 'Cambiar contraseña' : 'Elegir contraseña')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔑'),
      );
      const content = 'La contraseña es opcional: sirve para iniciar sesión sin pasar por Discord.' +
        (user.minecraft_status === null ? MESSAGES.statusPending : '');
      return ctx.reply({ content, components: [row], ephemeral: true });
    }

    await ctx.reply({
      embeds: [statusPrompt(step, user.ign)],
      components: [statusButtons(ctx.user, step, withPassword, user.ign)],
      ephemeral: true,
    });
  },
  components: {
    // The buttons and form of a password reset started from the web (see `features/passwordReset`)
    ...passwordResetComponents,
    // Args: status, password requested (1|0), step (new|status_only|returning), stored IGN (returning only)
    status: button({
      async run(interaction, [statusArg, withPassword, step, storedIgn]) {
        const status = parseStatus(statusArg);
        if (!status) return interaction.reply({ content: 'Este botón ya no está disponible.', flags: MessageFlags.Ephemeral });
        const askPassword = withPassword === '1';

        if (step === 'new') return showRegisterModal(interaction, status, { askIgn: true, askPassword });

        if (step === 'returning') {
          const confirm = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(ownedId(interaction.user, 'use', [status, withPassword]))
              .setLabel(storedIgn ? `Activar con ${storedIgn}` : 'Activar con mi IGN guardado')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(ownedId(interaction.user, 'other', [status, withPassword]))
              .setLabel('Usar otro nombre')
              .setStyle(ButtonStyle.Secondary),
          );
          const embed = new EmbedBuilder()
            .setTitle('Confirma tu IGN')
            .setColor(COLORS.blurple)
            .setDescription(`Registraremos tu cuenta como **${STATUS_LABEL[status]}**${storedIgn ? ` con el IGN \`${storedIgn}\`` : ''}.\n¿Quieres seguir con ese nombre?`);
          return interaction.update({ embeds: [embed], components: [confirm] });
        }

        // An active account that only lacked its status
        await interaction.deferUpdate();
        try {
          await setMinecraftStatus(interaction.user.id, status);
          await finish(interaction, MESSAGES.statusSaved(status));
        } catch (error) {
          if (error instanceof NotActivatedError || error instanceof UserNotFoundError) {
            return finish(interaction, MESSAGES.notActivated);
          }
          throw error;
        }
      },
    }),
    // Args: status, password requested (1|0). The returning member keeps the IGN stored from before.
    use: button({
      async run(interaction, [statusArg, withPassword]) {
        const status = parseStatus(statusArg);
        if (!status) return interaction.reply({ content: 'Este botón ya no está disponible.', flags: MessageFlags.Ephemeral });

        if (withPassword === '1') return showRegisterModal(interaction, status, { askIgn: false, askPassword: true });

        await interaction.deferUpdate();
        await activate(interaction, status, {});
      },
    }),
    other: button({
      run(interaction, [statusArg, withPassword]) {
        const status = parseStatus(statusArg);
        if (!status) return interaction.reply({ content: 'Este botón ya no está disponible.', flags: MessageFlags.Ephemeral });
        return showRegisterModal(interaction, status, { askIgn: true, askPassword: withPassword === '1' });
      },
    }),
    // Args: whether the account already has a password (1|0)
    password: button({
      run: (interaction, [hasPassword]) =>
        interaction.showModal(
          buildRegisterModal(encodeCustomId({ namespace: NAME, action: 'pwsubmit', args: [hasPassword === '1' ? '1' : '0'] }), 'Contraseña', {
            askIgn: false,
            askPassword: true,
          }),
        ),
    }),
    // Args: status, password asked (1|0), whether the IGN was asked (ask|stored)
    submit: modal({
      async run(interaction, [statusArg, withPassword, ignMode]) {
        const status = parseStatus(statusArg);
        const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
        if (!status) return reply('Este formulario ya no está disponible.');

        const fields: FormFields = { askIgn: ignMode === 'ask', askPassword: withPassword === '1' };
        const result = validateFields(
          {
            ign: fields.askIgn ? interaction.fields.getTextInputValue(IGN_INPUT) : undefined,
            password: fields.askPassword ? interaction.fields.getTextInputValue(PASSWORD_INPUT) : undefined,
            confirm: fields.askPassword ? interaction.fields.getTextInputValue(CONFIRM_INPUT) : undefined,
          },
          fields,
        );
        if (!result.ok) return reply(result.error === 'invalid_ign' ? MESSAGES.invalidIgn : MESSAGES.passwordMismatch);
        // The other password rules (length, special character) live in the API; its answer is mapped in `activate`

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await activate(interaction, status, { ign: result.ign, password: result.password });
      },
    }),
    // Args: whether the account already had a password (1|0)
    pwsubmit: modal({
      async run(interaction, [hadPassword]) {
        const result = validateFields(
          {
            password: interaction.fields.getTextInputValue(PASSWORD_INPUT),
            confirm: interaction.fields.getTextInputValue(CONFIRM_INPUT),
          },
          { askIgn: false, askPassword: true },
        );
        if (!result.ok) return interaction.reply({ content: MESSAGES.passwordMismatch, flags: MessageFlags.Ephemeral });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          await setPassword(interaction.user.id, result.password!);
          await interaction.editReply(hadPassword === '1' ? MESSAGES.passwordReplaced : MESSAGES.passwordSet);
        } catch (error) {
          if (error instanceof InvalidActivationError) return interaction.editReply(activationFailureMessage(error, ''));
          if (error instanceof NotActivatedError || error instanceof UserNotFoundError) {
            return interaction.editReply(MESSAGES.notActivated);
          }
          throw error;
        }
      },
    }),
  },
});
