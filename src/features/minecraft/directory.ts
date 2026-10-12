import type { EnabledMember } from '../../lib/api/types';

/** How long the list of members is trusted before it is read again. */
const FRESH_FOR_MS = 60_000;
/** A member who just activated their account is looked for again, but not more often than this. */
const MISS_REFRESH_MS = 10_000;

export interface DirectoryDeps {
  /** Reads every enabled member with a Minecraft name. */
  fetchAll(): Promise<EnabledMember[]>;
  now?(): number;
  logger?: Pick<Console, 'error'>;
}

/**
 * The enabled members and their Minecraft names, kept in memory so a chat message or a join does not cost a request. It tells
 * who is linked (the account is enabled and has a name), what their name is, and who a name belongs to. A failed read keeps what
 * was known.
 */
export class MemberDirectory {
  private members: EnabledMember[] = [];
  private byId = new Map<string, EnabledMember>();
  private byName = new Map<string, EnabledMember>();
  private readAt: number | null = null;
  private reading: Promise<void> | null = null;
  private readonly now: () => number;
  private readonly logger: Pick<Console, 'error'>;

  constructor(private readonly deps: DirectoryDeps) {
    this.now = deps.now ?? Date.now;
    this.logger = deps.logger ?? console;
  }

  /** Every member known, as of the last read. */
  all(): EnabledMember[] {
    return this.members;
  }

  /** Reads the members again. Calls that overlap share one read. */
  refresh(): Promise<void> {
    this.reading ??= this.deps
      .fetchAll()
      .then(members => {
        this.members = members;
        this.byId = new Map(members.map(member => [member.discord_id, member]));
        this.byName = new Map(members.map(member => [member.ign.toLowerCase(), member]));
        this.readAt = this.now();
      })
      .catch(error => this.logger.error('[Minecraft] Could not read the linked members:', error))
      .finally(() => {
        this.reading = null;
      });
    return this.reading;
  }

  async byDiscordId(discordId: string): Promise<EnabledMember | undefined> {
    return this.find(() => this.byId.get(discordId));
  }

  async byIgn(ign: string): Promise<EnabledMember | undefined> {
    return this.find(() => this.byName.get(ign.toLowerCase()));
  }

  private async find(lookup: () => EnabledMember | undefined): Promise<EnabledMember | undefined> {
    const age = this.readAt === null ? Infinity : this.now() - this.readAt;
    if (age > FRESH_FOR_MS) await this.refresh();
    const found = lookup();
    if (found) return found;
    // Not found: someone may have activated their account since the last read
    if (this.readAt !== null && this.now() - this.readAt > MISS_REFRESH_MS) {
      await this.refresh();
      return lookup();
    }
    return undefined;
  }
}
