import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, Message } from 'discord.js';
import { prisma } from '../../lib/prisma';

export const data = new SlashCommandBuilder()
  .setName('tag')
  .setDescription('Sistema de Tags')
  .addSubcommand(subcommand =>
    subcommand
      .setName('pick')
      .setDescription('Muestra el contenido de un tag.')
      .addStringOption(option =>
        option.setName('nombre').setDescription('Nombre del tag').setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('Crea o actualiza un tag.')
      .addStringOption(option =>
        option.setName('nombre').setDescription('Nombre del tag').setRequired(true)
      )
      .addStringOption(option =>
        option.setName('texto').setDescription('Contenido del tag').setRequired(false)
      )
      .addAttachmentOption(option =>
        option.setName('adjunto').setDescription('Imagen o archivo adjunto').setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('Elimina un tag.')
      .addStringOption(option =>
        option.setName('nombre').setDescription('Nombre del tag a eliminar').setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('Muestra la lista de tags disponibles.')
  );

export const metadata = {
  aliases: ['t'],
  category: 'Moderación',
  description: 'Sistema para guardar y recuperar mensajes rápidos (tags).',
  usage: 'tag [add|delete|list] <nombre> [texto]',
  slashOnly: false,
  devOnly: false,
  staffOnly: true
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  // Detect if running from text command adapter
  const adapterArgs = (interaction as any).args as string[] | undefined;
  const adapterMessage = (interaction as any).message as Message | undefined;

  let subcommand = '';
  let nombre = '';
  let texto = '';
  let mediaUrls: string[] = [];

  if (adapterArgs) {
    if (adapterArgs.length === 0) {
      return interaction.reply({ content: '❌ Por favor, especifica un tag. Ejemplo: `!tag <nombre>` o `!tag list`', ephemeral: true });
    }
    const firstArg = adapterArgs[0].toLowerCase();
    if (['add', 'delete', 'list', 'ver'].includes(firstArg)) {
      subcommand = firstArg;
      if (firstArg !== 'list') {
        nombre = adapterArgs[1]?.toLowerCase() || '';
        
        if (subcommand === 'add' && adapterMessage) {
          // Extract the text preserving all spaces, indents, and newlines
          const match = adapterMessage.content.match(/^\S+\s+\S+\s+\S+\s+/);
          if (match) {
            texto = adapterMessage.content.slice(match[0].length);
          } else {
            texto = '';
          }
        } else {
          texto = adapterArgs.slice(2).join(' ');
        }
      }
    } else {
      subcommand = 'ver';
      nombre = adapterArgs[0]?.toLowerCase() || '';
    }

    if (adapterMessage && adapterMessage.attachments.size > 0) {
      mediaUrls = adapterMessage.attachments.map(att => att.url);
    }
  } else {
    subcommand = interaction.options.getSubcommand();
    if (subcommand !== 'list') {
      nombre = interaction.options.getString('nombre')?.toLowerCase() || '';
      if (subcommand === 'add') {
        texto = interaction.options.getString('texto') || '';
        const adjunto = interaction.options.getAttachment('adjunto');
        if (adjunto) mediaUrls.push(adjunto.url);
      }
    }
  }

  if (subcommand === 'list') {
    const tags = await prisma.tag.findMany({
      orderBy: { name: 'asc' }
    });

    if (tags.length === 0) {
      return interaction.reply({ content: 'No hay tags creados todavía.', ephemeral: true });
    }

    const tagNames = tags.map(t => `\`${t.name}\``).join(', ');
    const embed = new EmbedBuilder()
      .setTitle('📚 Lista de Tags')
      .setDescription(tagNames)
      .setColor('#3498db');

    return interaction.reply({ embeds: [embed] });
  }

  if (!nombre) {
    return interaction.reply({ content: '❌ Debes especificar el nombre del tag.', ephemeral: true });
  }

  if (subcommand === 'add') {
    if (!texto && mediaUrls.length === 0) {
      return interaction.reply({ content: '❌ Debes proporcionar un texto o adjuntar al menos una imagen para crear el tag.', ephemeral: true });
    }

    await prisma.tag.upsert({
      where: { name: nombre },
      update: {
        content: texto || null,
        media_urls: mediaUrls,
        author_id: interaction.user.id
      },
      create: {
        name: nombre,
        content: texto || null,
        media_urls: mediaUrls,
        author_id: interaction.user.id
      }
    });

    return interaction.reply({ content: `✅ Tag \`${nombre}\` guardado correctamente.`, ephemeral: true });
  }

  if (subcommand === 'delete') {
    const existing = await prisma.tag.findUnique({ where: { name: nombre } });
    if (!existing) {
      return interaction.reply({ content: `❌ No se encontró ningún tag llamado \`${nombre}\`.`, ephemeral: true });
    }

    await prisma.tag.delete({ where: { name: nombre } });
    return interaction.reply({ content: `🗑️ Tag \`${nombre}\` eliminado.`, ephemeral: true });
  }

  if (subcommand === 'ver') {
    const tag = await prisma.tag.findUnique({ where: { name: nombre } });
    
    if (!tag) {
      return interaction.reply({ content: `❌ No existe el tag \`${nombre}\`. Usa \`!tag list\` para ver los disponibles.`, ephemeral: true });
    }

    const replyOptions: any = {};
    if (tag.content) {
      replyOptions.content = tag.content;
    }

    if (tag.media_urls && tag.media_urls.length > 0) {
      replyOptions.files = tag.media_urls;
    }

    if (!replyOptions.content && (!replyOptions.files || replyOptions.files.length === 0)) {
      replyOptions.content = "Este tag está vacío.";
    }
    if (adapterMessage) {
      return (adapterMessage.channel as any).send(replyOptions);
    }
    return interaction.reply(replyOptions);
  }
};
