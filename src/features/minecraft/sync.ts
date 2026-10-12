import { formatDuration } from '../../lib/format';
import type { MemberDirectory } from './directory';
import type { BridgeLink } from './link';
import { MC_TEXT } from './messages';
import type { StatusData } from './protocol';

/** A Discord topic holds at most this many characters. */
const MAX_TOPIC = 1024;

/** The topic of the channel: the template with the server's numbers, or a line saying the server is down. */
export const renderTopic = (template: string, status: StatusData | null): string => {
  if (!status) return MC_TEXT.topicDown;
  return template
    .replaceAll('{online}', String(status.online))
    .replaceAll('{max}', String(status.max))
    .replaceAll('{tps}', status.tps.toFixed(1))
    .replaceAll('{uptime}', formatDuration(status.uptimeSeconds * 1000))
    .slice(0, MAX_TOPIC);
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
  topicTemplate: string;
  /** While true nothing is changed; what would be is logged. */
  dryRun: boolean;
  logger: Pick<Console, 'log' | 'error'>;
}

/** Updates the topic, but only when the text changed: Discord allows about two edits every ten minutes. */
const syncTopic = async (deps: SyncDeps) => {
  const channel = await deps.topicChannel();
  if (!channel) return;
  let status: StatusData | null = null;
  if (deps.link.connected) status = await deps.link.request('status').catch(() => null);
  const text = renderTopic(deps.topicTemplate, status);
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
