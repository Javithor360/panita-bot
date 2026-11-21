import type { BotEditionItem, BotForm } from '../../lib/api/types';
import { fold } from './chatContext';

/** What the router may ask the bot to read. Nothing else exists: the model never calls anything itself. */
export const LOOKUP_KINDS = [
  'player', 'player_top_photo', 'player_random_photo', 'edition', 'editions_list', 'form', 'forms_list', 'panita_picks', 'donors', 'instances',
] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];

export const MAX_LOOKUPS = 3;
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;
const IGN_PATTERN = /^[A-Za-z0-9_.-]{1,32}$/;
/** What the router may say about a name of an edition or a form: short, and never a path. */
const MAX_NAME_CHARS = 80;

/** A lookup as the router wrote it, after the shape and the plain values were checked (edition and form names are still free text). */
export type RequestedLookup =
  | { kind: 'player' | 'player_top_photo' | 'player_random_photo'; ign: string }
  | { kind: 'edition' | 'form'; name: string }
  | { kind: 'panita_picks'; year: number | null }
  | { kind: 'editions_list' | 'forms_list' | 'donors' | 'instances' };

/** A lookup that is ready to run: every value was checked, and a name was matched against the lists of the API. */
export type Lookup =
  | { kind: 'player' | 'player_top_photo' | 'player_random_photo'; ign: string }
  | { kind: 'edition'; id: string; name: string }
  | { kind: 'form'; slug: string }
  | { kind: 'panita_picks'; year: number | null }
  | { kind: 'editions_list' | 'forms_list' | 'donors' | 'instances' };

/** The strict JSON schema of the router's answer. Every field is required (strict mode) and null when it does not apply. */
export const ROUTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lookups'],
  properties: {
    lookups: {
      type: 'array',
      maxItems: MAX_LOOKUPS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'ign', 'name', 'year'],
        properties: {
          kind: { type: 'string', enum: [...LOOKUP_KINDS] },
          ign: { type: ['string', 'null'] },
          name: { type: ['string', 'null'] },
          year: { type: ['integer', 'null'] },
        },
      },
    },
  },
} as const;

const isKind = (value: unknown): value is LookupKind => typeof value === 'string' && (LOOKUP_KINDS as readonly string[]).includes(value);

const cleanIgn = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const ign = value.trim().replace(/^@/, '');
  return IGN_PATTERN.test(ign) ? ign : null;
};

const cleanName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim();
  return name && name.length <= MAX_NAME_CHARS ? name : null;
};

const sameLookup = (a: RequestedLookup, b: RequestedLookup): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The lookups the router asked for, checked. Whatever is not valid is dropped (an unknown kind, a name that is not an ign,
 * a year out of range), repeats are dropped, and no more than three are kept. The router's output is untrusted text.
 */
export const parseRouterOutput = (raw: unknown): RequestedLookup[] => {
  const items = typeof raw === 'object' && raw !== null ? (raw as { lookups?: unknown }).lookups : undefined;
  if (!Array.isArray(items)) return [];

  const found: RequestedLookup[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const { kind, ign, name, year } = item as Record<string, unknown>;
    if (!isKind(kind)) continue;

    let lookup: RequestedLookup | null = null;
    if (kind === 'player' || kind === 'player_top_photo' || kind === 'player_random_photo') {
      const valid = cleanIgn(ign);
      if (valid) lookup = { kind, ign: valid };
    } else if (kind === 'edition' || kind === 'form') {
      const valid = cleanName(name);
      if (valid) lookup = { kind, name: valid };
    } else if (kind === 'panita_picks') {
      if (year === null || year === undefined) lookup = { kind, year: null };
      else if (typeof year === 'number' && Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR) lookup = { kind, year };
    } else {
      lookup = { kind };
    }
    if (lookup && !found.some(other => sameLookup(other, lookup))) found.push(lookup);
    if (found.length === MAX_LOOKUPS) break;
  }
  return found;
};

const ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix'] as const;

/** A name to compare: no accents or case, and a lone digit 1 to 9 written as a roman numeral ("Tezzlar 3" is "Tezzlar III"). */
const comparable = (name: string): string =>
  fold(name).replace(/(?<![\d.])([1-9])(?![\d.])/g, (_, digit: string) => ROMAN[Number(digit)]).replace(/[^a-z0-9. ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The item a name points at: an exact match of any of its names first, then the only item whose name contains the text
 * (the text is a piece of that name). Several candidates are not guessed: the answer is `null`.
 */
export const matchByName = <T>(name: string, items: readonly T[], namesOf: (item: T) => readonly string[]): T | null => {
  const wanted = comparable(name);
  if (!wanted) return null;

  const exact = items.filter(item => namesOf(item).some(candidate => comparable(candidate) === wanted));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const loose = items.filter(item => namesOf(item).some(candidate => {
    // Only "the text is a piece of the name": a longer text may be another edition that does not exist ("Tezzlar IV")
    return wanted.length >= 3 && comparable(candidate).includes(wanted);
  }));
  return loose.length === 1 ? loose[0] : null;
};

/** The edition a name points at, among the public ones the API listed (a private edition is never in the list). */
export const matchEdition = (name: string, editions: readonly BotEditionItem[]): BotEditionItem | null =>
  matchByName(name, editions, edition => [edition.name, edition.id]);

export const matchForm = (name: string, forms: readonly BotForm[]): BotForm | null =>
  matchByName(name, forms, form => [form.title, form.slug]);
