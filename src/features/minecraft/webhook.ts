/** The Discord error for a webhook that was deleted. */
const UNKNOWN_WEBHOOK = 10015;

export interface HookMessage {
  content: string;
  username: string;
  avatarURL: string;
  allowedMentions: { parse: [] };
}

/** A webhook the bot made and can send with. */
export interface Hook {
  name: string;
  send(message: HookMessage): Promise<unknown>;
}

/** A channel's webhooks, as far as the bridge needs them. */
export interface HookChannel {
  /** The webhooks the bot itself made here: Discord only gives the address to the maker. */
  ownHooks(): Promise<Hook[]>;
  createHook(name: string): Promise<Hook>;
}

export type HookChannelResolver = (channelId: string) => Promise<HookChannel | null>;

export interface PostedMessage {
  username: string;
  avatarUrl: string;
  content: string;
}

const MAX_CONTENT = 2000;
/** Discord refuses webhook names that contain these words, so a player called that would never be heard. */
const RESERVED = /(dis)(cord)|(cly)(de)/gi;
const ZERO_WIDTH_SPACE = '​';

/** A name Discord accepts for a webhook: an invisible space inside the words it refuses, and at most 80 characters. */
export const safeUsername = (name: string) =>
  name
    .replace(RESERVED, (_match, a: string | undefined, b: string | undefined, c: string | undefined, d: string | undefined) =>
      a ? `${a}${ZERO_WIDTH_SPACE}${b}` : `${c}${ZERO_WIDTH_SPACE}${d}`,
    )
    .slice(0, 80);

/**
 * Posts players' messages to a channel with their own name and head, which only a webhook can do. The bot makes its own webhook
 * in each channel the first time it is needed and finds it again afterwards, so nobody has to copy an address around. Nobody
 * is ever mentioned, whatever the text says.
 */
export class WebhookPoster {
  private readonly hooks = new Map<string, Promise<Hook | null>>();

  constructor(
    private readonly channels: HookChannelResolver,
    private readonly webhookName: string,
    private readonly logger: Pick<Console, 'error'> = console,
  ) {}

  async post(channelId: string, message: PostedMessage): Promise<void> {
    const payload: HookMessage = {
      content: message.content.slice(0, MAX_CONTENT),
      username: safeUsername(message.username),
      avatarURL: message.avatarUrl,
      allowedMentions: { parse: [] },
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      const hook = await this.hookOf(channelId);
      if (!hook) return;
      try {
        await hook.send(payload);
        return;
      } catch (error) {
        // Someone deleted it: make a new one and try once more
        if ((error as { code?: number }).code === UNKNOWN_WEBHOOK) {
          this.hooks.delete(channelId);
          continue;
        }
        this.logger.error(`[Minecraft] Could not post to channel ${channelId}:`, error);
        return;
      }
    }
  }

  private hookOf(channelId: string): Promise<Hook | null> {
    let known = this.hooks.get(channelId);
    if (!known) {
      known = this.find(channelId).then(hook => {
        // A channel that could not be reached is tried again next time
        if (!hook) this.hooks.delete(channelId);
        return hook;
      });
      this.hooks.set(channelId, known);
    }
    return known;
  }

  private async find(channelId: string): Promise<Hook | null> {
    try {
      const channel = await this.channels(channelId);
      if (!channel) return null;
      const own = (await channel.ownHooks()).find(hook => hook.name === this.webhookName);
      return own ?? (await channel.createHook(this.webhookName));
    } catch (error) {
      this.logger.error(`[Minecraft] Could not get a webhook for channel ${channelId}:`, error);
      return null;
    }
  }
}
