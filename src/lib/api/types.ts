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

/** The bot's view of an account (`/v1/discord/users`). */
export interface BotUser {
  id: number;
  discord_id: string;
  enabled: boolean;
  ign: string | null;
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
