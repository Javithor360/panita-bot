export const englishToGalactic: Record<string, string> = {
  a: 'ᔑ', b: 'ʖ', c: 'ᓵ', d: '↸', e: 'ᒷ', f: '⎓', g: '⊣', h: '⍑',
  i: '╎', j: '⋮', k: 'ꖌ', l: 'ꖎ', m: 'ᒲ', n: 'リ', o: '𝙹', p: '!¡',
  q: 'ᑑ', r: '∷', s: 'ᓭ', t: 'ℸ ̣', u: '⚍', v: '⍊', w: '∴', x: '̇/',
  y: 'ǁ', z: '⨅'
};

export const galacticToEnglish: Record<string, string> = {};
for (const [key, value] of Object.entries(englishToGalactic)) {
  galacticToEnglish[value] = key;
}

export function toGalactic(text: string): string {
  return text.toLowerCase().split('').map(char => englishToGalactic[char] || char).join('');
}

export function fromGalactic(text: string): string {
  let decoded = text;
  // Sort by length descending to match multi-character sequences first (e.g., !¡, ℸ ̣, ̇/)
  const entries = Object.entries(galacticToEnglish).sort((a, b) => b[0].length - a[0].length);
  
  for (const [galacticChar, englishChar] of entries) {
    // Escape galactic char for regex just in case
    const regex = new RegExp(galacticChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    decoded = decoded.replace(regex, englishChar);
  }
  return decoded;
}
