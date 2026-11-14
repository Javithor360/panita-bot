import { createHmac } from 'node:crypto';
import { URLS } from '../config/constants';
import { env } from '../config/env';
import { UserError } from '../core/errors';
import { checkQuestion, cleanAnswer, MAX_QUESTION_CHARS } from '../features/ask/guard';
import { findBlockedTerm, loadKnowledge } from '../features/ask/knowledge';
import { createAskLimits, type AskLimits } from '../features/ask/limits';
import { buildInstructions } from '../features/ask/prompt';
import { createOpenAiClient, OpenAiError, type OpenAiClient } from './openai';

export const ASK_MESSAGES = {
  unavailable: '❌ El asistente no está disponible en este momento.',
  empty: '❌ Escribe tu pregunta, por ejemplo: `/ask ¿Qué es Panitacraft?`',
  tooLong: `❌ Tu pregunta es muy larga: el máximo son ${MAX_QUESTION_CHARS} caracteres.`,
  cooldown: '⏳ Espera unos segundos antes de preguntarme otra vez.',
  daily: '⏳ Ya hiciste muchas preguntas hoy. Vuelve mañana y seguimos charlando.',
  global: '⏳ Hoy ya respondí muchísimas preguntas. Vuelve mañana.',
  busy: '⏳ Estoy atendiendo a varias personas a la vez. Inténtalo de nuevo en un momento.',
  flagged: '❌ No puedo ayudarte con eso.',
  failed: '❌ No pude responder ahora mismo. Inténtalo de nuevo en un momento.',
  /** For a question that names something that has not been announced: no model involved. */
  unannounced: '🤐 Eso aún no se ha anunciado. Por ahora solo puedo contarte lo que ya es público de Panitacraft.',
  noAnswer: '🤔 No supe cómo responder eso. ¿Puedes preguntármelo de otra forma?',
} as const;

export interface AskDeps {
  client: OpenAiClient;
  knowledge: string;
  blockedTerms: readonly string[];
  limits: AskLimits;
  /** Anonymous, stable id of a member for the provider; never the Discord id. */
  safetyIdOf(userId: string): string;
}

export interface AskService {
  /** The answer to post. Throws `UserError` with a message for the member whenever there is none. */
  ask(userId: string, rawQuestion: string): Promise<string>;
}

const LIMIT_MESSAGES = { cooldown: ASK_MESSAGES.cooldown, daily: ASK_MESSAGES.daily, global: ASK_MESSAGES.global, busy: ASK_MESSAGES.busy } as const;

/** What the member is told when the provider fails; the cause is logged without the question. */
const providerFailure = (error: OpenAiError): UserError => {
  if (error.failure === 'rejected' || error.failure === 'not_configured' || error.failure === 'quota') {
    // Not something that a second try fixes: a rejected key or permission, or the spending limit
    console.error(error.message);
    return new UserError(ASK_MESSAGES.unavailable);
  }
  console.warn(error.message);
  return new UserError(ASK_MESSAGES.failed);
};

let moderationWarned = false;

export const createAskService = (deps: AskDeps): AskService => {
  const instructions = buildInstructions(deps.knowledge);

  return {
    async ask(userId, rawQuestion) {
      if (!deps.client.configured) throw new UserError(ASK_MESSAGES.unavailable);

      const checked = checkQuestion(rawQuestion);
      if (!checked.ok) throw new UserError(checked.reason === 'empty' ? ASK_MESSAGES.empty : ASK_MESSAGES.tooLong);
      const { question } = checked;

      const verdict = deps.limits.tryAcquire(userId);
      if (verdict !== 'ok') throw new UserError(LIMIT_MESSAGES[verdict]);

      try {
        // Answered without the model, so nothing about it can leak
        if (findBlockedTerm(question, deps.blockedTerms)) return ASK_MESSAGES.unannounced;

        try {
          if (await deps.client.flagged(question)) throw new UserError(ASK_MESSAGES.flagged);
        } catch (error) {
          if (!(error instanceof OpenAiError)) throw error;
          // The model has its own rules, so a failing moderation does not stop the command; it is reported once
          if (!moderationWarned) {
            moderationWarned = true;
            console.warn(`${error.message} (moderation skipped; further failures are not logged)`);
          }
        }

        let answer: string;
        try {
          answer = await deps.client.answer({ instructions, input: question, safetyId: deps.safetyIdOf(userId) });
        } catch (error) {
          if (!(error instanceof OpenAiError)) throw error;
          deps.limits.refund(userId);
          throw providerFailure(error);
        }

        return cleanAnswer(answer, { knowledge: deps.knowledge, blockedTerms: deps.blockedTerms }) ?? ASK_MESSAGES.noAnswer;
      } finally {
        deps.limits.release();
      }
    },
  };
};

let service: AskService | null = null;

/**
 * The service of the running bot, built on first use. Without a key it answers that it is not available; a
 * knowledge file that cannot be used turns `/ask` off (and says why in the log) instead of stopping the bot.
 */
export const getAskService = (): AskService => {
  if (service) return service;

  const client = createOpenAiClient({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL, baseUrl: URLS.openai });
  let knowledge = '';
  let usable = client.configured;
  if (usable) {
    try {
      knowledge = loadKnowledge(env.ASK_BLOCKED_TERMS);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      usable = false;
    }
  }

  const hmacKey = env.OPENAI_API_KEY ?? 'unconfigured';
  service = createAskService({
    client: usable ? client : { ...client, configured: false },
    knowledge,
    blockedTerms: env.ASK_BLOCKED_TERMS,
    limits: createAskLimits({
      cooldownMs: env.ASK_COOLDOWN_SECONDS * 1000,
      dailyPerUser: env.ASK_DAILY_LIMIT,
      dailyGlobal: env.ASK_GLOBAL_DAILY_LIMIT,
      maxInFlight: 5,
    }),
    safetyIdOf: userId => createHmac('sha256', hmacKey).update(userId).digest('hex').slice(0, 32),
  });
  return service;
};
