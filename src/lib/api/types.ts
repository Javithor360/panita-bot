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

/** What the health probe found: whether the API answered, its version and how long it took. */
export interface ApiHealth {
  online: boolean;
  version: string | null;
  latencyMs: number | null;
}

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
  /** May upload photos to the gallery from Discord (with `enabled`). */
  trusted_author: boolean;
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

/** `GET /v1/discord/users/{discordId}/upload-options`: empty lists when `can_upload` is false. */
export interface UploadOptions {
  can_upload: boolean;
  /** Names the member's Cloudinary folder, exactly as the website does. */
  discord_name: string;
  editions: { id: string; name: string; restricted: boolean }[];
  categories: { id: string; name: string }[];
}

/** `POST /v1/discord/photos` */
export interface DiscordPhotoRequest {
  discord_id: string;
  url: string;
  title: string;
  description?: string | null;
  edition_id: string;
  category_ids: string[];
}

/** The photo `POST /v1/discord/photos` created (the bot only needs its id). */
export interface CreatedPhoto {
  id: string;
}

/** `POST /v1/discord/login-requests/confirm`: all the bot may show the member about the sign-in. */
export interface ConfirmedLogin {
  application: 'Web' | 'Launcher';
  /** The member's IGN, or their Discord name when they have none. */
  username: string;
  requested_at: string;
  /** Typed by the client, so untrusted. Always present; `null` when the client sent none. */
  device_name: string | null;
  device_os: string | null;
}

/** An open session in `GET /v1/discord/users/{discordId}/sessions`. */
export interface BotSession {
  id: string;
  client: 'web' | 'launcher';
  /** The device name, or `Web` / `Launcher` for older sessions. Typed by the client, so untrusted. */
  label: string;
  /** Typed by the client, so untrusted. */
  device_os: string | null;
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

/** An item of `GET /v1/discord/users/birthdays`. The API never returns the year of birth or an age. */
export interface BirthdayMember {
  discord_id: string;
  /** `null` when the member has no Minecraft name. */
  ign: string | null;
  discord_name: string;
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

/** A moderation warning (`/v1/discord/warnings`). A revoked one stays in the history. */
export interface Warning {
  id: string;
  /** Discord id of the warned member; it has no relation to a website account. */
  user_id: string;
  moderator_id: string;
  reason: string;
  created_at: string;
  /** `null` while the warning is active. */
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
}

/** `POST /v1/discord/warnings` */
export interface WarningResult {
  warning: Warning;
  /** The member's warnings that are not revoked, including the one just given. */
  active_count: number;
}

/** `meta` of `GET /v1/discord/users/{discordId}/warnings`: `total` counts what the filter keeps, not the page. */
export interface WarningsMeta extends ListMeta {
  total: number;
  limit: number;
  offset: number;
}

/** An entry of the blacklist (`/v1/discord/blacklist`): a Discord user barred from the bot. A removed one stays in the history. */
export interface BlacklistEntry {
  id: string;
  /** Discord id of the barred user; it has no relation to a website account. */
  user_id: string;
  moderator_id: string;
  reason: string;
  created_at: string;
  /** `null` for a permanent entry. */
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  /** Not removed and not expired, as the API clock sees it. */
  active: boolean;
}

/** `GET /v1/discord/blacklist/users/{discordId}`: `entry` is the active one, or `null`. */
export interface BlacklistStatus {
  blacklisted: boolean;
  entry: BlacklistEntry | null;
}

/** `meta` of `GET /v1/discord/blacklist`: `total` counts what the filter keeps, not the page. */
export interface BlacklistMeta extends ListMeta {
  total: number;
  limit: number;
  offset: number;
}

/** What a hidden profile answers (`GET /v1/bot/players/{ign}` and `.../top-photo`): the name and nothing else. */
export interface BotPlayerPrivate {
  status: 'private';
  ign: string;
}

export type BotEmblemCategory = 'emblem' | 'title' | 'local_emblem' | 'system';

/** `GET /v1/bot/players/{ign}` for a member who shows their profile. A hidden nationality or orientation is `null`. */
export interface BotPlayerVisible {
  status: 'visible';
  ign: string;
  joined_at: string;
  roles: string[];
  emblem_count: number;
  title_count: number;
  /** The first 50 only. */
  emblems: { name: string; category: BotEmblemCategory; edition: string | null }[];
  emblems_truncated: boolean;
  editions: { id: string; name: string }[];
  photo_counts: { images: number; videos: number };
  nationality: string | null;
  orientation: string | null;
  /** Month and day, never the year. */
  birthday: { month: number; day: number } | null;
}

export type BotPlayer = BotPlayerVisible | BotPlayerPrivate;

export interface BotTopPhotoVisible {
  status: 'visible';
  ign: string;
  photo: {
    id: string;
    title: string | null;
    url: string;
    media_type: string;
    like_count: number;
    author_number: number | null;
    created_at: string;
    edition: string | null;
  } | null;
}

export type BotTopPhoto = BotTopPhotoVisible | BotPlayerPrivate;

/** `GET /v1/bot/editions`: public editions only, newest first. The dates are UTC ISO strings. */
export interface BotEditionItem {
  id: string;
  name: string;
  started_at: string | null;
  ended_at: string | null;
  is_canon: boolean;
}

/** `GET /v1/bot/editions/{id}`. `404` for a private edition and an unknown one alike. */
export interface BotEdition extends BotEditionItem {
  synopsis: string | null;
  participant_count: number;
  /** Participants with a hidden profile: counted, never named. */
  hidden_count: number;
  /** Up to 200 names. */
  participants: string[];
  participants_truncated: boolean;
  emblem_count: number;
  emblems: { name: string; category: BotEmblemCategory; holders: number }[];
}

/** `GET /v1/bot/forms`. Never an answer. */
export interface BotForm {
  slug: string;
  title: string;
  description: string | null;
  is_open: boolean;
  require_login: boolean;
  question_count: number;
}

/** `GET /v1/bot/community/panita-picks`: `month` is `yyyy-mm`, `ign` is null when hidden or the account is gone. */
export interface BotPanitaPick {
  month: string;
  ign: string | null;
  private: boolean;
}

/** `GET /v1/bot/community/donors` */
export interface BotDonors {
  current: { ign: string; role: string }[];
  /** The top 20 by number of editions with the `Donador` title. */
  by_edition: { ign: string; editions: number; edition_names: string[] }[];
  hidden_count: number;
}

/** What `/ask` reads of an instance of `GET /v1/instances` (the public catalog). */
export interface InstanceItem {
  slug: string;
  name: string;
  description: string | null;
  source_type: string;
  minecraft_version: string | null;
  loader: string | null;
  enabled: boolean;
}
