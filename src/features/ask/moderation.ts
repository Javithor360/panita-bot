/**
 * How strict `/ask` is with what people write. OpenAI's moderation flags a text for any of its categories, including
 * rude words and jokes between friends (a swear, "te mato", a flirt), and a refusal for each of those made the assistant
 * useless in a lively channel. So:
 * - `severe` (the default) only refuses what no friendly answer can fix: sexual content with minors, hate with threats and
 *   violent illegal instructions. Everything else is answered, and the rules of the assistant (no sexual content, no hate, no
 *   harassment of real people, kind with someone in distress) decide how.
 * - `strict` refuses whatever OpenAI flags, as before.
 * - `off` does not call the moderation at all.
 */
export const MODERATION_MODES = ['off', 'severe', 'strict'] as const;
export type ModerationMode = (typeof MODERATION_MODES)[number];

/** The categories of OpenAI's moderation that still refuse a question in `severe` mode. */
export const SEVERE_CATEGORIES: readonly string[] = ['sexual/minors', 'hate/threatening', 'illicit/violent'];

/** What to ask the moderation for: every flag (`strict`), only the severe categories (`severe`). `undefined` is every flag. */
export const categoriesFor = (mode: ModerationMode): readonly string[] | undefined => (mode === 'severe' ? SEVERE_CATEGORIES : undefined);
