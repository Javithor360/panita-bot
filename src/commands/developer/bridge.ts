import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, COLORS } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { discordTimestamp } from '../../lib/format';
import { bridge, channels } from '../../features/minecraft';

export default defineCommand({
  data: new SlashCommandBuilder().setName('bridge').setDescription('Muestra el estado de la conexión con el servidor de Minecraft'),
  meta: {
    category: CATEGORIES.developer,
    description: 'Muestra si el servidor de Minecraft está conectado, su versión y los canales unidos. Sirve para diagnosticar el puente.',
    access: 'developer',
  },
  async run(ctx) {
    if (!bridge) {
      await ctx.reply({ content: '⚠️ El puente con Minecraft está apagado: falta `BRIDGE_KEY`.', ephemeral: true });
      return;
    }

    const status = bridge.status();
    const joined = channels.chatChannels().map(chat => `${chat}: <#${channels.discordIdOf(chat)}>`);
    const embed = new EmbedBuilder()
      .setColor(status.connected ? COLORS.success : COLORS.error)
      .setTitle('🔌 Puente con Minecraft')
      .addFields(
        { name: 'Estado', value: status.connected ? 'Conectado' : 'Sin conexión', inline: true },
        { name: 'Desde', value: status.since ? discordTimestamp(status.since.getTime(), 'R') : '—', inline: true },
        { name: 'Mod', value: status.hello ? `\`${status.hello.modVersion}\` (Minecraft ${status.hello.minecraftVersion})` : '—', inline: true },
        { name: 'Canales unidos', value: joined.length ? joined.join('\n') : 'Ninguno' },
        {
          name: 'Tramas',
          value: `Recibidas: **${status.framesIn}** · Descartadas: **${status.framesDropped}** · Conexiones rechazadas: **${status.rejectedConnections}**`,
        },
      );
    if (status.lastError) embed.addFields({ name: 'Último error', value: `\`${status.lastError}\`` });

    await ctx.reply({ embeds: [embed], ephemeral: true });
  },
});
