import { findBlockedTerm } from './knowledge';
import { cleanName } from './names';

/** Lowercase without accents, to match the words people use. */
const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Words that ask to choose, to like most or to like least. */
const CHOOSING = /\b(favorit[oa]s?|preferid[oa]s?|menos favorit[oa]s?|odias|detestas|elegir|elegirias|escoger|escogerias|eliges|escoges|quedarias|te quedas|mejor|peor)\b|\b(te )?(cae|caen) (mejor|peor|bien|mal|mas|menos)\b|\b(menos|mas) te (cae|caen)\b/;
/** Words that say the choice is about a person of the server. */
const PEOPLE = /\b(miembro|miembros|persona|personas|gente|usuario|usuarios|alguien|quien|jugador|jugadores|panita|panitas|amigo|amigos|del server|del servidor|del canal|del chat|presentes)\b/;

/** Whether the question asks the assistant to pick a person (a favorite, a least favorite, who it would stay with). */
export const asksToPickPerson = (question: string): boolean => {
  const folded = fold(question);
  return CHOOSING.test(folded) && PEOPLE.test(folded);
};

/** How many names are considered, so a big channel does not make a big request. */
export const MAX_CANDIDATES = 50;

/**
 * The person the assistant "picked by chance" for a question like that: a random one of the people around, so the
 * pick changes from one question to the next (a model alone tends to pick the same every time). Names are cleaned,
 * and one with a blocked term is never offered. Null when the question is not about a person or nobody is around.
 */
export const rollPerson = (
  question: string,
  people: readonly string[],
  blockedTerms: readonly string[],
  random: () => number = Math.random,
): string | null => {
  if (!asksToPickPerson(question)) return null;
  const names = [...new Set(people.map(cleanName).filter(name => name && !findBlockedTerm(name, blockedTerms)))].slice(0, MAX_CANDIDATES);
  if (names.length === 0) return null;
  return names[Math.min(names.length - 1, Math.floor(random() * names.length))];
};
