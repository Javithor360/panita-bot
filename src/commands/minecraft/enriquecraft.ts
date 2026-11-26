import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import type { CommandContext } from '../../core/context';
import { UserError } from '../../core/errors';
import { features, prankClarifications, prankLevels, rules } from '../../data/enriquecraft';
import * as commands from '../../features/enriquecraft/commands';
import * as featuresView from '../../features/enriquecraft/features';
import * as info from '../../features/enriquecraft/info';
import * as join from '../../features/enriquecraft/join';
import * as pranks from '../../features/enriquecraft/pranks';
import * as rulesView from '../../features/enriquecraft/rules';

/** What each subcommand does; the code of each is in `features/enriquecraft/`. */
const HANDLERS: Record<string, (ctx: CommandContext) => Promise<void>> = {
  info: info.run,
  rules: rulesView.run,
  pranks: pranks.run,
  features: featuresView.run,
  commands: commands.run,
  join: join.run,
};

const choicesOf = (items: ReadonlyArray<{ id?: string; label?: string; title: string }>) =>
  items.filter(item => item.id).map(item => ({ name: item.label ?? item.title, value: item.id! }));

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('enriquecraft')
    .setDescription('Información del servidor de Enriquecraft')
    .addSubcommand(subcommand =>
      subcommand.setName('info').setDescription('Muestra qué es Enriquecraft y cuál es su objetivo.'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('rules')
        .setDescription('Muestra el reglamento del servidor.')
        .addStringOption(option =>
          option.setName('regla')
            .setDescription('Una regla en concreto; sin ella se muestran todas.')
            .setRequired(false)
            .addChoices(...choicesOf(rules)),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('pranks')
        .setDescription('Explica el sistema de pranks y sus niveles.')
        .addStringOption(option =>
          option.setName('nivel')
            .setDescription('Un nivel en concreto; sin él se muestra todo el sistema.')
            .setRequired(false)
            // The levels, and the Extremo indicator, which has its own text
            .addChoices(...choicesOf(prankLevels), ...choicesOf(prankClarifications)),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('features')
        .setDescription('Muestra las características y mecánicas propias del servidor.')
        .addStringOption(option =>
          option.setName('caracteristica')
            .setDescription('Una característica en concreto; sin ella se muestra la lista.')
            .setRequired(false)
            .addChoices(...choicesOf(features)),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('commands').setDescription('Muestra los comandos de utilidad del servidor de Minecraft.'),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('join').setDescription('Muestra la IP, la versión y cómo entrar al servidor.'),
    ),
  meta: {
    category: CATEGORIES.minecraft,
    description:
      'Todo sobre el servidor de Enriquecraft. Subcomandos: `info` (qué es y su objetivo), `rules [regla]` (el reglamento), `pranks [nivel]` (el sistema de pranks), '
      + '`features [característica]` (lo que ofrece el servidor), `commands` (los comandos de utilidad) y `join` (la IP, la versión y cómo entrar).',
    aliases: ['enri', 'ec'],
  },
  // Spanish and short names of the subcommands (`!ec reglas`, `!ec jugar`)
  prefix: {
    subcommandAliases: {
      informacion: 'info',
      general: 'info',
      reglas: 'rules',
      normas: 'rules',
      bromas: 'pranks',
      caracteristicas: 'features',
      mecanicas: 'features',
      comandos: 'commands',
      cmds: 'commands',
      jugar: 'join',
      ip: 'join',
      unirse: 'join',
    },
  },
  async run(ctx) {
    const handler = HANDLERS[ctx.options.getSubcommand() ?? ''];
    if (!handler) throw new UserError('subcomando inválido.');
    await handler(ctx);
  },
});
