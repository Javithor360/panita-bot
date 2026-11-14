import { enchantmentLevels } from '../../data/enchantments';
import { customFoods, vanillaFoods } from '../../data/food';
import { minieventsData } from '../../data/minievents';
import { recipesData } from '../../data/recipes';
import { serverCommands } from '../../data/serverCommands';
import { tezzlarDays } from '../../data/tezzlar';

/**
 * What the commands about Tezzlar III show, as plain text for the assistant. It is built from the same data as the
 * commands, so the two cannot disagree and there is nothing to copy when the data changes. Tezzlar III is over: all
 * of it is public.
 */

/** A blank character used as padding in the Discord embeds. By code point, to keep it visible in the source. */
const BLANK_PADDING = String.fromCodePoint(0x2800);

/** Discord markdown (quotes, bold, escapes, bullets) turned into plain text. */
export const plain = (text: string): string =>
  text
    .split(BLANK_PADDING).join('')
    .replace(/^>>> ?/gm, '')
    .replace(/\\([\\\-_*~`>|])/g, '$1')
    .replace(/[*_]{1,2}/g, '')
    .replace(/[➔◈]/g, '-')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const dayNumbers = (): number[] =>
  Object.keys(tezzlarDays).map(Number).sort((a, b) => a - b);

const daysSection = (): string => {
  const lastValueOf = new Map<string, string>();
  const days: string[] = [];

  for (const day of dayNumbers()) {
    const parts: string[] = [];
    for (const field of tezzlarDays[day].fields) {
      const value = plain(field.value);
      // The active missions repeat for several days; a section is written once and stands until it changes
      if (lastValueOf.get(field.name) === value) continue;
      lastValueOf.set(field.name, value);
      parts.push(`${plain(field.name)}\n${value}`);
    }
    if (parts.length > 0) days.push(`### Día ${day}\n${parts.join('\n\n')}`);
  }

  return [
    '## Tezzlar III, día por día',
    'Si un día no repite una sección (por ejemplo las misiones activas), esa sección sigue igual que en el día anterior.',
    ...days,
  ].join('\n\n');
};

const listSection = (): string => {
  const enchantments = enchantmentLevels.map(entry => `${entry.name}: ${entry.maxLevel}`).join(', ');

  const vanilla = vanillaFoods.map(food =>
    `- ${food.name}: hambre ${food.hunger}, saturación ${food.saturation}${food.effect ? `, efecto ${food.effect}` : ''}`).join('\n');
  const custom = customFoods.map(food => `- ${food.name}: ${plain(food.details.join(' '))}`).join('\n');

  const recipes = Object.values(recipesData).map(recipe => `- ${recipe.title}: ${plain(recipe.description).replace(/\n+/g, ' ')}`).join('\n');

  const minievents = Object.values(minieventsData).map(event =>
    `- ${event.name} (${event.duration}): ${event.description} ${event.effects.join(' ')}`).join('\n');

  const commands = serverCommands.map(entry => `- ${entry.command}: ${entry.description}`).join('\n');

  return [
    '## Tezzlar III, encantamientos (nivel máximo permitido)',
    enchantments,
    '## Tezzlar III, comida con valores cambiados',
    vanilla,
    '## Tezzlar III, comida nueva',
    custom,
    '## Tezzlar III, recetas y crafteos propios',
    recipes,
    '## Tezzlar III, minieventos aleatorios',
    minievents,
    '## Tezzlar III, comandos del servidor',
    commands,
  ].join('\n');
};

export const buildTezzlarKnowledge = (): string => `${daysSection()}\n\n${listSection()}`;
