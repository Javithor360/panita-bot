import { SlashCommandBuilder, version as discordJsVersion } from 'discord.js';
import { CATEGORIES, URLS } from '../../config/constants';
import { BOT_VERSION } from '../../config/version';
import { env } from '../../config/env';
import { defineCommand } from '../../core/command';
import { getRegistry } from '../../core/registry';
import { infoEmbed } from '../../features/info/infoView';
import { api } from '../../lib/api';
import { formatDuration } from '../../lib/format';

export default defineCommand({
  data: new SlashCommandBuilder().setName('info').setDescription('Muestra información sobre el bot.'),
  meta: {
    category: CATEGORIES.utility,
    description: 'Muestra información sobre el bot: su versión, sus estadísticas, con qué está hecho y sus enlaces.',
    aliases: ['botinfo', 'about'],
  },
  async run(ctx) {
    await ctx.defer();
    const { client } = ctx;
    // Both at once; the probe gives up after 3 seconds and never throws, so a down API cannot hold the answer back
    const [developer, health] = await Promise.all([client.users.fetch(env.DEVELOPER_ID).catch(() => null), api.health()]);

    const embed = infoEmbed({
      botName: client.user.displayName,
      avatarUrl: client.user.displayAvatarURL({ size: 256 }),
      version: BOT_VERSION,
      developer: developer?.username ?? 'el equipo de Panita',
      stats: {
        guilds: client.guilds.cache.size,
        users: client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0),
        channels: client.channels.cache.size,
        commands: getRegistry().byName.size,
      },
      programming: {
        discordjs: discordJsVersion,
        node: process.version,
        memoryMb: process.memoryUsage().rss / 1024 / 1024,
        uptime: formatDuration(client.uptime ?? 0),
        // The gateway ping is -1 until the first heartbeat has been answered
        apiMs: client.ws.ping >= 0 ? client.ws.ping : null,
      },
      links: { web: URLS.web, donate: URLS.paypal, discord: URLS.discordInvite },
      api: health,
    });

    await ctx.reply({ embeds: [embed] });
  },
});
