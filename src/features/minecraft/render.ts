import { EmbedBuilder } from 'discord.js';
import { discordTimestamp } from '../../lib/format';
import type { EmbedSpec, EventName, Link, MessageConfig } from './messageConfig';
import type { BridgePlayer, EventFrame } from './protocol';
import { clip, fill, isUrl, placeholdersIn, resolveEmojis, type Values } from './template';

/** What a message needs from Discord and from the bridge, read each time one is made. */
export interface Surroundings {
  botName: string;
  botAvatar: string;
  /** Who `{guildowner}` mentions. */
  ownerId?: string;
  /** The icon of the Minecraft server, when the mod sent one. */
  serverIcon: Buffer | null;
  /** The emoji of the guild with that name, as Discord writes it. */
  emoji(name: string): string | undefined;
}

export interface RenderContext extends Surroundings {
  now: Date;
  /** The head of a player. */
  avatarOf(player: BridgePlayer): string;
}

export interface Rendered {
  content?: string;
  embeds: EmbedBuilder[];
  /** Files the embeds point to with `attachment://`. */
  files: Array<{ name: string; data: Buffer }>;
  /** The users the message is allowed to mention: nobody, except the owner when the server crashed. */
  mentions: string[];
}

/** The name of the file the server icon travels as, which the embeds refer to. */
export const SERVER_ICON_FILE = 'server-icon.png';

// What Discord accepts
const MAX_CONTENT = 2000;
const MAX_NAME = 256;
const MAX_DESCRIPTION = 4096;
const MAX_FIELD_VALUE = 1024;
const MAX_FOOTER = 2048;

/** What a player is called in chat, or their name when they have no nickname. */
export const displayNameOf = (player: BridgePlayer) => player.nickname ?? player.name;

/** The name of the webhook for what a player does with `/me`. */
export const emoteNameOf = (config: MessageConfig, player: BridgePlayer): string =>
  fill(config.chat.emoteName, { text: { displayname: displayNameOf(player), username: player.name } }, false);

const PLAYER_EVENTS: readonly EventName[] = ['join', 'first_join', 'leave', 'death', 'advancement'];
const TEXT_OF: Partial<Record<EventName, string>> = { death: 'deathmessage', advancement: 'achievement', broadcast: 'message' };

/** The placeholders of an event, or null when the event has nothing to say (a death without its text, a player event without a player). */
const valuesOf = (kind: EventName, frame: EventFrame | undefined, ctx: RenderContext): Values | null => {
  const text: Record<string, string> = {};
  const raw: Record<string, string> = {
    botname: ctx.botName,
    botavatar: ctx.botAvatar,
    date: discordTimestamp(ctx.now),
    servericon: ctx.serverIcon ? `attachment://${SERVER_ICON_FILE}` : '',
  };
  if (PLAYER_EVENTS.includes(kind)) {
    const player = frame?.player;
    if (!player) return null;
    text.displayname = displayNameOf(player);
    text.username = player.name;
    raw.avatar = ctx.avatarOf(player);
  }
  const placeholder = TEXT_OF[kind];
  if (placeholder) {
    if (!frame?.text) return null;
    text[placeholder] = frame.text;
  }
  if (kind === 'crashed') raw.guildowner = ctx.ownerId ? `<@${ctx.ownerId}>` : '';
  return { text, raw };
};

/**
 * The message for something that happened to the Minecraft server, or null when it posts nothing: the event is off, it lacks what
 * it talks about, or everything in it came out empty.
 */
export const renderEvent = (config: MessageConfig, kind: EventName, frame: EventFrame | undefined, ctx: RenderContext): Rendered | null => {
  const spec = config.events[kind];
  if (spec === false) return null;
  const values = valuesOf(kind, frame, ctx);
  if (!values) return null;

  let attachIcon = false;
  /** Where Discord shows markdown. */
  const markdown = (template: string, max: number) => clip(fill(resolveEmojis(template, ctx.emoji), values, true), max);
  /** Where it does not (names, titles, footers). */
  const plain = (template: string, max: number) => clip(fill(template, values, false), max);
  const address = (template: string | undefined) => {
    if (!template) return undefined;
    if (ctx.serverIcon && placeholdersIn(template).includes('servericon')) attachIcon = true;
    const value = fill(template, values, false);
    return isUrl(value) ? value : undefined;
  };

  const embedOf = (embedSpec: EmbedSpec): EmbedBuilder | null => {
    const embed = new EmbedBuilder().setColor(embedSpec.color);
    let shows = false;
    const named = (link: Link | undefined, max: number) => {
      const text = link ? plain(link.text, max) : '';
      return link && text ? { text, icon: address(link.icon), url: address(link.url) } : undefined;
    };

    const author = named(embedSpec.author, MAX_NAME);
    if (author) {
      embed.setAuthor({ name: author.text, iconURL: author.icon, url: author.url });
      shows = true;
    }
    const title = named(embedSpec.title, MAX_NAME);
    if (title) {
      embed.setTitle(title.text);
      if (title.url) embed.setURL(title.url);
      shows = true;
    }
    const description = embedSpec.description ? markdown(embedSpec.description, MAX_DESCRIPTION) : '';
    if (description) {
      embed.setDescription(description);
      shows = true;
    }
    const thumbnail = address(embedSpec.thumbnail);
    if (thumbnail) {
      embed.setThumbnail(thumbnail);
      shows = true;
    }
    const image = address(embedSpec.image);
    if (image) {
      embed.setImage(image);
      shows = true;
    }
    const footer = named(embedSpec.footer, MAX_FOOTER);
    if (footer) {
      embed.setFooter({ text: footer.text, iconURL: footer.icon });
      shows = true;
    }
    const fields = embedSpec.fields
      .map(field => ({ name: plain(field.name, MAX_NAME), value: markdown(field.value, MAX_FIELD_VALUE), inline: field.inline }))
      .filter(field => field.name && field.value);
    if (fields.length > 0) {
      embed.addFields(fields);
      shows = true;
    }
    if (embedSpec.timestamp) embed.setTimestamp(ctx.now);
    return shows ? embed : null;
  };

  let content: string | undefined;
  let embed: EmbedBuilder | null = null;
  if (typeof spec === 'string') {
    content = markdown(spec, MAX_CONTENT);
  } else {
    content = spec.content ? markdown(spec.content, MAX_CONTENT) : undefined;
    embed = embedOf(spec);
  }
  if (!content && !embed) return null;

  return {
    ...(content ? { content } : {}),
    embeds: embed ? [embed] : [],
    files: attachIcon && ctx.serverIcon ? [{ name: SERVER_ICON_FILE, data: ctx.serverIcon }] : [],
    mentions: kind === 'crashed' && ctx.ownerId ? [ctx.ownerId] : [],
  };
};
