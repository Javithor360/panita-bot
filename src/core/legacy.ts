/**
 * TEMPORARY: compatibility shim for command modules that still use the old
 * `{ data, metadata, execute }` shape. Removed once every command is migrated to `defineCommand`.
 */
import { MessageFlags, type ChatInputCommandInteraction, type GuildMember, type Interaction, type Message } from 'discord.js';
import { isDeveloper, isStaff } from '../lib/discord';
import type { CommandData } from './command';

export interface LegacyCommand {
  data: CommandData;
  metadata?: {
    aliases?: string[];
    category?: string;
    description?: string;
    usage?: string;
    slashOnly?: boolean;
    devOnly?: boolean;
    staffOnly?: boolean;
  };
  execute(interaction: any): Promise<unknown>;
  executeButton?(interaction: any): Promise<unknown>;
  executeModal?(interaction: any): Promise<unknown>;
  executeStringSelect?(interaction: any): Promise<unknown>;
}

export const isLegacyCommand = (mod: any): mod is LegacyCommand =>
  !!mod && typeof mod === 'object' && 'data' in mod && typeof mod.execute === 'function';

const legacyDenial = (command: LegacyCommand, member: GuildMember | null, userId: string) => {
  if (command.metadata?.devOnly && !isDeveloper(userId)) return '❌ No estás autorizado para usar este comando.';
  if (command.metadata?.staffOnly && !isStaff(member)) return '❌ No tienes permisos de Staff para usar este comando.';
  return null;
};

export const runLegacySlash = async (command: LegacyCommand, interaction: ChatInputCommandInteraction) => {
  const denial = legacyDenial(command, interaction.member as GuildMember, interaction.user.id);
  if (denial) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });
  await command.execute(interaction);
};

/** Old prefix → fake interaction adapter (moved from index.ts unchanged). */
export const runLegacyPrefix = async (command: LegacyCommand, message: Message, commandName: string, args: string[]) => {
  if (command.metadata?.slashOnly) {
    return message.reply('❌ Este comando es interactivo y solo se puede usar como **Slash Command** (ejemplo: `/' + commandName + '`).');
  }
  const denial = legacyDenial(command, message.member, message.author.id);
  if (denial) return message.reply(denial);

  let sentMessage: Message | null = null;

  const interactionAdapter = {
    isChatInputCommand: () => true,
    user: message.author,
    member: message.member,
    guild: message.guild,
    client: message.client,
    channel: message.channel,
    channelId: message.channelId,
    createdTimestamp: message.createdTimestamp,
    options: {
      getSubcommandGroup: () => {
        if (args.length >= 2 && ['config', 'panel'].includes(args[0]?.toLowerCase())) return args[0]?.toLowerCase();
        return null;
      },
      getSubcommand: () => {
        if (args.length >= 2 && ['config', 'panel'].includes(args[0]?.toLowerCase())) return args[1]?.toLowerCase();
        return args[0]?.toLowerCase() || null;
      },
      getString: (name?: string) => {
        if (name === 'state' || name === 'text') return args.slice(1).join(' ') || null;
        if (name === 'comando') return args[0] || null;
        if (args.length > 1) return args.slice(1).join(' ') || null;
        return args[0] || null;
      },
      getBoolean: () => null,
      getUser: () => {
        const mention = args.find(a => a.startsWith('<@') && a.endsWith('>'));
        if (mention) {
          const id = mention.replace(/[<@!>]/g, '');
          return message.guild?.members.cache.get(id)?.user || { id };
        }
        const lastArg = args[args.length - 1];
        if (!lastArg) return null;
        if (/^\d{17,20}$/.test(lastArg)) return message.guild?.members.cache.get(lastArg)?.user || { id: lastArg };
        const member = message.guild?.members.cache.find(m =>
          m.user.username.toLowerCase() === lastArg.toLowerCase() ||
          (m.user.globalName && m.user.globalName.toLowerCase() === lastArg.toLowerCase()) ||
          (m.nickname && m.nickname.toLowerCase() === lastArg.toLowerCase()),
        );
        return member?.user || null;
      },
      getRole: () => {
        const mention = args.find(a => a.startsWith('<@&') && a.endsWith('>'));
        if (mention) return message.guild?.roles.cache.get(mention.replace(/[<@&>]/g, '')) || null;
        const lastArg = args[args.length - 1];
        if (!lastArg) return null;
        return message.guild?.roles.cache.find(r => r.id === lastArg || r.name.toLowerCase() === lastArg.toLowerCase() || r.name.toLowerCase() === lastArg.replace('@', '').toLowerCase()) || null;
      },
      getChannel: () => {
        const mention = args.find(a => a.startsWith('<#') && a.endsWith('>'));
        if (mention) return message.guild?.channels.cache.get(mention.replace(/[<#>]/g, '')) || null;
        const lastArg = args[args.length - 1];
        if (!lastArg) return null;
        return message.guild?.channels.cache.find(c => c.id === lastArg || c.name.toLowerCase() === lastArg.toLowerCase() || c.name.toLowerCase() === lastArg.replace('#', '').toLowerCase()) || null;
      },
      getInteger: () => {
        const num = parseInt(args[args.length - 1]);
        return isNaN(num) ? null : num;
      },
    },
    deferReply: async () => {},
    reply: async (opts: any) => {
      sentMessage = await message.reply(opts);
      return sentMessage;
    },
    fetchReply: async () => sentMessage,
    editReply: async (opts: any) => {
      if (sentMessage) return sentMessage.edit(opts);
      return message.reply(opts);
    },
    args,
    message,
  };

  await command.execute(interactionAdapter);
};

/** Old prefix-based component routing for commands that are not migrated yet. */
const LEGACY_ROUTES: Array<{ test: (i: Interaction) => boolean; prefix: string; command: string; method: keyof LegacyCommand }> = [
  { test: i => i.isButton(), prefix: 'btn_activate', command: 'register', method: 'executeButton' },
  { test: i => i.isButton(), prefix: 'btn_gallery_', command: 'gallery', method: 'executeButton' },
  { test: i => i.isButton(), prefix: 'btn_ticket_', command: 'ticket', method: 'executeButton' },
  { test: i => i.isModalSubmit(), prefix: 'modal_activate', command: 'register', method: 'executeModal' },
  { test: i => i.isModalSubmit(), prefix: 'modal_ticket_', command: 'ticket', method: 'executeModal' },
  { test: i => i.isStringSelectMenu(), prefix: 'select_skin', command: 'skin', method: 'executeStringSelect' },
];

/** Returns true when a legacy module handled the component. */
export const routeLegacyComponent = async (
  interaction: Interaction & { customId: string },
  legacy: Map<string, LegacyCommand>,
): Promise<boolean> => {
  const route = LEGACY_ROUTES.find(r => r.test(interaction) && interaction.customId.startsWith(r.prefix));
  const handler = route ? legacy.get(route.command)?.[route.method] : undefined;
  if (typeof handler !== 'function') return false;
  await (handler as (i: unknown) => Promise<unknown>)(interaction);
  return true;
};
