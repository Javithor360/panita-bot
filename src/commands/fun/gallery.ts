import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, URLS } from '../../config/constants';
import { button, defineCommand } from '../../core/command';
import { buildGalleryMessage, GALLERY_NAMESPACE } from '../../features/gallery/message';
import { quickUpload } from '../../features/quickUpload';
import { getRandomPhoto } from '../../services/gallery';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName(GALLERY_NAMESPACE)
    .setDescription('Muestra una foto aleatoria de la galería del servidor.'),
  meta: {
    category: CATEGORIES.fun,
    description: 'Muestra una foto aleatoria de la galería, incluyendo detalles y etiquetas.',
    aliases: ['galeria', 'foto'],
  },
  async run(ctx) {
    await ctx.defer();
    const photo = await getRandomPhoto();
    await ctx.reply(await buildGalleryMessage(photo, ctx.user.id));
  },
  components: {
    // The quick upload's button and form: their namespace has to be a command, and this is the gallery's
    ...quickUpload.components,
    reroll: button({
      async run(interaction) {
        await interaction.deferUpdate();
        const photo = await getRandomPhoto();
        // `attachments: []` drops the previous photo's file; the new one comes in `files`
        await interaction.editReply({ ...await buildGalleryMessage(photo, interaction.user.id), attachments: [] });
      },
    }),
    link: button({
      async run(interaction, [photoId]) {
        await interaction.reply({
          content: `Aquí tienes el enlace. Puedes copiarlo seleccionándolo:\n<${URLS.gallery(photoId)}>`,
          flags: MessageFlags.Ephemeral,
        });
      },
    }),
  },
});
