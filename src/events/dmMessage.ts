import type { Message } from 'discord.js';
import { userMessageFor } from '../core/errors';
import { confirmationMessage, confirmCode, isLoginCode } from '../features/login/confirm';
import { createCooldown, type Cooldown } from '../lib/cooldown';

const HELP_WINDOW_MS = 60_000;

export const DM_HELP =
  'Envíame solo el código que ves en la app que tú abriste (4 dígitos en la web, o `XXXX-YYYY-ZZZZ` en el launcher), o usa `/confirm` en el servidor. ' +
  'Confirma solo inicios de sesión que tú mismo empezaste: nunca envíes un código que otra persona te haya dado.';

/**
 * Direct messages to the bot: a message that is only a sign-in code (4 digits, or a launcher serial) confirms that member's sign-in (slash
 * commands do not exist in DMs); anything else gets one short help reply per user per minute, so the bot
 * can never be talked into a loop. Guild messages are not handled here (the prefix handler owns them).
 */
export const createDirectMessageHandler = (helpCooldown: Cooldown = createCooldown(HELP_WINDOW_MS)) =>
  async (message: Message) => {
    if (message.author.bot || message.guildId !== null) return;

    const reply = (content: string) => message.reply({ content, allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});

    try {
      if (isLoginCode(message.content)) {
        const outcome = await confirmCode(message.author.id, message.content.trim());
        return await reply(confirmationMessage(outcome));
      }
      if (helpCooldown.tryAcquire(message.author.id)) await reply(DM_HELP);
    } catch (error) {
      await reply(userMessageFor(error, 'dm', 'DM'));
    }
  };
