import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildTezzlarKnowledge } from './tezzlarKnowledge';

/** `config/panitacraft-knowledge.md`: the source and the build are both three folders below the project. */
export const KNOWLEDGE_FILE = path.resolve(__dirname, '../../../config/panitacraft-knowledge.md');

/** The first blocked term the text contains (compared in lowercase), or null. */
export const findBlockedTerm = (text: string, blockedTerms: readonly string[]): string | null => {
  const lowered = text.toLowerCase();
  return blockedTerms.find(term => lowered.includes(term)) ?? null;
};

/**
 * Everything `/ask` knows about Panitacraft. A file that mentions a blocked term is refused: whatever is in the
 * file is sent to OpenAI and can end up in an answer, so a slip while editing it must not go live.
 */
export const parseKnowledge = (source: string, blockedTerms: readonly string[]): string => {
  const knowledge = source.trim();
  if (!knowledge) throw new Error('[Ask] The knowledge file is empty');
  if (findBlockedTerm(knowledge, blockedTerms)) {
    throw new Error('[Ask] The knowledge file contains a blocked term; remove it before enabling /ask');
  }
  return knowledge;
};

/** The knowledge file, followed by what the commands about Tezzlar III know (built from their data). */
export const loadKnowledge = (blockedTerms: readonly string[], file = KNOWLEDGE_FILE): string =>
  parseKnowledge(`${readFileSync(file, 'utf8')}\n\n${buildTezzlarKnowledge()}`, blockedTerms);
