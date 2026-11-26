import { createHmac } from 'node:crypto';
import { URLS } from '../config/constants';
import { env } from '../config/env';
import { UserError } from '../core/errors';
import { checkQuestion, cleanAnswer, extractActions, MAX_QUESTION_CHARS } from '../features/ask/guard';
import { emojiNames, expandEmojis, type ServerEmoji } from '../features/ask/emojis';
import { cleanChat, composeInput, memberLine, todayLine, type ChatLine } from '../features/ask/chatContext';
import type { Turn } from '../features/ask/conversations';
import { rollPerson } from '../features/ask/pick';
import { buildDataBlock, type LookupResult } from '../features/ask/data';
import { needsLookup } from '../features/ask/gate';
import { findBlockedTerm, loadKnowledge } from '../features/ask/knowledge';
import { createAskLimits, type AskLimits } from '../features/ask/limits';
import { buildInstructions } from '../features/ask/prompt';
import { routeQuestion } from '../features/ask/router';
import { runLookups } from '../features/ask/run';
import { createCallBudget, getKnowledge, type Knowledge } from './knowledge';
import { createOpenAiClient, OpenAiError, type OpenAiClient } from './openai';

export const ASK_MESSAGES = {
  unavailable: 'No puedo responder eso en este momento. Inténtalo más tarde.',
  empty: 'Escribe tu pregunta, por ejemplo: `/ask ¿Qué es Panitacraft?`',
  tooLong: `Tu pregunta es muy larga: el máximo son ${MAX_QUESTION_CHARS} caracteres.`,
  cooldown: 'Espera unos segundos antes de preguntarme otra vez.',
  daily: 'Ya hiciste muchas preguntas hoy. Vuelve mañana y seguimos charlando.',
  global: 'Hoy ya respondí muchísimas preguntas. Vuelve mañana.',
  busy: 'Estoy atendiendo a varias personas a la vez. Inténtalo de nuevo en un momento.',
  flagged: 'No puedo ayudarte con eso.',
  failed: 'No pude responder ahora mismo. Inténtalo de nuevo en un momento.',
  /** For a question that names something that has not been announced: no model involved. */
  /** Stands for the question in the history when it named something that was not announced. */
  unannouncedQuestion: '(una pregunta sobre algo que aún no se anuncia)',
  unannounced: '🤐 Eso aún no se ha anunciado. Por ahora solo puedo contarte lo que ya es público de Panitacraft.',
  noAnswer: '🤔 No supe cómo responder eso. ¿Puedes preguntármelo de otra forma?',
  /** When the model asked for a photo and wrote nothing else. */
  photoOnly: '📸 ¡Mira lo que encontré en la galería!',
} as const;

export interface AskDeps {
  client: OpenAiClient;
  knowledge: string;
  blockedTerms: readonly string[];
  limits: AskLimits;
  /** Anonymous, stable id of a member for the provider; never the Discord id. */
  safetyIdOf(userId: string): string;
  /** A number in [0, 1) for the dice; `Math.random` when not given. */
  random?: () => number;
  /** What the assistant may read of Panitacraft (players, editions, forms...). Without it no question is looked up. */
  data?: Knowledge;
  /** The clock of the durations written in the data. */
  now?: () => Date;
}

export interface AskAnswer {
  /** The text to post. */
  text: string;
  /** The member asked for a random photo of the gallery, the only thing the assistant can ask the bot to do. */
  photo: boolean;
  /** When the photo must be one of a member (the ign), as the data said; null for any photo of the gallery. */
  photoOf: string | null;
  /** This exchange as it is remembered for the next reply: the question and the text as the model wrote it (no emojis). */
  turn: Turn;
}

export interface AskService {
  /** The answer to post. Throws `UserError` with a message for the member whenever there is none. */
  /** `history` holds the exchanges before this question when it continues a talk (oldest first). */
  /** `chat` holds the recent messages the member may be asking about (the service cleans and limits them). */
  ask(
    userId: string,
    rawQuestion: string,
    emojis?: readonly ServerEmoji[],
    history?: readonly Turn[],
    chat?: readonly ChatLine[],
    /** Names of people around in the channel, for a question that asks to pick one (the service rolls the dice). */
    people?: readonly string[],
    /** What to call the member (their name in the server), so the assistant can talk to them and poke at them. */
    asker?: string,
  ): Promise<AskAnswer>;
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

/**
 * The moderation is free and now and then fails once for no lasting reason (a bare 403 from the edge, a timeout), so it
 * is tried a second time before giving up. A missing key or an exhausted spending limit is not retried.
 */
const flaggedWithRetry = async (client: OpenAiClient, text: string): Promise<boolean> => {
  try {
    return await client.flagged(text);
  } catch (error) {
    if (!(error instanceof OpenAiError) || error.failure === 'not_configured' || error.failure === 'quota') throw error;
    return client.flagged(text);
  }
};

export const createAskService =(deps: AskDeps): AskService => {
  // The instructions only change when the server's emojis do, so they are built once for each set of names
  let built = { key: '', instructions: buildInstructions(deps.knowledge) };
  const instructionsFor = (names: readonly string[]): string => {
    const key = names.join(',');
    if (key !== built.key) built = { key, instructions: buildInstructions(deps.knowledge, names) };
    return built.instructions;
  };

  /**
   * What the question needs from the database: nothing (no keyword, no router call and no API call, exactly as before), or
   * a `[DATOS]` block. A router or API failure is told to the model as a failed lookup, never hidden and never invented.
   */
  const lookupFor = async (userId: string, question: string): Promise<{ block: string | null; photoOf: string | null }> => {
    const knowledge = deps.data;
    if (!knowledge) return { block: null, photoOf: null };
    // Until the lists of editions and forms are read the gate only has its keywords; a failed read is tried again next time
    if (knowledge.known().editions.length === 0) void knowledge.warm();
    if (!needsLookup(question, knowledge.known())) return { block: null, photoOf: null };

    let results: LookupResult[];
    let photoOf: string | null = null;
    try {
      const requested = await routeQuestion(deps.client, question, deps.safetyIdOf(userId));
      if (requested.length === 0) return { block: null, photoOf: null };
      ({ results, photoOf } = await runLookups(requested, { knowledge, now: deps.now }, createCallBudget()));
    } catch (error) {
      console.warn(error instanceof OpenAiError ? error.message : '[Ask] The lookup of the question failed');
      results = [{ kind: 'failed', reason: 'unavailable' }];
    }
    return { block: buildDataBlock(results, deps.blockedTerms, deps.now?.()), photoOf };
  };

  return {
    async ask(userId, rawQuestion, emojis = [], history = [], chat = [], people = [], asker) {
      if (!deps.client.configured) throw new UserError(ASK_MESSAGES.unavailable);

      const checked = checkQuestion(rawQuestion);
      if (!checked.ok) throw new UserError(checked.reason === 'empty' ? ASK_MESSAGES.empty : ASK_MESSAGES.tooLong);
      const { question } = checked;
      // Messages with a blocked term never reach the model, just like a question with one
      const quoted = cleanChat(chat, deps.blockedTerms);
      // For "who is your favorite", the person is rolled here, so it changes every time and does not depend on the model
      const dice = rollPerson(question, people, deps.blockedTerms, deps.random);

      const verdict = deps.limits.tryAcquire(userId, history.length > 0 ? 'reply' : 'new');
      if (verdict !== 'ok') throw new UserError(LIMIT_MESSAGES[verdict]);

      try {
        // Answered without the model, so nothing about it can leak
        // The question is not kept either: a later reply would send it to the model
        if (findBlockedTerm(question, deps.blockedTerms)) {
          return { text: ASK_MESSAGES.unannounced, photo: false, photoOf: null, turn: { question: ASK_MESSAGES.unannouncedQuestion, answer: ASK_MESSAGES.unannounced } };
        }

        // A question is never answered unchecked: when the moderation cannot run, the member is told so
        try {
          // The quoted chat is checked with the question: what the model reads is what is moderated
          const checked = [...quoted.map(line => line.text), question].join('\n');
          if (await flaggedWithRetry(deps.client, checked)) throw new UserError(ASK_MESSAGES.flagged);
        } catch (error) {
          if (!(error instanceof OpenAiError)) throw error;
          deps.limits.refund(userId);
          throw providerFailure(error);
        }

        // The router and the reads count under the same cooldown, daily limit and in-flight slot as the question itself
        const data = await lookupFor(userId, question);

        let answer: string;
        try {
          answer = await deps.client.answer({
            instructions: instructionsFor(emojiNames(emojis)),
            // The date lets it say whether something already opened; the name lets it talk to the member, not about a stranger
            input: composeInput(question, quoted, dice, data.block, [todayLine(deps.now?.() ?? new Date(), env.BIRTHDAY_UTC_OFFSET_HOURS), memberLine(asker, deps.blockedTerms)]),
            history,
            safetyId: deps.safetyIdOf(userId),
          });
        } catch (error) {
          if (!(error instanceof OpenAiError)) throw error;
          deps.limits.refund(userId);
          throw providerFailure(error);
        }

        // The marker is read before the clean-up and never reaches the channel; a blocked term cancels the photo too
        const { text, photo } = extractActions(answer);
        // The links of the data (a form, a photo) are the bot's own, so they are allowed like the ones of the knowledge
        const cleaned = cleanAnswer(text, { knowledge: data.block ? `${deps.knowledge}\n${data.block}` : deps.knowledge, blockedTerms: deps.blockedTerms });
        const photoOf = photo ? data.photoOf : null;
        if (cleaned === null) {
          const refused = findBlockedTerm(text, deps.blockedTerms) !== null;
          const shown = photo && !refused ? { text: ASK_MESSAGES.photoOnly, photo, photoOf } : { text: ASK_MESSAGES.noAnswer, photo: false, photoOf: null };
          return { ...shown, turn: { question, answer: shown.text } };
        }
        return { text: expandEmojis(cleaned, emojis), photo, photoOf, turn: { question, answer: cleaned } };
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

  const client = createOpenAiClient({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    baseUrl: URLS.openai,
    routerModel: env.ASK_ROUTER_MODEL,
    routerMaxOutputTokens: env.ASK_ROUTER_MAX_TOKENS,
    maxOutputTokens: env.ASK_MAX_OUTPUT_TOKENS,
    timeoutMs: env.ASK_TIMEOUT_SECONDS * 1000,
    reasoningEffort: env.ASK_REASONING_EFFORT === 'off' ? undefined : env.ASK_REASONING_EFFORT,
    temperature: env.ASK_TEMPERATURE,
  });
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
      replyCooldownMs: env.ASK_REPLY_COOLDOWN_SECONDS * 1000,
      dailyPerUser: env.ASK_DAILY_LIMIT,
      dailyGlobal: env.ASK_GLOBAL_DAILY_LIMIT,
      maxInFlight: 5,
    }),
    safetyIdOf: userId => createHmac('sha256', hmacKey).update(userId).digest('hex').slice(0, 32),
    data: getKnowledge(),
  });
  return service;
};
