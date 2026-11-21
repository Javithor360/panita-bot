import { createTtlCache } from '../../lib/ttlCache';

/** One question of a member and what the assistant answered. */
export interface Turn {
  question: string;
  answer: string;
}

/** How long a conversation can be continued after the last answer, and how many exchanges are remembered. */
export const CONVERSATION_TTL_MS = 10 * 60_000;
export const MAX_TURNS = 6;
/** An old answer is kept only up to this long, so a long chat never makes a long request. */
const MAX_REMEMBERED_ANSWER_CHARS = 1200;

export interface Conversations {
  /** Remembers the exchanges that lead to the answer with this message id (the last `MAX_TURNS` of them). */
  remember(messageId: string, turns: readonly Turn[]): void;
  /** The exchanges before this message, oldest first; none when it is not an answer of the assistant or is too old. */
  recall(messageId: string | null | undefined): Turn[];
}

/**
 * Lets a reply to an answer of the assistant continue the talk. Memory only and keyed by the id of the answer's
 * message: nothing is stored anywhere else, and a restart forgets it all. Anyone can reply to an answer.
 */
export const createConversations = (
  ttlMs = CONVERSATION_TTL_MS,
  maxTurns = MAX_TURNS,
  now: () => number = Date.now,
): Conversations => {
  const cache = createTtlCache<Turn[]>(ttlMs, now);

  return {
    remember(messageId, turns) {
      const kept = turns.slice(-maxTurns).map(turn => ({
        question: turn.question,
        answer: turn.answer.length > MAX_REMEMBERED_ANSWER_CHARS
          ? `${turn.answer.slice(0, MAX_REMEMBERED_ANSWER_CHARS - 1).trimEnd()}…`
          : turn.answer,
      }));
      cache.set(messageId, kept);
    },

    recall(messageId) {
      return messageId ? [...(cache.get(messageId) ?? [])] : [];
    },
  };
};

/** The conversations of the running bot. */
export const conversations = createConversations();
