/**
 * Noa's smart user detector, the part that decides who a name means: a case- and accent-insensitive match over the
 * names a member goes by. An exact match beats one that starts with the text, which beats one that only contains it.
 */

/** Someone the name search can find: a member of the server and the names they go by. */
export interface LookupMember {
  id: string;
  username: string;
  globalName: string | null;
  nickname: string | null;
  /** What the server shows for them: the nickname, else the global name, else the username. */
  displayName: string;
}

export const EXACT = 3;
export const PREFIX = 2;
export const CONTAINS = 1;

/** Lowercase, without accents and without a leading `@`, so `Ángel`, `angel` and `@ANGEL` are the same. */
export const normalize = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/^@/, '').trim();

const namesOf = (member: LookupMember) =>
  [member.username, member.globalName, member.nickname, member.displayName]
    .filter((name): name is string => !!name)
    .map(normalize)
    .filter(Boolean);

/** How well a member matches: 3 exact, 2 starts with, 1 contains, 0 not at all (the best of their names counts). */
export const matchScore = (query: string, member: LookupMember): number => {
  const wanted = normalize(query);
  if (!wanted) return 0;
  let best = 0;
  for (const name of namesOf(member)) {
    if (name === wanted) return EXACT;
    if (name.startsWith(wanted)) best = Math.max(best, PREFIX);
    else if (name.includes(wanted)) best = Math.max(best, CONTAINS);
  }
  return best;
};

export interface Ranked {
  member: LookupMember;
  score: number;
}

/** The members that match, best first; ties go to the shorter name, then alphabetically. */
export const rankMembers = (query: string, members: Iterable<LookupMember>): Ranked[] => {
  const seen = new Set<string>();
  const ranked: Ranked[] = [];
  for (const member of members) {
    if (seen.has(member.id)) continue;
    seen.add(member.id);
    const score = matchScore(query, member);
    if (score > 0) ranked.push({ member, score });
  }
  return ranked.sort(
    (a, b) =>
      b.score - a.score
      || a.member.displayName.length - b.member.displayName.length
      || a.member.displayName.localeCompare(b.member.displayName),
  );
};
