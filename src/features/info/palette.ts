/** Noa colored its embeds with a random pastel; these are the shades it liked (its blue, orange, green, pink and purple families). */
export const PASTELS = [
  0xb3c9ff, 0xabb3ed, 0xa0abfa, 0xa3a0e8, 0x938ef5,
  0xffd7ba, 0xffc296, 0xffb078,
  0xd5ffbc, 0xc4ffa3, 0xb6ff8c, 0xa1fc6c,
  0xffbdd5, 0xffa6c6, 0xff8cb6,
  0xc188f7, 0xd8b4fe, 0xfcfaa1, 0x91ffff,
] as const;

/** A random pastel. The random source is injected so tests can pick one. */
export const pastel = (random: () => number = Math.random): number => PASTELS[Math.floor(random() * PASTELS.length)];
