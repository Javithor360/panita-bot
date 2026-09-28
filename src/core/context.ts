import {
  MessageFlags,
  type Attachment,
  type BaseMessageOptions,
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
  type ModalBuilder,
  type Role,
  type User,
} from 'discord.js';
import { encodeCustomId } from './customId';
import { PrefixUnsupportedError } from './errors';
import type { ParsedValue, ParseSuccess } from './prefixParser';

/**
 * One API over slash interactions and prefix messages. Commands only talk to this, so they never
 * need to know how they were invoked.
 */

export type ReplyPayload = string | (BaseMessageOptions & { ephemeral?: boolean });

type Getter<T> = {
  (name: string, required: true): T;
  (name: string, required?: boolean): T | null;
};

const getter = <T>(read: (name: string) => T | null | undefined): Getter<T> =>
  ((name: string, required?: boolean) => {
    const value = read(name) ?? null;
    if (value === null && required) throw new Error(`[Context] Missing required option "${name}"`);
    return value;
  }) as Getter<T>;

export interface CommandOptions {
  getString: Getter<string>;
  getInteger: Getter<number>;
  getNumber: Getter<number>;
  getBoolean: Getter<boolean>;
  getUser: Getter<User>;
  getRole: Getter<Role>;
  getChannel: Getter<GuildBasedChannel>;
  getAttachment: Getter<Attachment>;
  /** Every attachment provided: attachment options on slash, all message attachments on prefix. */
  getAttachments(): Attachment[];
  getSubcommand(): string | null;
  getSubcommandGroup(): string | null;
}

export interface CommandContext {
  readonly source: 'slash' | 'prefix';
  /** Canonical command name (never an alias). */
  readonly commandName: string;
  readonly user: User;
  readonly member: GuildMember;
  readonly guild: Guild;
  readonly channel: GuildTextBasedChannel | null;
  readonly client: Client<true>;
  readonly createdTimestamp: number;
  readonly options: CommandOptions;

  /** First call replies (or fills a deferred reply); later calls follow up. */
  reply(payload: ReplyPayload): Promise<void>;
  /** Like `reply`, but on prefix it posts to the channel instead of quoting the invoking message. */
  send(payload: ReplyPayload): Promise<void>;
  /** Edits the first response. */
  edit(payload: ReplyPayload): Promise<void>;
  defer(options?: { ephemeral?: boolean }): Promise<void>;
  fetchReply(): Promise<Message>;
  /** Slash only; throws `PrefixUnsupportedError` on prefix. */
  showModal(modal: ModalBuilder): Promise<void>;
  /** Deletes the invoking prefix message. Returns whether it was deleted (always false on slash). */
  deleteTrigger(): Promise<boolean>;
  /** Custom ID in this command's namespace; `owned` restricts the component to the invoking user. */
  customId(action: string, args?: string[], options?: { owned?: boolean }): string;
}

const normalize = (payload: ReplyPayload) => {
  const { ephemeral = false, ...rest } = typeof payload === 'string' ? { content: payload } : payload;
  return { ephemeral, rest: rest as BaseMessageOptions };
};

abstract class BaseContext {
  abstract readonly user: User;
  abstract readonly commandName: string;

  customId(action: string, args: string[] = [], { owned = false } = {}) {
    return encodeCustomId({ namespace: this.commandName, action, args, owner: owned ? this.user.id : undefined });
  }
}

export class SlashContext extends BaseContext implements CommandContext {
  readonly source = 'slash' as const;
  readonly options: CommandOptions;
  private responded = false;

  constructor(private readonly interaction: ChatInputCommandInteraction<'cached'>, readonly commandName: string) {
    super();
    const o = interaction.options;
    this.options = {
      getString: getter(name => o.getString(name)),
      getInteger: getter(name => o.getInteger(name)),
      getNumber: getter(name => o.getNumber(name)),
      getBoolean: getter(name => o.getBoolean(name)),
      getUser: getter(name => o.getUser(name)),
      getRole: getter(name => o.getRole(name)),
      getChannel: getter(name => o.getChannel(name)),
      getAttachment: getter(name => o.getAttachment(name)),
      getAttachments: () => [...(o.resolved?.attachments?.values() ?? [])],
      getSubcommand: () => o.getSubcommand(false),
      getSubcommandGroup: () => o.getSubcommandGroup(false),
    };
  }

  get user() { return this.interaction.user; }
  get member() { return this.interaction.member; }
  get guild() { return this.interaction.guild; }
  get channel() { return this.interaction.channel; }
  get client() { return this.interaction.client; }
  get createdTimestamp() { return this.interaction.createdTimestamp; }

  async reply(payload: ReplyPayload) {
    const { ephemeral, rest } = normalize(payload);
    const flags = ephemeral ? MessageFlags.Ephemeral : undefined;
    if (this.responded) {
      await this.interaction.followUp({ ...rest, flags });
    } else if (this.interaction.deferred) {
      await this.interaction.editReply(rest);
    } else {
      await this.interaction.reply({ ...rest, flags });
    }
    this.responded = true;
  }

  send(payload: ReplyPayload) {
    return this.reply(payload);
  }

  async edit(payload: ReplyPayload) {
    if (!this.interaction.deferred && !this.interaction.replied) return this.reply(payload);
    await this.interaction.editReply(normalize(payload).rest);
    this.responded = true;
  }

  async defer({ ephemeral = false } = {}) {
    if (this.interaction.deferred || this.interaction.replied) return;
    await this.interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});
  }

  fetchReply() {
    return this.interaction.fetchReply();
  }

  async showModal(modal: ModalBuilder) {
    await this.interaction.showModal(modal);
  }

  async deleteTrigger() {
    return false;
  }
}

export class PrefixContext extends BaseContext implements CommandContext {
  readonly source = 'prefix' as const;
  private firstResponse: Message | null = null;

  constructor(
    private readonly message: Message<true>,
    readonly member: GuildMember,
    readonly commandName: string,
    readonly options: CommandOptions,
  ) {
    super();
  }

  get user() { return this.message.author; }
  get guild() { return this.message.guild; }
  get channel() { return this.message.channel; }
  get client() { return this.message.client; }
  get createdTimestamp() { return this.message.createdTimestamp; }

  private track(message: Message) {
    this.firstResponse ??= message;
  }

  async reply(payload: ReplyPayload) {
    this.track(await this.message.reply(normalize(payload).rest));
  }

  async send(payload: ReplyPayload) {
    this.track(await this.message.channel.send(normalize(payload).rest));
  }

  async edit(payload: ReplyPayload) {
    if (!this.firstResponse) return this.reply(payload);
    await this.firstResponse.edit(normalize(payload).rest);
  }

  async defer() {
    await this.message.channel.sendTyping().catch(() => {});
  }

  async fetchReply() {
    if (!this.firstResponse) throw new Error('[Context] No response has been sent yet');
    return this.firstResponse;
  }

  async showModal(): Promise<void> {
    throw new PrefixUnsupportedError();
  }

  async deleteTrigger() {
    if (!this.message.deletable) return false;
    return this.message.delete().then(() => true, () => false);
  }
}

const ENTITY_LABELS = { user: 'el usuario', role: 'el rol', channel: 'el canal', mentionable: 'el usuario o rol' } as const;

const sameName = (a: string | null | undefined, b: string) => !!a && a.toLowerCase() === b.toLowerCase();

const findMemberByName = async (guild: Guild, name: string) => {
  const matches = (m: GuildMember) =>
    sameName(m.user.username, name) || sameName(m.user.globalName, name) || sameName(m.nickname, name);
  const cached = guild.members.cache.find(matches);
  if (cached) return cached;
  const fetched = await guild.members.fetch({ query: name, limit: 10 }).catch(() => null);
  return fetched?.find(matches) ?? null;
};

const resolveUser = async (message: Message<true>, value: { id?: string; name?: string }) => {
  if (value.id) {
    return message.guild.members.cache.get(value.id)?.user
      ?? await message.client.users.fetch(value.id).catch(() => null);
  }
  return (await findMemberByName(message.guild, value.name!))?.user ?? null;
};

const resolveRole = (guild: Guild, value: { id?: string; name?: string }) =>
  value.id
    ? guild.roles.cache.get(value.id) ?? null
    : guild.roles.cache.find(r => sameName(r.name, value.name!.replace(/^@/, ''))) ?? null;

const resolveChannel = (guild: Guild, value: { id?: string; name?: string }) =>
  value.id
    ? guild.channels.cache.get(value.id) ?? null
    : guild.channels.cache.find(c => sameName(c.name, value.name!.replace(/^#/, ''))) ?? null;

const resolveValue = async (message: Message<true>, value: ParsedValue): Promise<unknown> => {
  switch (value.type) {
    case 'user': return resolveUser(message, value);
    case 'role': return resolveRole(message.guild, value);
    case 'channel': return resolveChannel(message.guild, value);
    case 'mentionable': return (await resolveUser(message, value)) ?? resolveRole(message.guild, value);
    case 'attachment': return message.attachments.at(value.index) ?? null;
    default: return value.value;
  }
};

/**
 * Builds the prefix context, resolving mentions/IDs/names into Discord entities.
 * Returns an error message when a referenced user, role or channel doesn't exist.
 */
export const createPrefixContext = async (
  message: Message<true>,
  member: GuildMember,
  commandName: string,
  parsed: Pick<ParseSuccess, 'group' | 'subcommand' | 'values'>,
): Promise<PrefixContext | string> => {
  const resolved = new Map<string, unknown>();

  for (const [name, value] of parsed.values) {
    const entity = await resolveValue(message, value);
    if (entity === null && value.type in ENTITY_LABELS) {
      const label = ENTITY_LABELS[value.type as keyof typeof ENTITY_LABELS];
      const raw = 'name' in value && value.name ? value.name : 'id' in value ? value.id : name;
      return `❌ No se encontró ${label} \`${raw}\`.`;
    }
    resolved.set(name, entity);
  }

  const read = <T>(name: string) => resolved.get(name) as T | undefined;
  const options: CommandOptions = {
    getString: getter(read<string>),
    getInteger: getter(read<number>),
    getNumber: getter(read<number>),
    getBoolean: getter(read<boolean>),
    getUser: getter(read<User>),
    getRole: getter(read<Role>),
    getChannel: getter(read<GuildBasedChannel>),
    getAttachment: getter(read<Attachment>),
    getAttachments: () => [...message.attachments.values()],
    getSubcommand: () => parsed.subcommand,
    getSubcommandGroup: () => parsed.group,
  };

  return new PrefixContext(message, member, commandName, options);
};
