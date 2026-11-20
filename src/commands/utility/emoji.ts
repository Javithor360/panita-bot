import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  DiscordAPIError,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  SlashCommandBuilder,
  type GuildEmoji,
  type GuildMember,
} from 'discord.js';
import { CATEGORIES, PREFIX } from '../../config/constants';
import { button, defineCommand } from '../../core/command';
import { accessDenial } from '../../core/access';
import type { CommandContext } from '../../core/context';
import { UserError } from '../../core/errors';
import { snowflakeDate } from '../../features/info/dates';
import { emojiImages, emojiSourceUrl, isValidEmojiName, parseEmoji, unicodeImage, type ParsedEmoji } from '../../features/info/emojiParse';
import { allowedImageUrl, downloadImage, MAX_SOURCE_BYTES, prepareEmojiImage, slotProblem } from '../../features/info/emojiMedia';
import { emojiLogEmbed, emojiMessage, type EmojiChange } from '../../features/info/emojiView';
import { auditReason, discordAction } from '../../features/moderation/actions';
import { modlogOf } from '../../features/moderation/modlog';
import { ask, fail, ok, usageLine, whoOf } from '../../lib/voice';

const USAGE = [
  `${PREFIX}emoji <emoji> [--info]`,
  `${PREFIX}emoji add <nombre> [emoji|enlace] (o adjunta la imagen)`,
  `${PREFIX}emoji remove <emoji>`,
  `${PREFIX}emoji rename <emoji> <nombre>`,
];

const NAME_RULE = 'el nombre solo puede tener letras, números y `_` (de 2 a 32 caracteres).';

/** The emoji of this server that a text points at: its markup, its ID or its name. `null` when there is none. */
const guildEmojiOf = async (ctx: Pick<CommandContext, 'guild'>, parsed: ParsedEmoji | null): Promise<GuildEmoji | null> => {
  if (!parsed) return null;
  const { guild } = ctx;
  if (parsed.kind === 'custom' || parsed.kind === 'id') {
    return guild.emojis.cache.get(parsed.id) ?? (await guild.emojis.fetch(parsed.id).catch(() => null));
  }
  if (parsed.kind === 'name') {
    const wanted = parsed.name.toLowerCase();
    return guild.emojis.cache.find(emoji => emoji.name?.toLowerCase() === wanted) ?? null;
  }
  return null;
};

const notFound = (ctx: CommandContext) => ctx.reply({ content: `${fail(ctx.member, 'emoji no encontrado.')}\n${usageLine(USAGE)}`, ephemeral: true });

const requireStaff = async (ctx: CommandContext): Promise<boolean> => {
  const denial = accessDenial('staff', ctx.member);
  if (denial) await ctx.reply({ content: denial, ephemeral: true });
  return denial === null;
};

const requireExpressions = (ctx: CommandContext) => {
  if (!ctx.guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
    throw new UserError('necesito el permiso «Gestionar expresiones» para hacer eso.');
  }
};

const logChange = (ctx: CommandContext, change: EmojiChange, emoji: { name: string | null; id: string; animated: boolean | null }, previousName?: string) =>
  modlogOf(ctx.client).post({
    embeds: [emojiLogEmbed({
      change,
      moderatorId: ctx.user.id,
      name: emoji.name ?? 'emoji',
      id: emoji.id,
      imageUrl: emojiImages(emoji.id, emoji.animated === true).image,
      previousName,
    })],
  });

const SUBCOMMANDS: Record<string, (ctx: CommandContext) => Promise<unknown>> = {
  async ver(ctx) {
    const parsed = parseEmojiArgument(ctx);
    if (!parsed) return notFound(ctx);
    const info = ctx.options.getBoolean('info') === true;

    if (parsed.kind === 'unicode') {
      return ctx.reply(emojiMessage({ name: parsed.chars, id: null, animated: false, imageUrl: unicodeImage(parsed.codepoints), links: null, info, serverName: null, createdAt: null }));
    }

    const known = parsed.kind === 'custom'
      ? { id: parsed.id, name: parsed.name, animated: parsed.animated }
      : await knownEmoji(ctx, parsed);
    if (!known) return notFound(ctx);

    const own = ctx.client.emojis.cache.get(known.id);
    await ctx.reply(emojiMessage({
      name: known.name,
      id: known.id,
      animated: known.animated,
      imageUrl: emojiImages(known.id, known.animated).image,
      links: emojiImages(known.id, known.animated),
      info,
      serverName: own?.guild.name ?? null,
      createdAt: snowflakeDate(known.id),
    }));
  },

  async add(ctx) {
    if (!(await requireStaff(ctx))) return;
    requireExpressions(ctx);

    const name = ctx.options.getString('nombre', true).trim();
    if (!isValidEmojiName(name)) throw new UserError(NAME_RULE);

    const link = sourceLink(ctx);
    await ctx.defer();

    const prepared = await prepareEmojiImage(await downloadImage(link));
    const emojis = [...ctx.guild.emojis.cache.values()];
    const problem = slotProblem({
      animated: prepared.animated,
      boostTier: ctx.guild.premiumTier,
      still: emojis.filter(emoji => !emoji.animated).length,
      animatedCount: emojis.filter(emoji => emoji.animated).length,
    });
    if (problem) throw new UserError(problem);

    let created: GuildEmoji;
    try {
      created = await discordAction(() => ctx.guild.emojis.create({ attachment: prepared.data, name, reason: auditReason(ctx, 'emoji añadido') }));
    } catch (error) {
      if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.MaximumNumberOfEmojisReached) {
        throw new UserError('ya no hay espacio para más emojis en el servidor.');
      }
      if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.InvalidFormBodyOrContentType) {
        throw new UserError('Discord no aceptó esa imagen, prueba con otra.');
      }
      throw error;
    }

    await ctx.reply({
      content: ok(ctx.member, `emoji añadido: ${created} (\`:${created.name}:\`)${prepared.resized ? '. Lo reduje para que cupiera' : ''}.`),
      allowedMentions: { parse: [] },
    });
    await logChange(ctx, 'add', created);
  },

  async remove(ctx) {
    if (!(await requireStaff(ctx))) return;
    requireExpressions(ctx);

    const emoji = await guildEmojiOf(ctx, parseEmojiArgument(ctx));
    if (!emoji) return notFound(ctx);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ctx.customId('confirmremove', [emoji.id], { owned: true })).setLabel('Confirmar').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(ctx.customId('cancelremove', [emoji.id], { owned: true })).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
    );
    await ctx.reply({
      content: ask(ctx.member, `¿seguro que quieres borrar ${emoji} (\`:${emoji.name}:\`)? Esto no se puede deshacer.`),
      components: [row],
      allowedMentions: { parse: [] },
    });
  },

  async rename(ctx) {
    if (!(await requireStaff(ctx))) return;
    requireExpressions(ctx);

    const emoji = await guildEmojiOf(ctx, parseEmojiArgument(ctx));
    if (!emoji) return notFound(ctx);

    const name = ctx.options.getString('nombre', true).trim();
    if (!isValidEmojiName(name)) throw new UserError(NAME_RULE);

    const previous = emoji.name ?? 'emoji';
    const renamed = await discordAction(() => emoji.edit({ name, reason: auditReason(ctx, 'emoji renombrado') }));
    await ctx.reply({
      content: ok(ctx.member, `${renamed} se llamaba \`:${previous}:\` y ahora es \`:${renamed.name}:\`.`),
      allowedMentions: { parse: [] },
    });
    await logChange(ctx, 'rename', renamed, previous);
  },
};

/** What was written in the `emoji` option. */
const parseEmojiArgument = (ctx: CommandContext): ParsedEmoji | null => parseEmoji(ctx.options.getString('emoji', true));

/** An emoji pointed at by ID or name that this bot knows (it is in a server the bot is in). */
const knownEmoji = async (ctx: CommandContext, parsed: ParsedEmoji) => {
  const emoji = await guildEmojiOf(ctx, parsed)
    ?? (parsed.kind === 'id' ? ctx.client.emojis.cache.get(parsed.id) ?? null : null)
    ?? (parsed.kind === 'name' ? ctx.client.emojis.cache.find(candidate => candidate.name?.toLowerCase() === parsed.name.toLowerCase()) ?? null : null);
  return emoji ? { id: emoji.id, name: emoji.name ?? 'emoji', animated: emoji.animated === true } : null;
};

/** Where the picture of `emoji add` comes from: an attachment, another emoji (by markup or ID) or a link of Discord. */
const sourceLink = (ctx: CommandContext): string => {
  const attachment = ctx.options.getAttachment('imagen');
  if (attachment) {
    if (attachment.size > MAX_SOURCE_BYTES) throw new UserError('la imagen pesa demasiado, el máximo es 8 MB.');
    return attachment.url;
  }

  const origin = ctx.options.getString('origen')?.trim();
  if (!origin) throw new UserError('falta la imagen: adjunta un archivo, pon el emoji que quieres copiar o un enlace de Discord.');

  const parsed = parseEmoji(origin);
  if (parsed?.kind === 'custom') return emojiSourceUrl(parsed.id, parsed.animated);
  if (parsed?.kind === 'id') return emojiSourceUrl(parsed.id, ctx.client.emojis.cache.get(parsed.id)?.animated === true);

  const url = allowedImageUrl(origin);
  if (!url) throw new UserError('solo acepto imágenes de Discord (un archivo adjunto, otro emoji o un enlace de cdn.discordapp.com o media.discordapp.net).');
  return url.toString();
};

/** The buttons of `remove` are for staff only, even if somebody else could press them. */
const staffGuard = (interaction: { inCachedGuild(): boolean; member: unknown }): string | null =>
  interaction.inCachedGuild() ? accessDenial('staff', interaction.member as GuildMember) : null;

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('emoji')
    .setDescription('Muestra un emoji en grande, o administra los emojis del servidor.')
    .addSubcommand(sub =>
      sub.setName('ver').setDescription('Muestra un emoji en grande.')
        .addStringOption(option => option.setName('emoji').setDescription('El emoji (también su ID o su nombre).').setRequired(true))
        .addBooleanOption(option => option.setName('info').setDescription('Muestra también su nombre, ID y fecha.')),
    )
    .addSubcommand(sub =>
      sub.setName('add').setDescription('Añade un emoji al servidor (solo Staff).')
        .addStringOption(option => option.setName('nombre').setDescription('El nombre del emoji (2 a 32 letras, números o _).').setRequired(true))
        .addStringOption(option => option.setName('origen').setDescription('Otro emoji o un enlace de imagen de Discord.'))
        .addAttachmentOption(option => option.setName('imagen').setDescription('La imagen del emoji.')),
    )
    .addSubcommand(sub =>
      sub.setName('remove').setDescription('Elimina un emoji del servidor (solo Staff).')
        .addStringOption(option => option.setName('emoji').setDescription('El emoji, su ID o su nombre.').setRequired(true)),
    )
    .addSubcommand(sub =>
      sub.setName('rename').setDescription('Cambia el nombre de un emoji del servidor (solo Staff).')
        .addStringOption(option => option.setName('emoji').setDescription('El emoji, su ID o su nombre.').setRequired(true))
        .addStringOption(option => option.setName('nombre').setDescription('El nombre nuevo.').setRequired(true)),
    ),
  meta: {
    category: CATEGORIES.utility,
    description:
      'Muestra un emoji en grande (`!emoji <emoji>`, con `--info` también su nombre, ID y fecha; sirven los de cualquier servidor, los de Unicode, su ID o el nombre de uno de este servidor). '
      + 'El Staff también puede administrar los emojis del servidor: `add` (con una imagen adjunta, copiando otro emoji o con un enlace de Discord; las imágenes grandes se reducen), `remove` (pide confirmación) y `rename`.',
    aliases: ['emote', 'e'],
  },
  prefix: {
    defaultSubcommand: 'ver',
    subcommandAliases: { view: 'ver', agregar: 'add', remover: 'remove', eliminar: 'remove', renombrar: 'rename' },
  },
  async run(ctx) {
    const handler = SUBCOMMANDS[ctx.options.getSubcommand() ?? 'ver'];
    if (!handler) throw new UserError('subcomando inválido.');
    await handler(ctx);
  },
  components: {
    confirmremove: button({
      guard: staffGuard,
      async run(interaction, [id]) {
        if (!interaction.inCachedGuild()) return;
        const who = whoOf(interaction);

        if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
          throw new UserError('necesito el permiso «Gestionar expresiones» para hacer eso.');
        }
        const emoji = interaction.guild.emojis.cache.get(id) ?? (await interaction.guild.emojis.fetch(id).catch(() => null));
        if (!emoji) return interaction.update({ content: fail(who, 'ese emoji ya no existe.'), components: [] });

        const name = emoji.name ?? 'emoji';
        const image = emojiImages(emoji.id, emoji.animated === true).image;
        try {
          await emoji.delete(`emoji eliminado | Responsable: ${interaction.user.tag}`);
        } catch (error) {
          if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownEmoji) {
            return interaction.update({ content: fail(who, 'ese emoji ya no existe.'), components: [] });
          }
          throw error;
        }

        await interaction.update({ content: ok(who, `el emoji \`:${name}:\` fue eliminado.`), components: [] });
        await modlogOf(interaction.client).post({
          embeds: [emojiLogEmbed({ change: 'remove', moderatorId: interaction.user.id, name, id, imageUrl: image })],
        });
      },
    }),
    cancelremove: button({
      guard: staffGuard,
      async run(interaction) {
        await interaction.update({ content: ok(whoOf(interaction), 'listo, no borré nada.'), components: [] });
      },
    }),
  },
});
