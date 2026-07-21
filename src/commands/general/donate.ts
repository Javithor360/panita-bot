import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, Message } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('donate')
  .setDescription('Muestra la información para apoyar el servidor con donaciones.')
  .addBooleanOption(option =>
    option.setName('simple')
      .setDescription('Muestra el mensaje de donación de forma simple.')
      .setRequired(false)
  );

export const metadata = {
  aliases: ['donar', 'donacion', 'donaciones', 'fund'],
  category: 'General',
  description: 'Proporciona información sobre cómo donar al servidor, sus beneficios y el enlace de PayPal.',
  usage: 'donate [--simple]',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction | any) => {
  const args = interaction.args as string[] | undefined;
  const isPrefix = !!args;
  
  let isSimple = false;
  if (isPrefix) {
    isSimple = args.includes('--simple');
  } else {
    isSimple = interaction.options.getBoolean('simple') ?? false;
  }

  const simpleContent = 'Para apoyar el servidor, puedes donar a través de nuestro PayPal: <https://www.paypal.me/Javithor360>';

  if (isSimple) {
    if (isPrefix) {
      await interaction.channel.send({ content: simpleContent });
    } else {
      await interaction.reply({ content: simpleContent });
    }
    return;
  }

  const embed = new EmbedBuilder()
    .setColor('#009cde')
    .setAuthor({
      name: 'Información sobre Donaciones',
      url: 'https://www.paypal.me/Javithor360',
      iconURL: 'https://cdn.discordapp.com/emojis/1513402349920714852.webp?size=96'
    })
    .setThumbnail(interaction.client.user?.displayAvatarURL() || null)
    .setDescription('La mejor forma de apoyar nuestros proyectos es a través de una donación. Esto nos permite sustentar los gastos de alojamiento de los servidores y realizar inversiones en infraestructura para seguir creando contenido y futuros proyectos.\n\n*¡Recuerda que toda donación es completamente opcional, pero te lo agradeceremos un montón!*')
    .addFields(
      {
        name: '🌟 Beneficios de tu donación',
        value: '>>> ◈ Apoyar a la comunidad.\n◈ Reconocimiento especial en nuestro sitio web.\n◈ Rango exclusivo en el servidor de Minecraft vigente.\n◈ Spoilers de futuros proyectos.'
      },
      {
        name: '💖 ¿Deseas apoyarnos?',
        value: 'Puedes hacer tu aporte de forma segura en el siguiente enlace:\n\n[Donar vía PayPal](https://www.paypal.me/Javithor360) 🔗'
      }
    )
    .setFooter({ text: 'Agradecemos enormemente todo el apoyo que nos dan' })

  await interaction.reply({ embeds: [embed] });
};
