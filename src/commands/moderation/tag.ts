import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, PREFIX } from '../../config/constants';
import { defineCommand } from '../../core/command';
import type { CommandContext } from '../../core/context';
import { refreshAttachmentUrls } from '../../lib/discord';
import { deleteTag, getTag, listTags, saveTag, TAG_CONTENT_MAX } from '../../services/tags';

/** `!tag <nombre>`: posts the tag's content in the channel. */
const showTag = async (ctx: CommandContext, rawArgs: string) => {
  const name = rawArgs.split(/\s+/)[0].toLowerCase();
  const tag = await getTag(name);
  if (!tag) {
    return ctx.reply(`❌ No existe el tag \`${name}\`. Usa \`${PREFIX}tag list\` para ver los disponibles.`);
  }

  const files = await refreshAttachmentUrls(ctx.client, tag.media_urls);
  const content = tag.content ?? (files.length === 0 ? 'Este tag está vacío.' : undefined);
  await ctx.send({ content, files });
};

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('tag')
    .setDescription('Sistema de Tags')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Crea o actualiza un tag.')
        .addStringOption(option => option.setName('nombre').setDescription('Nombre del tag').setRequired(true))
        .addStringOption(option => option.setName('texto').setDescription('Contenido del tag').setMaxLength(TAG_CONTENT_MAX).setRequired(false))
        .addAttachmentOption(option => option.setName('adjunto').setDescription('Imagen o archivo adjunto').setRequired(false)),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Elimina un tag.')
        .addStringOption(option => option.setName('nombre').setDescription('Nombre del tag a eliminar').setRequired(true)),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Muestra la lista de tags disponibles.'),
    ),
  meta: {
    category: CATEGORIES.moderation,
    description: `Sistema para guardar mensajes rápidos (tags). Se muestran escribiendo \`${PREFIX}tag <nombre>\`.`,
    aliases: ['t'],
    access: 'staff',
  },
  prefix: {
    fallback: { usage: '<nombre>', run: showTag },
  },
  async run(ctx) {
    const subcommand = ctx.options.getSubcommand();

    // Acknowledge before calling the API: list is public, add and delete are ephemeral
    await ctx.defer({ ephemeral: subcommand !== 'list' });

    if (subcommand === 'list') {
      const tags = await listTags();
      if (tags.length === 0) return ctx.reply({ content: 'No hay tags creados todavía.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('📚 Lista de Tags')
        .setDescription(tags.map(t => `\`${t.name}\``).join(', '))
        .setColor(0x3498db)
        .setFooter({ text: `Usa ${PREFIX}tag <nombre> para mostrar uno` });
      return ctx.reply({ embeds: [embed] });
    }

    const name = ctx.options.getString('nombre', true).toLowerCase();

    if (subcommand === 'delete') {
      const deleted = await deleteTag(name);
      return ctx.reply({
        content: deleted ? `🗑️ Tag \`${name}\` eliminado.` : `❌ No se encontró ningún tag llamado \`${name}\`.`,
        ephemeral: true,
      });
    }

    // add
    const content = ctx.options.getString('texto');
    const mediaUrls = ctx.options.getAttachments().map(attachment => attachment.url);
    if (!content && mediaUrls.length === 0) {
      return ctx.reply({ content: '❌ Debes proporcionar un texto o adjuntar al menos una imagen para crear el tag.', ephemeral: true });
    }

    await saveTag({ name, content, mediaUrls, authorId: ctx.user.id });
    await ctx.reply({ content: `✅ Tag \`${name}\` guardado correctamente.`, ephemeral: true });
  },
});
