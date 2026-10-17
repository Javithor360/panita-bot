import type { MemberDirectory } from './directory';
import type { BridgeLink } from './link';
import type { MessageConfig } from './messageConfig';
import type { StatusData } from './protocol';
import { clip, fill, resolveEmojis } from './template';

/** A Discord topic holds at most this many characters. */
const MAX_TOPIC = 1024;

/** The topic of the channel: the online text with the server's numbers, or the offline text when there is no status. */
export const renderTopic = (topic: MessageConfig['topic'], status: StatusData | null, emoji: (name: string) => string | undefined): string => {
  if (!status) return clip(resolveEmojis(topic.offline, emoji), MAX_TOPIC);
  const raw = {
    playercount: String(status.online),
    playermax: String(status.max),
    tps: status.tps.toFixed(1),
    uptimemins: String(Math.floor(status.uptimeSeconds / 60)),
    uptimehours: String(Math.floor(status.uptimeSeconds / 3600)),
    serverversion: status.version,
    // A mod that does not report it yet leaves a question mark
    totalplayers: status.totalPlayers === undefined ? '?' : String(status.totalPlayers),
  };
  return clip(fill(resolveEmojis(topic.online, emoji), { raw }, false), MAX_TOPIC);
};

export interface NicknameState {
  discordId: string;
  ign: string;
  /** The nickname the member has in the server, or null for none. */
  current: string | null;
  /** Whether the bot may change it: not the owner, nobody above the bot's role. */
  manageable: boolean;
}

export interface NicknameChange {
  discordId: string;
  ign: string;
  from: string | null;
}

/**
 * Which members' nicknames must change so each is their Minecraft name, even if they changed it themselves. Members the bot
 * cannot rename are counted, not listed.
 */
export const planNicknames = (states: readonly NicknameState[]): { changes: NicknameChange[]; unmanageable: number } => {
  const changes: NicknameChange[] = [];
  let unmanageable = 0;
  for (const state of states) {
    if (state.current === state.ign) continue;
    if (!state.manageable) {
      unmanageable++;
      continue;
    }
    changes.push({ discordId: state.discordId, ign: state.ign, from: state.current });
  }
  return { changes, unmanageable };
};

/** The channel whose topic shows the server. */
export interface TopicChannel {
  topic: string | null;
  setTopic(text: string): Promise<unknown>;
}

/** The part of a guild member the nickname sync touches. */
export interface NicknameMember {
  nickname: string | null;
  manageable: boolean;
  setNickname(nickname: string): Promise<unknown>;
}

export interface SyncDeps {
  link: Pick<BridgeLink, 'connected' | 'request'>;
  /** The channel of the topic, or null when none is joined or it can't be fetched. */
  topicChannel(): Promise<TopicChannel | null>;
  directory: Pick<MemberDirectory, 'refresh' | 'all'>;
  /** The guild member, or null when they left or can't be fetched. */
  fetchMember(discordId: string): Promise<NicknameMember | null>;
  /** The texts of the topic, online and offline. */
  topic: MessageConfig['topic'];
  /** The emoji of the guild with that name, as Discord writes it. */
  emoji(name: string): string | undefined;
  /** While true nothing is changed; what would be is logged. */
  dryRun: boolean;
  logger: Pick<Console, 'log' | 'error'>;
}

/**
 * Updates the topic, but only when the text changed: Discord allows about two edits every ten minutes. `down` writes the offline
 * text without asking, for the moment the server says it is stopping and its line is still open.
 */
export const syncTopic = async (deps: SyncDeps, options: { down?: boolean } = {}) => {
  const channel = await deps.topicChannel();
  if (!channel) return;
  let status: StatusData | null = null;
  if (!options.down && deps.link.connected) status = await deps.link.request('status').catch(() => null);
  const text = renderTopic(deps.topic, status, deps.emoji);
  if (channel.topic === text) return;
  if (deps.dryRun) {
    deps.logger.log(`[Minecraft] Dry run: would set the topic to "${text}".`);
    return;
  }
  await channel.setTopic(text);
};

const syncNicknames = async (deps: SyncDeps) => {
  await deps.directory.refresh();
  const states: NicknameState[] = [];
  for (const member of deps.directory.all()) {
    const guildMember = await deps.fetchMember(member.discord_id);
    if (guildMember) {
      states.push({ discordId: member.discord_id, ign: member.ign, current: guildMember.nickname, manageable: guildMember.manageable });
    }
  }
  const { changes, unmanageable } = planNicknames(states);
  for (const change of changes) {
    if (deps.dryRun) {
      deps.logger.log(`[Minecraft] Dry run: would set the nickname of ${change.discordId} to ${change.ign} (it is ${change.from ?? 'not set'}).`);
      continue;
    }
    const guildMember = await deps.fetchMember(change.discordId);
    await guildMember?.setNickname(change.ign);
  }
  if (changes.length > 0 || unmanageable > 0) {
    deps.logger.log(
      `[Minecraft] Nicknames: ${changes.length} ${deps.dryRun ? 'to change (dry run)' : 'changed'}, ${unmanageable} the bot cannot change.`,
    );
  }
};

/** One run of the sync. Each part fails on its own: a topic that cannot be set does not stop the nicknames. */
export const runSync = async (deps: SyncDeps): Promise<void> => {
  for (const [name, step] of [
    ['topic', syncTopic],
    ['nicknames', syncNicknames],
  ] as const) {
    try {
      await step(deps);
    } catch (error) {
      deps.logger.error(`[Minecraft] The ${name} sync failed:`, error);
    }
  }
};

/**
 * Runs the sync a little after the start and then every `minutes`. Runs never overlap, and a run that fails is only logged.
 * Returns a function that stops it.
 */
export const startSync = (deps: SyncDeps, minutes: number): (() => void) => {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runSync(deps);
    } finally {
      running = false;
    }
  };
  const first = setTimeout(() => void run(), 20_000);
  const every = setInterval(() => void run(), minutes * 60_000);
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
};
