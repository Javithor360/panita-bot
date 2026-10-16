/**
 * The decisions and form pieces of `/register` that don't need Discord to run, so they can be tested:
 * which step an account is at, the activation and password modals, and the validation of what they return.
 */
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, type ModalActionRowComponentBuilder } from 'discord.js';
import type { BotUser, MinecraftStatus } from './api/types';
import { isValidIgn } from './minecraft';

export type { MinecraftStatus };

export const IGN_INPUT = 'input_ign';
export const PASSWORD_INPUT = 'input_password';
export const CONFIRM_INPUT = 'input_confirm_password';

/**
 * What `/register` does for an account:
 * - `done`: active with a status and no password requested, nothing left to ask.
 * - `password`: active and a password was requested: only the password form.
 * - `status_only`: active but the status was never chosen (members from before it existed).
 * - `returning`: disabled but with an IGN kept from before: ask the status and confirm the stored IGN.
 * - `new`: disabled with no IGN: ask the status, then the IGN.
 */
export type RegisterStep = 'done' | 'password' | 'status_only' | 'returning' | 'new';

export const registerStep = (
  user: Pick<BotUser, 'enabled' | 'ign' | 'minecraft_status'>,
  withPassword: boolean,
): RegisterStep => {
  if (user.enabled) {
    // A member who asks for a password gets the password form, even if the status is still missing
    if (withPassword) return 'password';
    return user.minecraft_status === null ? 'status_only' : 'done';
  }
  return user.ign ? 'returning' : 'new';
};

export const parseStatus = (value: string | undefined): MinecraftStatus | null =>
  value === 'premium' || value === 'cracked' ? value : null;

export const STATUS_LABEL: Record<MinecraftStatus, string> = {
  premium: 'cuenta premium',
  cracked: 'cuenta no premium',
};

/** What the member is told when the API rejects a password (the rules themselves live in the API). */
export const PASSWORD_RULE_MESSAGES = {
  special: 'La contraseña debe contener al menos un carácter especial (por ejemplo: !, @, #, $, -, _). Por favor, inténtalo de nuevo.',
  length: 'La contraseña debe tener entre 6 y 32 caracteres.',
} as const;

export const PASSWORD_PLACEHOLDER = '6 a 32 caracteres, con un carácter especial';

/** One short, required line of a modal. */
export const textInput = (id: string, label: string, min: number, max: number, placeholder?: string) => {
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

export interface FormFields {
  /** Ask for the IGN. False when the stored one is reused. */
  askIgn: boolean;
  /** Ask for a password and its confirmation. */
  askPassword: boolean;
}

/** The form of activation (IGN and/or password) or of the password step alone. */
export const buildRegisterModal = (customId: string, title: string, { askIgn, askPassword }: FormFields) => {
  if (!askIgn && !askPassword) throw new Error('[register] A form needs at least one field');

  const rows = [];
  if (askIgn) rows.push(textInput(IGN_INPUT, 'IGN de Minecraft', 3, 16, 'Ej: Steve'));
  if (askPassword) {
    rows.push(textInput(PASSWORD_INPUT, 'Contraseña', 6, 32, PASSWORD_PLACEHOLDER));
    rows.push(textInput(CONFIRM_INPUT, 'Repetir contraseña', 6, 32));
  }
  return new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(...rows);
};

export type FieldsResult =
  | { ok: true; ign?: string; password?: string }
  | { ok: false; error: 'invalid_ign' | 'password_mismatch' };

/**
 * Checks what the member typed. Only the IGN format and the confirmation are checked here: the rest of the
 * password rules (length, special character) belong to the API, whose answer the command maps.
 */
export const validateFields = (
  { ign, password, confirm }: { ign?: string; password?: string; confirm?: string },
  { askIgn, askPassword }: FormFields,
): FieldsResult => {
  const result: { ok: true; ign?: string; password?: string } = { ok: true };
  if (askIgn) {
    const trimmed = (ign ?? '').trim();
    if (!isValidIgn(trimmed)) return { ok: false, error: 'invalid_ign' };
    result.ign = trimmed;
  }
  if (askPassword) {
    if (!password || password !== confirm) return { ok: false, error: 'password_mismatch' };
    result.password = password;
  }
  return result;
};
