import { features, info, join, opens, panitaClientFacts, prankClarifications, prankLevels, pranksIntro, pranksPrinciple, pranksStart, rules, rulesIntro, utilityCommands } from '../../data/enriquecraft';
import { plain } from './tezzlarKnowledge';

/**
 * What the `/enriquecraft` command shows, as plain text for the assistant. It is built from the same data as the
 * command, so the two cannot disagree and there is nothing to copy when the data changes.
 */

/** Plain text, with a link written as `text (url)` and a channel mention as its name, which the assistant cannot read. */
const clean = (text: string): string =>
  plain(text)
    .replace(/\[([^\]]+)\]\(<?([^)>\s]+)>?\)/g, '$1 ($2)')
    .replace(/<#\d+>/g, '#live-server');

const bullets = (items: readonly string[]): string => items.map(item => `- ${item}`).join('\n');

/** The section of the knowledge about Enriquecraft 666: the server that opens on its date, how it works and how to join. */
export const buildEnriquecraftKnowledge = (): string => {
  const levels = prankLevels.map(level => `- ${level.title}: ${clean(level.text)} Permitido: ${level.allowed ? clean(level.allowed) : 'ninguna broma'}.`);
  const clarifications = prankClarifications.map(item => `- ${item.title}: ${clean(item.text)}`);

  return [
    `## ${opens.name} (el servidor de Minecraft de ahora)`,
    '',
    `- ${opens.name} abre el ${opens.text}. Antes de ese día todavía no se puede entrar; desde ese día está abierto. Compara esa fecha con la de hoy ([TODAY]) para decir si ya abrió, si abre mañana o cuánto falta, y nunca des otra fecha.`,
    `- Dirección: ${join.ip}. Versión de Minecraft: ${join.version}. El comando \`/enriquecraft\` (también \`!enri\` y \`!ec\`) muestra todo esto en el Discord: \`info\`, \`rules\`, \`pranks\`, \`features\`, \`commands\` y \`join\`.`,
    '',
    '### Información general',
    clean(info.about),
    clean(info.goal),
    clean(info.technology),
    '',
    '### Reglamento',
    clean(rulesIntro),
    bullets(rules.map(rule => `${rule.title}. ${clean(rule.text)}`)),
    '',
    '### Sistema de pranks',
    clean(pranksIntro),
    `Principio: ${clean(pranksPrinciple)}`,
    clean(pranksStart),
    'Niveles, de menor a mayor:',
    levels.join('\n'),
    'Aclaraciones:',
    clarifications.join('\n'),
    '',
    '### Características del servidor',
    bullets(features.map(feature => `${feature.title}: ${clean(feature.text)}`)),
    '',
    '### Comandos de utilidad dentro del juego',
    bullets(utilityCommands.map(({ command, description }) => `\`${command}\`: ${clean(description)}`)),
    '',
    '### Cómo entrar',
    join.steps.map((step, index) => `${index + 1}. ${clean(step)}`).join('\n'),
    '',
    '### Panita Client',
    bullets(panitaClientFacts.map(clean)),
  ].join('\n');
};
