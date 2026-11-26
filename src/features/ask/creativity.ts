/** Lowercase without accents, to match the words people use. */
const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Questions that ask for an opinion, a rating, a comparison or a roast ("del 1 al 10 qué tan chad es Ana", "qué opinas de
 * Beto"). Factual questions are not among them: they must not get a comedic angle.
 */
const OPINION: readonly RegExp[] = [
  /\bdel (1|uno) al (10|diez)\b/,
  /\b(1|uno) (a|al|hasta) (10|diez)\b/,
  /\b\d{1,2} ?\/ ?10\b/,
  /\bque tan\b/,
  /\bque (opinas|piensas|opinion tienes|te parece|tal es|tal ves)\b/,
  /\b(opinion|opinas|piensas) (de|sobre|acerca de)\b/,
  /\bcomo (ves|calificas|evaluas) a\b/,
  /\b(califica|calificame|puntua|puntuame|evalua|rankea|ranking|roastea|roast|rate)\b/,
  /\bquien es (mas|menos|mejor|peor)\b/,
  /\bes (mas|menos) \w+ que\b/,
  /\b(que|cuan|cuanto) (chad|sigma|gay|crack|pro|noob|gracioso|feo|lindo|guapo|inteligente|tonto|bueno|malo)\b/,
];

/** Whether the question asks for an opinion, a rating, a comparison or a roast. */
export const asksForOpinion = (question: string): boolean => {
  const folded = fold(question);
  return OPINION.some(pattern => pattern.test(folded));
};

/**
 * Ways to be funny, all obviously fiction. The model alone, asked to rate someone it knows nothing about, falls back to
 * the name ("sounds like a final boss") every time; a random angle chosen by the bot makes the answers differ by
 * construction, because the model cannot be asked for more randomness (`gpt-6-luna` refuses `temperature`).
 */
export const ANGLES: readonly string[] = [
  'a fake RPG character sheet with absurd stats and a ridiculous class',
  'a nature documentary narrator who has just spotted the creature in the wild',
  'a very serious, overly formal product review',
  'a sports commentator calling the final of a championship',
  'a conspiracy theory with "evidence"',
  'an unreliable witness testifying at a trial',
  'a weather forecast for their personality',
  'a horoscope that is far too specific',
  'the dramatic announcement of a telenovela',
  'a customer-service complaint that turns into praise halfway through',
  'the patch notes of a made-up video game (what was buffed, what was nerfed)',
  'the abstract of a scientific paper with a ridiculous finding',
  'a movie trailer voice-over',
  'a rating given in an absurd unit of measurement',
  'a proclamation read by a medieval town crier',
  'a noir detective narrating the case',
  'a travel brochure for their personality',
  'the stats of a Minecraft mob: what it drops, where it spawns, what it fears',
  'the verdict of a tiny, biased jury of chickens',
  'a cringey LinkedIn post announcing the news',
  "a pirate captain's log entry",
  'an airport announcement about their arrival',
  'a nutrition label listing what they are made of',
  'a tutorial for dealing with them, step by step',
  'a mock-serious entry of a field guide to rare creatures',
];

/**
 * The comedic angle rolled for a question that asks for an opinion, or `null` for any other question. It changes from one
 * question to the next, whatever the model would have chosen.
 */
export const rollAngle = (question: string, random: () => number = Math.random): string | null => {
  if (!asksForOpinion(question)) return null;
  return ANGLES[Math.min(ANGLES.length - 1, Math.floor(random() * ANGLES.length))];
};

/** What is told to the model about the rolled angle. */
export const angleLine = (angle: string | null): string | null =>
  angle
    ? `[STYLE ROLL: for this answer take this comedic angle: ${angle}. It is only the style, and it is obviously fiction: the facts, the limits and what you may say about people stay exactly the same]`
    : null;
