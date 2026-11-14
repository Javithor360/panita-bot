import { PREFIX } from '../../config/constants';

/** Words that may follow the mention and are only the old way of starting a question: `@Panita Bot ask <question>`. */
const ASK_WORDS = ['ask', 'pregunta', 'preguntar'];

/**
 * The prefix command that a message mentioning the bot stands for (`!ask <question>`), or null when the message does
 * not start with a mention of the bot. Whatever follows the mention is the question, with or without the word
 * `ask`. The mention has to come first, so a message that merely quotes the bot somewhere is left alone, and a
 * mention with nothing after it does nothing.
 */
export const askFromMention = (content: string, botId: string | undefined): string | null => {
  if (!botId) return null;
  const match = new RegExp(`^\\s*<@!?${botId}>\\s*(?:(${ASK_WORDS.join('|')})(?=\\s|$))?\\s*([\\s\\S]*)$`, 'i').exec(content);
  if (!match) return null;
  const [, word, question] = match;
  // Only the mention: nothing to answer. With the word `ask` alone, the command shows how to use it
  if (!word && !question.trim()) return null;
  return `${PREFIX}ask ${question}`;
};
