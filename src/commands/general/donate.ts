import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { ASSETS, CATEGORIES, URLS } from '../../config/constants';
import { defineCommand } from '../../core/command';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('donate')
    .setDescription('Muestra la información para apoyar el servidor con donaciones.')
    .addBooleanOption(option =>
      option.setName('simple')
        .setDescription('Muestra el mensaje de donación de forma simple.')
        .setRequired(false),
    ),
  meta: {
    category: CATEGORIES.general,
    description: 'Proporciona información sobre cómo donar al servidor, sus beneficios y el enlace de PayPal.',
    aliases: ['donar', 'donacion', 'donaciones', 'fund'],
  },
  async run(ctx) {
    if (ctx.options.getBoolean('simple')) {
      return ctx.send(`Para apoyar el servidor, puedes donar a través de nuestro PayPal: <${URLS.paypal}>`);
    }

    const embed = new EmbedBuilder()
      .setColor(0x009cde)
      .setAuthor({ name: 'Información sobre Donaciones', url: URLS.paypal, iconURL: ASSETS.llamushroomIcon })
      .setThumbnail(ctx.client.user.displayAvatarURL())
      .setDescription('La mejor forma de apoyar nuestros proyectos es a través de una donación. Esto nos permite sustentar los gastos de alojamiento de los servidores y realizar inversiones en infraestructura para seguir creando contenido y futuros proyectos.\n\n*¡Recuerda que toda donación es completamente opcional, pero te lo agradeceremos un montón!*')
      .addFields(
        {
          name: '🌟 Beneficios de tu donación',
          value: '>>> ◈ Apoyar a la comunidad.\n◈ Reconocimiento especial en nuestro sitio web.\n◈ Rango exclusivo en el servidor de Minecraft vigente.\n◈ Spoilers de futuros proyectos.',
        },
        {
          name: '💖 ¿Deseas apoyarnos?',
          value: `Puedes hacer tu aporte de forma segura en el siguiente enlace:\n\n[Donar vía PayPal](${URLS.paypal}) 🔗`,
        },
      )
      .setFooter({ text: 'Agradecemos enormemente todo el apoyo que nos dan' });

    await ctx.reply({ embeds: [embed] });
  },
});
