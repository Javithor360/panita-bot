import { ApplicationCommandType, ContextMenuCommandBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import type { CommandContext } from '../../core/context';
import { UserError, userMessageFor } from '../../core/errors';
import { claimTurn, NO_IMAGE, readImage } from '../../features/ocr/read';
import { imageUrlOf } from '../../features/ocr/source';
import { fail, whoOf } from '../../lib/voice';

/** The picture to read: the one given with the command, otherwise the one of the message it replies to. */
const findImageUrl = async (ctx: CommandContext): Promise<string | null> => {
  const given = imageUrlOf({ attachments: ctx.options.getAttachments(), embeds: [] });
  if (given || !ctx.referencedMessageId || !ctx.channel) return given;
  const replied = await ctx.channel.messages.fetch(ctx.referencedMessageId).catch(() => null);
  return replied ? imageUrlOf(replied) : null;
};

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('ocr')
    .setDescription('Lee el texto de una imagen.')
    .addAttachmentOption(option => option.setName('imagen').setDescription('La imagen con el texto (PNG, JPG, WEBP o BMP).')),
  meta: {
    category: CATEGORIES.utility,
    description:
      'Lee el texto que aparece en una imagen (español e inglés). Adjunta la imagen al comando, usa la opción `imagen` o responde con el comando a un mensaje que tenga una imagen o una vista previa de enlace. '
      + 'También puedes usar clic derecho sobre un mensaje → Apps → **Leer texto**. Hay que esperar unos segundos entre cada uso.',
    aliases: ['leer'],
  },
  async run(ctx) {
    const url = await findImageUrl(ctx);
    if (!url) throw new UserError(NO_IMAGE);
    claimTurn(ctx.user.id);

    await ctx.defer();
    try {
      await ctx.reply(await readImage(url));
    } catch (error) {
      await ctx.reply(userMessageFor(error, 'ocr', 'Command', ctx.member));
    }
  },
  contextMenu: {
    data: new ContextMenuCommandBuilder().setName('Leer texto').setType(ApplicationCommandType.Message),
    async run(interaction) {
      const who = whoOf(interaction);
      const url = imageUrlOf(interaction.targetMessage);
      if (!url) return interaction.reply({ content: fail(who, NO_IMAGE), flags: MessageFlags.Ephemeral });

      try {
        claimTurn(interaction.user.id);
      } catch (error) {
        return interaction.reply({ content: userMessageFor(error, 'ocr', 'ContextMenu', who), flags: MessageFlags.Ephemeral });
      }

      await interaction.deferReply();
      try {
        await interaction.editReply(await readImage(url));
      } catch (error) {
        await interaction.editReply(userMessageFor(error, 'ocr', 'ContextMenu', who));
      }
    },
  },
});
