import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('resources')
  .setDescription('Muestra el enlace para descargar los mods y texturas del servidor.');

export const metadata = {
  aliases: ['recursos', 'assets'],
  category: 'Minecraft',
  description: 'Proporciona los recursos, mods y texturas necesarios para jugar en el servidor y un tutorial de instalación.',
  usage: 'resources',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction | any) => {
  const embed = new EmbedBuilder()
    .setColor('#5A6ED6')
    .setAuthor({
      name: 'Recursos del Servidor',
      url: 'https://panita.vercel.app/tezzlar3',
      iconURL: 'https://media.discordapp.net/attachments/1032440236564824105/1513754769322414080/Picel.gif?ex=6a468b3d&is=6a4539bd&hm=e55f878fd1e8908143d9560aac967a65f86a3abc72dedfe105451763a8a5d5e1&'
    })
    .setThumbnail('https://media.discordapp.net/attachments/1032440236564824105/1519191750948819025/corazonestezzlar.png?ex=6a468c52&is=6a453ad2&hm=c41a97b147fc4571a5e65543af06f4b2d14c019db05c4fb539912c82d93fa9a9&format=webp&quality=lossless&width=960&height=960&')
    .setDescription('¡Aquí tienes todo lo necesario para unirte a la aventura! Descarga la carpeta con los mods y texturas actualizados desde el siguiente enlace:\n\n🔗 [Descargar recursos aquí](https://drive.google.com/file/d/1JPClbxD9urlw_sNY2xtu-5OD8S0YIlE5/view)\n*El archivo incluye mods, paquetes de recursos y shaders.*\n\n Si necesitas ayuda con la instalación, por favor abre un ticket en [este canal](https://discord.com/channels/707103390852710491/1406385534712156301/1521266058206511146).')
    .addFields(
      {
        name: '🛠️ ¿Cómo instalar?',
        value: '>>> **1.** Descarga los recursos desde el enlace de arriba.\n**2.** Abre la carpeta de tu juego buscando `%appdata%\\.minecraft` (en Windows).\n**3.** Descomprime los recursos en esa carpeta.\n**4.** Reemplaza los archivos ya existentes.\n\n¡Y listo! Ya puedes abrir el juego y disfrutar.',
      }
    )
    .setFooter({ text: 'Última actualización' })
    .setTimestamp(new Date('2026-07-01T14:00:00-06:00'));

  await interaction.reply({ embeds: [embed] });
};
