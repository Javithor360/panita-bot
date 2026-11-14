import { PREFIX } from '../../config/constants';

/** The words after a mention of the bot that mean "ask". Only this command can be started by a mention. */
const ASK_WORDS = ['ask', 'pregunta', 'preguntar'];

/**
 * The prefix command that `@Panita Bot ask <question>` stands for (`!ask <question>`), or null when the message does
 * not start with a mention of the bot followed by one of the ask words. The mention has to come first, so a
 * message that merely quotes the bot somewhere is left alone.
 */
export const askFromMention = (content: string, botId: string | undefined): string | null => {
  if (!botId) return null;
  const match = new RegExp(`^\\s*<@!?${botId}>\\s+(${ASK_WORDS.join('|')})(?=\\s|$)\\s*([\\s\\S]*)$`, 'i').exec(content);
  return match ? `${PREFIX}ask ${match[2]}` : null;
};
