import { MessageFlags, type ButtonInteraction, type ModalSubmitInteraction } from 'discord.js';
import { button, modal } from '../../core/command';
import { PASSWORD_INPUT, PASSWORD_RULE_MESSAGES } from '../../lib/registration';
import { completeReset, ignoreReset, ResetNotAvailableError, ResetNotReadyError } from '../../services/passwordResets';
import { InvalidActivationError, NotActivatedError } from '../../services/users';
import { buildResetModal, endPayload, RESET_ACTIONS, RESET_MESSAGES, type ResetEnd, type ResetPlace } from './view';

/** What came of a member typing their new password. */
export type ResetAttempt = 'completed' | 'unavailable' | 'length' | 'special' | 'not_activated' | 'not_ready';

/**
 * Replaces the password with the one typed. The expected rejections become an attempt; `length` and `special`
 * leave the request open for another try. Anything else (the API is down) is thrown for the router to report.
 */
export const attemptReset = async (requestId: string, discordId: string, password: string): Promise<ResetAttempt> => {
  try {
    await completeReset(requestId, discordId, password);
    return 'completed';
  } catch (error) {
    if (error instanceof ResetNotAvailableError) return 'unavailable';
    if (error instanceof NotActivatedError) return 'not_activated';
    if (error instanceof ResetNotReadyError) return 'not_ready';
    if (error instanceof InvalidActivationError && (error.reason === 'length' || error.reason === 'special')) return error.reason;
    throw error;
  }
};

/** What the member is told, privately, for an attempt that left the request open. */
const RETRY_MESSAGES = {
  length: PASSWORD_RULE_MESSAGES.length,
  special: PASSWORD_RULE_MESSAGES.special,
  not_activated: RESET_MESSAGES.notActivated,
  not_ready: RESET_MESSAGES.notReady,
} as const;

const placeOf = (interaction: ButtonInteraction | ModalSubmitInteraction): ResetPlace => (interaction.inGuild() ? 'channel' : 'dm');

/** A request message in the public channel is edited to a neutral card; the member's own answer is private. */
const closeRequestMessage = (interaction: ModalSubmitInteraction, end: ResetEnd) =>
  interaction.message?.edit(endPayload('channel', end)).catch(error => {
    console.error('[Password-Reset] Could not edit the request message:', error);
  });

const MISSING_REQUEST = { content: 'Este botón ya no está disponible.', flags: MessageFlags.Ephemeral } as const;

/**
 * The buttons and the form of a password reset request, added to `/register`'s components (the router
 * needs a command as the namespace). Every id carries the request id and its owner, so the router lets only
 * that member use them; everything the member sees after the click is private or has no secret in it.
 */
export const passwordResetComponents = {
  // Args: request id. The form must be the first answer, so nothing is asked of the API here.
  [RESET_ACTIONS.reset]: button({
    run: async (interaction, [requestId]) => {
      if (!requestId) return interaction.reply(MISSING_REQUEST);
      await interaction.showModal(buildResetModal(requestId, interaction.user.id));
    },
  }),

  // Args: request id
  [RESET_ACTIONS.submit]: modal({
    async run(interaction, [requestId]) {
      if (!requestId) return interaction.reply({ content: 'Este formulario ya no está disponible.', flags: MessageFlags.Ephemeral });
      const password = interaction.fields.getTextInputValue(PASSWORD_INPUT);
      const place = placeOf(interaction);

      // In DMs the request message itself is the answer; in the channel the answer must be private
      if (place === 'dm') await interaction.deferUpdate();
      else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const tell = (content: string) => (place === 'dm' ? interaction.followUp({ content }) : interaction.editReply({ content }));

      const attempt = await attemptReset(requestId, interaction.user.id, password);
      if (attempt !== 'completed' && attempt !== 'unavailable') return tell(RETRY_MESSAGES[attempt]);

      const end: ResetEnd = attempt;
      if (place === 'dm') return interaction.editReply(endPayload('dm', end));
      await closeRequestMessage(interaction, end);
      await interaction.editReply({ content: RESET_MESSAGES[end] });
    },
  }),

  // Args: request id
  [RESET_ACTIONS.ignore]: button({
    async run(interaction, [requestId]) {
      if (!requestId) return interaction.reply(MISSING_REQUEST);
      await interaction.deferUpdate();

      let end: ResetEnd = 'ignored';
      try {
        await ignoreReset(requestId, interaction.user.id);
      } catch (error) {
        // Not recorded as delivered yet: the buttons stay, and pressing again in a moment works
        if (error instanceof ResetNotReadyError) return interaction.followUp({ content: RESET_MESSAGES.notReady });
        if (!(error instanceof ResetNotAvailableError)) throw error;
        end = 'unavailable';
      }
      await interaction.editReply(endPayload(placeOf(interaction), end));
    },
  }),
};
