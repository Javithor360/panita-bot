import { discordTimestamp, untrustedText } from '../../lib/format';
import { CodeNotFoundError, confirmLogin, type ConfirmedLogin } from '../../services/sessions';
import { NotActivatedError } from '../../services/users';

/** What came of a member sending a code: the same three answers for `/confirm` and for the DM message. */
export type ConfirmOutcome =
  | { kind: 'confirmed'; login: ConfirmedLogin }
  | { kind: 'code_not_found' }
  | { kind: 'not_activated' };

/** The longest text the API accepts as a code. */
export const MAX_CODE_LENGTH = 32;

/** The web shows 4 digits (a string, because it can start with 0). */
const WEB_CODE_PATTERN = /^\d{4}$/;

/** The launcher shows a 12-character serial `XXXX-YYYY-ZZZZ` (digits 2-9 and letters but I and O), typed in any case with dashes, spaces or none. */
const SERIAL_GROUP = '[2-9A-HJ-NP-Z]{4}';
const SERIAL_PATTERN = new RegExp(`^${SERIAL_GROUP}(?:[- ]?${SERIAL_GROUP}){2}$`, 'i');

/** Whether a whole message is a web code or a launcher serial. The API ignores case, dashes and spaces, so the text goes as typed. */
export const isLoginCode = (text: string) => {
  const code = text.trim();
  return WEB_CODE_PATTERN.test(code) || SERIAL_PATTERN.test(code);
};

/** Where a sign-in comes from: the app, then the device name and system when the client sent them (untrusted, so shown as code). */
const describeDevice = ({ device_name, device_os }: Pick<ConfirmedLogin, 'device_name' | 'device_os'>) =>
  [untrustedText(device_name), untrustedText(device_os)].filter(Boolean).join(' · ');

export const LOGIN_MESSAGES = {
  badFormat: 'El código tiene 4 dígitos, o 12 caracteres (`XXXX-YYYY-ZZZZ`) si es el del launcher.',
  codeNotFound: 'Ese código no es válido o ya expiró. Revisa el que se muestra en la app.',
  notActivated: 'Primero activa tu cuenta con `/register`.',
  // The only things the member is told about the sign-in: who, where (app and device) and when
  confirmed: (login: ConfirmedLogin) => {
    const device = describeDevice(login);
    return `✅ Sesión confirmada. **${login.username}** ya puede entrar en **${login.application}**${device ? ` desde ${device}` : ''} (${discordTimestamp(new Date(login.requested_at), 'R')}).\n` +
      'Confirma solo inicios de sesión que tú mismo empezaste.\n' +
      'Si no fuiste tú, usa `/sessions` para cerrar la sesión.';
  },
};

/** The text that answers a confirmation. Never includes the code. */
export const confirmationMessage = (outcome: ConfirmOutcome): string => {
  switch (outcome.kind) {
    case 'confirmed': return LOGIN_MESSAGES.confirmed(outcome.login);
    case 'code_not_found': return LOGIN_MESSAGES.codeNotFound;
    case 'not_activated': return LOGIN_MESSAGES.notActivated;
  }
};

/**
 * Confirms the sign-in that `code` belongs to for this member. The three expected rejections become an
 * outcome; any other failure (the API is down, a rejected key) is thrown for the caller to report.
 */
export const confirmCode = async (discordId: string, code: string): Promise<ConfirmOutcome> => {
  try {
    return { kind: 'confirmed', login: await confirmLogin(discordId, code) };
  } catch (error) {
    if (error instanceof CodeNotFoundError) return { kind: 'code_not_found' };
    if (error instanceof NotActivatedError) return { kind: 'not_activated' };
    throw error;
  }
};
