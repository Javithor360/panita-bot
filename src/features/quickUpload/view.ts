import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { URLS } from '../../config/constants';
import { encodeCustomId } from '../../core/customId';
import type { PhotoRefusal } from '../../services/gallery';
import { QUICK_UPLOAD, type UsableOptions } from './rules';

/** The quick upload lives in the components of `/gallery`, whose name is their namespace. */
export const NAMESPACE = 'gallery';

export const UPLOAD_ACTIONS = { open: 'upload', submit: 'uploadsubmit' } as const;

/** The ids of the fields of the form. */
export const FIELDS = { title: 'title', description: 'description', edition: 'edition', categories: 'categories' } as const;

export const UPLOAD_MESSAGES = {
  open: (ownerId: string, images: number) =>
    `<@${ownerId}> ¿Quieres subir ${images > 1 ? 'la primera imagen de este mensaje' : 'esta foto'} a la galería de la web? Pulsa el botón y completa los datos. ` +
    '*Los 👍 de Discord no cuentan como likes de la galería.*',
  button: 'Subir a la galería',
  modalTitle: 'Subir a la galería',
  titleLabel: 'Título',
  descriptionLabel: 'Descripción (opcional)',
  editionLabel: 'Edición',
  categoriesLabel: 'Categorías',
  optionsUnavailable: (ownerId: string) => `<@${ownerId}> no pude consultar tus opciones de subida ahora mismo. Vuelve a reaccionar con 👍 en un momento.`,
  noOptions: (ownerId: string) => `<@${ownerId}> ahora mismo no hay ediciones o categorías disponibles para subir fotos desde Discord.`,
  expired: 'Esta oferta ya no está disponible. Reacciona de nuevo con 👍 a tu foto para empezar otra vez.',
  busy: 'Tu foto ya se está subiendo, un momento.',
  uploading: '⏳ Subiendo tu foto a la galería...',
  gone: 'No encontré una imagen en tu mensaje. ¿Lo borraste? Vuelve a publicarla y reacciona con 👍.',
  tooBig: `La imagen pesa más de ${QUICK_UPLOAD.maxBytes / 1024 / 1024} MB, que es el máximo. Redúcela y publícala de nuevo.`,
  storageFailed: 'No pudimos subir la imagen ahora mismo. Inténtalo de nuevo en un momento con el mismo botón.',
  unknownOutcome: 'No pudimos confirmar si tu foto se guardó. Revisa la galería antes de intentarlo otra vez.',
  done: (photoId: string) => `✅ ¡Tu foto ya está en la galería!\n<${URLS.gallery(photoId)}>`,
} as const;

/** What the member is told for each refusal of the API. */
export const REFUSAL_MESSAGES: Record<PhotoRefusal, string> = {
  not_found: 'No encontramos tu cuenta de la web.',
  not_allowed: 'Tu cuenta ya no puede subir fotos desde Discord.',
  reserved_category: 'Alguna de las categorías solo la puede usar el staff.',
  unknown_id: 'La edición o alguna categoría ya no está disponible. Reacciona de nuevo con 👍 para cargar las opciones otra vez.',
  invalid: 'La web rechazó los datos de la foto. Revisa el título y la descripción y empieza de nuevo con 👍.',
};

/** The reply that offers the upload: only its author can press the button. */
export const buildOffer = (messageId: string, ownerId: string, images: number) => ({
  content: UPLOAD_MESSAGES.open(ownerId, images),
  components: [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(encodeCustomId({ namespace: NAMESPACE, action: UPLOAD_ACTIONS.open, args: [messageId], owner: ownerId }))
        .setLabel(UPLOAD_MESSAGES.button)
        .setEmoji('🖼️')
        .setStyle(ButtonStyle.Primary),
    ),
  ],
  // Only the author is pinged, and the reply does not ping them a second time as "the replied user"
  allowedMentions: { users: [ownerId], repliedUser: false },
});

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The form: title, description, one edition (the newest one chosen) and one or more categories. */
export const buildUploadModal = (messageId: string, ownerId: string, options: UsableOptions) => {
  const title = new TextInputBuilder()
    .setCustomId(FIELDS.title)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(QUICK_UPLOAD.titleMax);

  const description = new TextInputBuilder()
    .setCustomId(FIELDS.description)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(QUICK_UPLOAD.descriptionMax);

  const edition = new StringSelectMenuBuilder()
    .setCustomId(FIELDS.edition)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      options.editions.map((item, index) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(clip(item.name, 100))
          .setValue(item.id)
          .setDefault(index === 0),
      ),
    );

  const categories = new StringSelectMenuBuilder()
    .setCustomId(FIELDS.categories)
    .setMinValues(1)
    .setMaxValues(options.categories.length)
    .addOptions(options.categories.map(item => new StringSelectMenuOptionBuilder().setLabel(clip(item.name, 100)).setValue(item.id)));

  return new ModalBuilder()
    .setCustomId(encodeCustomId({ namespace: NAMESPACE, action: UPLOAD_ACTIONS.submit, args: [messageId], owner: ownerId }))
    .setTitle(UPLOAD_MESSAGES.modalTitle)
    .addLabelComponents(
      new LabelBuilder().setLabel(UPLOAD_MESSAGES.titleLabel).setTextInputComponent(title),
      new LabelBuilder().setLabel(UPLOAD_MESSAGES.descriptionLabel).setTextInputComponent(description),
      new LabelBuilder().setLabel(UPLOAD_MESSAGES.editionLabel).setStringSelectMenuComponent(edition),
      new LabelBuilder().setLabel(UPLOAD_MESSAGES.categoriesLabel).setStringSelectMenuComponent(categories),
    );
};
