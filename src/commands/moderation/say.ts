import { ChatInputCommandInteraction, SlashCommandBuilder, TextChannel, ChannelType, Message } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('say')
  .setDescription('Envía un mensaje como el bot.')
  .addStringOption(option =>
    option.setName('mensaje')
      .setDescription('El mensaje a enviar.')
      .setRequired(true)
  )
  .addChannelOption(option =>
    option.setName('canal')
      .setDescription('El canal donde enviar el mensaje (opcional).')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(false)
  );

export const metadata = {
  aliases: [],
  category: 'Moderación',
  description: 'Permite que el bot envíe un mensaje personalizado, opcionalmente en un canal específico.',
  usage: 'say [canal] <mensaje>',
  slashOnly: false,
  devOnly: false,
  staffOnly: true
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  let targetChannel: TextChannel | null = null;
  let messageContent: string | null = null;

  // Comprobar si proviene del adaptador de comandos de texto
  const args = (interaction as any).args as string[] | undefined;
  const originalMessage = (interaction as any).message as Message | undefined;

  if (args !== undefined) {
    // Lógica para comando de texto
    if (args.length === 0) {
      return interaction.reply({
        content: '❌ Debes proporcionar un mensaje.',
        ephemeral: true
      });
    }

    const firstArg = args[0];
    const channelIdMatch = firstArg.match(/^<#(\d+)>$/);
    const channelId = channelIdMatch ? channelIdMatch[1] : (firstArg.match(/^\d{17,20}$/) ? firstArg : null);
    
    if (channelId) {
      const channel = interaction.guild?.channels.cache.get(channelId);
      if (channel && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)) {
        targetChannel = channel as TextChannel;
        messageContent = args.slice(1).join(' ');
      } else {
        targetChannel = interaction.channel as TextChannel;
        messageContent = args.join(' ');
      }
    } else {
      targetChannel = interaction.channel as TextChannel;
      messageContent = args.join(' ');
    }
  } else {
    // Lógica para slash command
    const channelOption = interaction.options.getChannel('canal');
    messageContent = interaction.options.getString('mensaje', true);
    
    if (channelOption) {
      targetChannel = channelOption as TextChannel;
    } else {
      targetChannel = interaction.channel as TextChannel;
    }
  }

  if (!messageContent || messageContent.trim() === '') {
    return interaction.reply({
      content: '❌ Debes proporcionar un mensaje válido.',
      ephemeral: true
    });
  }

  if (!targetChannel) {
    return interaction.reply({
      content: '❌ No se pudo determinar el canal de destino.',
      ephemeral: true
    });
  }

  try {
    await targetChannel.send(messageContent);
    
    if (originalMessage) {
      // Intentar borrar el mensaje del comando de texto
      if (originalMessage.deletable) {
        await originalMessage.delete().catch(() => {});
      } else {
        const replyMsg = await interaction.reply({ content: `✅ Mensaje enviado a ${targetChannel}.` }) as any;
        if (replyMsg && typeof replyMsg.delete === 'function') {
          setTimeout(() => replyMsg.delete().catch(() => {}), 3000);
        }
      }
    } else {
      // Slash command reply
      await interaction.reply({
        content: `✅ Mensaje enviado a ${targetChannel}.`,
        ephemeral: true
      });
    }
  } catch (error) {
    console.error('Error in say command:', error);
    
    // Check if interaction was already replied to
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: '❌ Hubo un error al intentar enviar el mensaje. Verifica que el bot tenga permisos en ese canal.',
        ephemeral: true
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: '❌ Hubo un error al intentar enviar el mensaje. Verifica que el bot tenga permisos en ese canal.',
        ephemeral: true
      }).catch(() => {});
    }
  }
};
