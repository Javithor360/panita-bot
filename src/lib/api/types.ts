/**
 * Types of the API responses the bot uses, named as in the OpenAPI document (`panita-api/docs/openapi.yaml`).
 * Dates arrive as ISO strings; services convert them where the bot needs a `Date`.
 */

/** A success body: `{ data }`, plus `meta` on lists. */
export interface ApiEnvelope<T, M = undefined> {
  data: T;
  meta: M;
}

export interface ListMeta {
  count: number;
}

export type ApiClientName = 'web' | 'bot' | 'launcher' | 'mod';

/** `GET /v1/whoami` */
export interface WhoAmI {
  client: ApiClientName;
}

/** One web → Discord change from `GET /v1/discord/sync-events`. */
export interface SyncEvent {
  /** Grows with time; used as the cursor. */
  id: number;
  kind: 'role' | 'edition';
  action: 'add' | 'remove';
  user_id: number;
  discord_id: string;
  discord_role_id: string;
  /** The client that caused the change (`web`, `bot`, …). */
  origin: string;
  created_at: string;
}

export interface SyncEventsMeta extends ListMeta {
  cursor: number;
}

/** `/v1/ticket-panels` */
export interface TicketPanel {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  staff_role_id: string | null;
  /** The last ticket number handed out. */
  ticket_counter: number;
  show_panel_id_in_name: boolean;
}

export type TicketStatus = 'OPEN' | 'CLOSED';

/** `/v1/tickets` */
export interface Ticket {
  id: string;
  panel_id: string;
  channel_id: string;
  creator_id: string;
  status: TicketStatus;
  created_at: string;
}

/** `GET /v1/tickets/by-channel/{channelId}` */
export interface TicketWithPanel extends Ticket {
  panel: TicketPanel;
}

/** Whether a player signs in to the Minecraft server with a Microsoft (premium) account or not. */
export type MinecraftStatus = 'premium' | 'cracked';

/** The bot's view of an account (`/v1/discord/users`). */
export interface BotUser {
  id: number;
  discord_id: string;
  enabled: boolean;
  /** Kept when the account is deactivated, so a returning member already has one. */
  ign: string | null;
  /** `null` until the member chooses it (everyone who was active before the status existed). */
  minecraft_status: MinecraftStatus | null;
  /** Whether a legacy password is set; never the hash. */
  has_password: boolean;
}

/** `PUT /v1/discord/users/{discordId}` */
export interface EnsureUserResult {
  user: BotUser;
  created: boolean;
}

/** `PUT /v1/discord/users/{discordId}/roles` */
export interface RoleSyncCounts {
  rolesAdded: number;
  rolesRemoved: number;
  editionsAdded: number;
  editionsRemoved: number;
}

/** `POST /v1/discord/members/resync` */
export interface ResyncSummary {
  processed: number;
  created: number;
  /** Members repeated within the chunk. */
  skipped: number;
}

/** `POST /v1/discord/users/bulk-delete` */
export interface BulkDeleteResult {
  deleted: number;
  skipped: { discord_id: string; reason: 'owns_content' }[];
}

/** `/v1/tags` */
export interface Tag {
  id: string;
  name: string;
  content: string | null;
  media_urls: string[];
  author_id: string;
  created_at: string;
}

/** `GET /v1/photos/random` */
export interface RandomPhoto {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  date_taken: string | null;
  created_at: string;
  user: { ign: string | null } | null;
  edition: { id: string; name: string } | null;
  categories: { id: string; name: string }[];
}

/** `POST /v1/discord/login-requests/confirm`: all the bot may show the member about the sign-in. */
export interface ConfirmedLogin {
  application: 'Web' | 'Launcher';
  /** The member's IGN, or their Discord name when they have none. */
  username: string;
  requested_at: string;
}

/** An open session in `GET /v1/discord/users/{discordId}/sessions`. */
export interface BotSession {
  id: string;
  client: 'web' | 'launcher';
  label: string;
  created_at: string;
  last_used_at: string;
  /** `null` for sessions that never expire (the launcher). */
  expires_at: string | null;
}

/** `GET /v1/discord/users/enabled-ids` */
export interface EnabledIdsMeta extends ListMeta {
  /** The `after` of the next page (an account id), or null on the last page. */
  next_after: number | null;
}

/** An item of `GET /v1/discord/users/enabled-members`: an enabled account with its Minecraft name. */
export interface EnabledMember {
  discord_id: string;
  ign: string;
  /** `null` until the member chooses it. */
  minecraft_status: MinecraftStatus | null;
}

/** `POST /v1/discord/users/{discordId}/deactivate` */
export interface DeactivateResult {
  /** False when the account was already disabled or had never existed. */
  deactivated: boolean;
}

/** How the bot must deliver a password reset: by DM first, in the public channel once the member agreed. */
export type ResetDelivery = 'dm' | 'channel';

/** An item of `GET /v1/discord/password-resets/pending`. The same call tells the API the bot is alive. */
export interface PendingReset {
  id: string;
  discord_id: string;
  delivery: ResetDelivery;
}

/** What the bot reports in `POST /v1/discord/password-resets/{id}/delivery`. */
export type ReportedDelivery = 'delivered' | 'dms_closed' | 'failed';
