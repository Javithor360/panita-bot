import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import type { CommandContext } from '../../core/context';
import { UserError } from '../../core/errors';
import * as commands from '../../features/tezzlar/commands';
import * as day from '../../features/tezzlar/day';
import * as food from '../../features/tezzlar/food';
import * as ip from '../../features/tezzlar/ip';
import * as minievent from '../../features/tezzlar/minievent';
import * as recipes from '../../features/tezzlar/recipes';
import * as resources from '../../features/tezzlar/resources';
import * as trailer from '../../features/tezzlar/trailer';

/** What each subcommand does; the code of each is in `features/tezzlar/`. */
const HANDLERS: Record<string, (ctx: CommandContext) => Promise<void>> = {
  day: day.run,
  commands: commands.run,
  food: food.run,
  ip: ip.run,
  minievent: minievent.run,
  recipes: recipes.run,
  resources: resources.run,
  trailer: trailer.run,
};

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('tezzlar')
    .setDescription('Comandos de Tezzlar')
    .addSubcommand(subcommand =>
      subcommand
        .setName('day')
        .setDescription('Muestra la información de un día específico de Tezzlar III.')
        .addIntegerOption(option =>
          option.setName('numero')
            .setDescription(`Número de día (1-${day.TOTAL_DAYS})`)
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(day.TOTAL_DAYS),
        )
        .addBooleanOption(option =>
          option.setName('force')
            .setDescription('Forzar bypass de fecha (Solo Dev)')
            .setRequired(false),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('commands').setDescription('Muestra la lista de comandos útiles en el servidor de Minecraft'),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('food').setDescription('Muestra la información del rebalanceo de comidas en Tezzlar III.'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('ip')
        .setDescription('Muestra la dirección IP del servidor de Minecraft.')
        .addBooleanOption(option =>
          option.setName('numeric')
            .setDescription('Muestra la IP numérica en lugar del dominio')
            .setRequired(false),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('minievent')
        .setDescription('Información sobre los minieventos de Tezzlar')
        .addStringOption(option =>
          option.setName('id')
            .setDescription('ID del minievento o "list" para ver todos')
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('recipes')
        .setDescription('Muestra los crafteos y recetas especiales de Tezzlar')
        .addStringOption(option =>
          option.setName('id')
            .setDescription('ID de la receta o "list" para ver todas')
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('resources').setDescription('Muestra el enlace para descargar los mods y texturas del servidor.'),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('trailer').setDescription('Muestra el enlace del tráiler de Tezzlar 3.'),
    ),
  meta: {
    category: CATEGORIES.minecraft,
    description:
      'Todo sobre el evento Tezzlar III. Subcomandos: `day <número>` (la información de un día), `commands` (comandos útiles del servidor), `food` (el rebalanceo de comidas), '
      + '`ip [--numeric]` (la IP del servidor), `minievent <id|list>`, `recipes <id|list>`, `resources` (mods y texturas) y `trailer` (el tráiler).',
    aliases: ['tez', 'tz'],
  },
  // Spanish and short names of the old top-level commands, now words of this one (`!tz jugar`, `!tz comida`)
  prefix: {
    subcommandAliases: {
      comandos: 'commands',
      cmds: 'commands',
      comida: 'food',
      comidas: 'food',
      foods: 'food',
      jugar: 'ip',
      minecraft: 'ip',
      minieventos: 'minievent',
      minievents: 'minievent',
      me: 'minievent',
      recetas: 'recipes',
      crafteos: 'recipes',
      crafts: 'recipes',
      recursos: 'resources',
      assets: 'resources',
    },
  },
  async run(ctx) {
    const handler = HANDLERS[ctx.options.getSubcommand() ?? ''];
    if (!handler) throw new UserError('subcomando inválido.');
    await handler(ctx);
  },
});
