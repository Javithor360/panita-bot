import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { ASSETS, CATEGORIES, URLS } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { tezzlarAuthor } from '../../lib/embeds';

/** Shown as "Última actualización" in the embed footer. Update it when the resources change. */
const RESOURCES_UPDATED_AT = new Date('2026-07-01T14:00:00-06:00');

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('resources')
    .setDescription('Muestra el enlace para descargar los mods y texturas del servidor.'),
  meta: {
    category: CATEGORIES.minecraft,
    description: 'Proporciona los recursos, mods y texturas necesarios para jugar en el servidor y un tutorial de instalación.',
    aliases: ['recursos', 'assets'],
  },
  async run(ctx) {
    const embed = new EmbedBuilder()
      .setColor(0x5a6ed6)
      .setAuthor(tezzlarAuthor('Recursos del Servidor', URLS.tezzlar3))
      .setThumbnail(ASSETS.tezzlarHearts)
      .setDescription(`¡Aquí tienes todo lo necesario para unirte a la aventura! Descarga la carpeta con los mods y texturas actualizados desde el siguiente enlace:\n\n🔗 [Descargar recursos aquí](${URLS.resourcesDownload})\n*El archivo incluye mods, paquetes de recursos y shaders.*\n\n⚠️ **Requisito Importante**\nEl servidor está en la versión **Fabric 26.2** y necesitas tener **Fabric Loader** instalado. Si aún no lo tienes, puedes descargar el instalador en su última versión para la 26.2 en [este enlace](${URLS.fabricInstaller}).`)
      .addFields(
        {
          name: '🛠️ Proceso de instalación',
          value: '>>> **1.** Descarga los recursos desde el enlace de arriba.\n**2.** Abre la carpeta de tu juego buscando `%appdata%\\.minecraft` (en Windows).\n**3.** Descomprime los recursos en esa carpeta.\n**4.** Reemplaza los archivos ya existentes.\n\n¡Y listo! Ya puedes abrir el juego y disfrutar.',
        },
        {
          name: '💬 ¿Necesitas ayuda?',
          value: `Si necesitas ayuda con la instalación, por favor abre un ticket en [este canal](${URLS.ticketHelpChannel}).`,
        },
      )
      .setFooter({ text: 'Última actualización' })
      .setTimestamp(RESOURCES_UPDATED_AT);

    await ctx.reply({ embeds: [embed] });
  },
});
