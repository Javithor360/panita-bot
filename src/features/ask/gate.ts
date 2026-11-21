import type { KnownNames } from '../../services/knowledge';
import { fold } from './chatContext';

/**
 * Words that point at something the API knows: a player, an edition, a form, the gallery, the picks or the donors. Matched
 * on the folded question (no accents, lowercase). A hit only means "the router may find something to look up".
 */
const KEYWORDS: readonly RegExp[] = [
  /\bjugador(a|es|as)?\b/,
  /\bperfil(es)?\b/,
  /\bquien (es|fue|era)\b/,
  /\bquienes (son|fueron|estuvieron|participaron)\b/,
  /\bemblemas?\b/,
  /\btitulos?\b/,
  /\bediciones?\b/,
  /\bparticip(o|aron|antes|acion)\b/,
  /\bestuvo(n)? en\b/,
  /\bdur(o|acion)\b/,
  /\bcuanto tiempo\b/,
  /\bformularios?\b/,
  /\bencuestas?\b/,
  /\bfotos?\b/,
  /\bimagen(es)?\b/,
  /\blikes?\b/,
  /\bal azar\b/,
  /\bpanita del mes\b/,
  /\bdon(o|aron|ador|adores|adora)\b/,
  /\bcumple(anos)?\b/,
  /\bnacionalidad\b/,
  /\borientacion\b/,
  /\binstancias?\b/,
  /\bmodpacks?\b/,
  /\bign\b/,
];

/** Names shorter than this are too common to count as a hit (an edition called "2" would match half of the chat). */
const MIN_NAME_CHARS = 4;

const mentions = (folded: string, name: string): boolean => {
  const needle = fold(name).trim();
  return needle.length >= MIN_NAME_CHARS && new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(folded);
};

/**
 * Whether the question can need data of the API, decided with no call at all. When it does not, `/ask` works exactly as it
 * always did: no router, no read. The names of editions and forms are only known after the first read, so before it the
 * keywords decide alone.
 */
export const needsLookup = (question: string, known: KnownNames): boolean => {
  const folded = fold(question);
  if (KEYWORDS.some(pattern => pattern.test(folded))) return true;
  return known.editions.some(edition => mentions(folded, edition.name) || mentions(folded, edition.id))
    || known.forms.some(form => mentions(folded, form.title) || mentions(folded, form.slug));
};
