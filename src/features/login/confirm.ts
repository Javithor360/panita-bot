import { discordTimestamp } from '../../lib/format';
import { CodeNotFoundError, confirmLogin, type ConfirmedLogin } from '../../services/sessions';
import { NotActivatedError } from '../../services/users';

/** What came of a member sending a code: the same three answers for `/confirm` and for the DM message. */
export type ConfirmOutcome =
  | { kind: 'confirmed'; login: ConfirmedLogin }
  | { kind: 'code_not_found' }
  | { kind: 'not_activated' };

/** A login code is exactly four digits (a string, because it can start with 0). */
const CODE_PATTERN = /^\d{4}$/;

export const isLoginCode = (text: string) => CODE_PATTERN.test(text.trim());

export const LOGIN_MESSAGES = {
  badFormat: 'El código tiene 4 dígitos.',
  codeNotFound: 'Ese código no es válido o ya expiró. Revisa el que se muestra en la app.',
  notActivated: 'Primero activa tu cuenta con `/register`.',
  // The only things the member is told about the sign-in: who, where and when (nothing else is known to the bot)
  confirmed: ({ username, application, requested_at }: ConfirmedLogin) =>
    `✅ Sesión confirmada. **${username}** ya puede entrar en **${application}** (${discordTimestamp(new Date(requested_at), 'R')}).\n` +
    'Confirma solo inicios de sesión que tú mismo empezaste.\n' +
    'Si no fuiste tú, usa `/sessions` para cerrar la sesión.',
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
