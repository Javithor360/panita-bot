import { EmbedBuilder } from 'discord.js';
import { EMOJIS } from '../../config/emojis';
import type { ApiHealth } from '../../lib/api/types';
import { pastel } from './palette';

/** Noa's `botinfo` embed, refreshed: statistics and technology in code blocks, links, and the version in the footer. */

export interface InfoData {
  botName: string;
  avatarUrl: string;
  /** From `package.json`, such as `2.1.0`. */
  version: string;
  developer: string;
  stats: { guilds: number; users: number; channels: number; commands: number };
  programming: { discordjs: string; node: string; memoryMb: number; uptime: string; apiMs: number | null };
  links: { web: string; donate: string; discord: string };
  /** The Panita API, from its health route. */
  api: ApiHealth;
}

const block = (lines: string[]) => `\`\`\`\n${lines.join('\n')}\n\`\`\``;

/** The lines of the "API" field: whether it answers, its version and how long it took. */
export const apiLines = (api: ApiHealth): string[] =>
  api.online
    ? [
        `Estado: ${EMOJIS.online} **En línea**`,
        ...(api.version ? [`Versión: **v${api.version}**`] : []),
        ...(api.latencyMs !== null ? [`Latencia: **${api.latencyMs}ms**`] : []),
      ]
    : [`Estado: ${EMOJIS.offline} **Sin conexión**`];

export const infoEmbed = (data: InfoData, random?: () => number): EmbedBuilder =>
  new EmbedBuilder()
    .setColor(pastel(random))
    .setTitle(`Información de ${data.botName}`.slice(0, 256))
    .setThumbnail(data.avatarUrl)
    .setDescription(
      [
        `${EMOJIS.stats} **Estadísticas**`,
        block([
          `Servidores: ${data.stats.guilds}`,
          `Usuarios: ${data.stats.users}`,
          `Canales: ${data.stats.channels}`,
          `Comandos: ${data.stats.commands}`,
        ]),
        `${EMOJIS.dev} **Programación**`,
        block([
          'Lenguaje: TypeScript',
          `discord.js: v${data.programming.discordjs}`,
          `Node.js: ${data.programming.node}`,
          `Memoria usada: ${data.programming.memoryMb.toFixed(1)} MB`,
          `En línea: ${data.programming.uptime}`,
          ...(data.programming.apiMs !== null ? [`Latencia Discord: ${data.programming.apiMs}ms`] : []),
        ]),
        '**Enlaces**',
        `[Web](${data.links.web}) · [Donar](${data.links.donate}) · [Discord](${data.links.discord})`,
      ].join('\n'),
    )
    .addFields({ name: 'API', value: apiLines(data.api).join('\n') })
    .setFooter({ text: `Versión: v${data.version} | Desarrollado por: ${data.developer}` })
    .setTimestamp();
