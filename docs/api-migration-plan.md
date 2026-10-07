# Panita Bot → Panita API migration plan

Status: draft for review, written 2026-10-06. Companion to `panita-api/docs/api-expansion-plan.md`, which describes what the API provides. This document covers only what the **bot** has to change, in what order, and how to verify each step.

The API is live at `https://api.panitacraft.com` and already has an endpoint for everything the bot reads or writes. Its full reference is at `/docs` (administrators and moderators sign in with their website account). The bot's service key (`PANITA_API_KEY`) already exists in the bot's `.env` and in the hosting environment.

## Contents

1. [Goal and exit criteria](#1-goal-and-exit-criteria)
2. [Ground rules](#2-ground-rules)
3. [Where the bot touches the database today](#3-where-the-bot-touches-the-database-today)
4. [Target architecture](#4-target-architecture)
5. [Discord timing rules](#5-discord-timing-rules)
6. [Migration slices](#6-migration-slices)
7. [Behaviour changes people will notice](#7-behaviour-changes-people-will-notice)
8. [Testing strategy](#8-testing-strategy)
9. [Deployment and rollback](#9-deployment-and-rollback)
10. [Observability](#10-observability)
11. [Risks](#11-risks)
12. [Decisions needed](#12-decisions-needed)
13. [Order and effort](#13-order-and-effort)
- [Appendix A: endpoint map](#appendix-a-endpoint-map)
- [Appendix B: error mapping](#appendix-b-error-mapping)
- [Appendix C: API client skeleton](#appendix-c-api-client-skeleton)
- [Appendix D: outbox poller algorithm](#appendix-d-outbox-poller-algorithm)
- [Appendix E: manual QA checklist](#appendix-e-manual-qa-checklist)

---

## 1. Goal and exit criteria

**Goal:** the bot stops talking to PostgreSQL. Every read and write goes through the API with the bot's service key, and the Web → Discord sync stops using `LISTEN/NOTIFY`.

**Exit criteria** (all must hold):

- `package.json` no longer lists `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg` or `bcryptjs`, and the repository has no `prisma/`, `prisma.config.ts`, `src/generated/` or `src/lib/prisma.ts`.
- `DATABASE_URL` and `DIRECT_URL` are gone from `config/env.ts`, from the hosting environment and from the README.
- Every command, button and event behaves as it does today, except the changes listed in [section 7](#7-behaviour-changes-people-will-notice). Appendix E passes.
- Role and edition changes made on the website reach Discord through the API's outbox (`GET /v1/discord/sync-events`).
- `README.md` and `.agents/AGENTS.md` describe the new architecture.

## 2. Ground rules

- **Behaviour parity first.** Spanish messages and command behaviour stay as they are unless listed in section 7.
- **Thin, shippable slices.** Each slice leaves a working bot, is deployed on its own, and can be reverted with one `git revert`. Prisma code stays in the repository until the last slice, so a revert always has something to go back to.
- **Same layering as today.** Commands, events and features keep calling `services/*`. Only the inside of each service changes. The API client is imported by services only (and by `index.ts` for the startup check), mirroring the current rule "Prisma only in `services/`".
- **No new runtime dependency.** Node 22 has `fetch`, `AbortSignal.timeout` and `crypto.randomUUID`. Nothing is added to `dependencies`.
- **Conventions of this repository** (`.agents/AGENTS.md`): commits are `type: subject` with Javithor360 as the only author and no co-author or attribution lines; every commit passes `npx tsc --noEmit` and `npm test`; environment variables are read only in `config/env.ts`; external URLs live in `config/constants.ts`.
- **No schema changes** from this repository, as today. `prisma/schema.prisma` stays untouched until it is deleted in the last slice.
- **Secrets.** Never print, log or commit the key. Never log request bodies (the activation body carries a password).
- **The API is shared and has no staging database.** Anything a test writes goes to the production database. See [section 8](#8-testing-strategy) for how to test without polluting it.

## 3. Where the bot touches the database today

Everything below is inside `services/` and `lib/prisma.ts`; the rest of the bot never imports Prisma. Only `services/gallery.ts`, `services/tickets.ts` and `services/users.ts` leak Prisma *types* to callers (`GalleryPhoto`, `PanelConfigUpdate`, the `User` row), which is why the first step of each slice defines bot-owned types.

| Area | Service | Operations today | Called from | Slice |
|---|---|---|---|---|
| Random photo | `services/gallery.ts` | `count` + `findFirst` with a random `skip`, including user, categories and edition | `commands/fun/gallery.ts` (run, reroll) | 1 |
| Tags | `services/tags.ts` | `findMany`, `findUnique`, `upsert`, `deleteMany` | `commands/moderation/tag.ts` | 2 |
| Ticket panels and tickets | `services/tickets.ts` | panel CRUD, atomic counter increment, ticket create, find by channel, find open by creator, set status | `commands/tickets/{ticket,close,add,remove}.ts`, `features/tickets/{components,context}.ts` | 3 |
| Accounts | `services/users.ts` | find, ensure (role lookup + create, race-tolerant), update profile, activate (bcrypt + update), bulk delete | `commands/general/register.ts`, `commands/developer/cleanalts.ts`, `events/{guildMemberAdd,guildMemberUpdate,userUpdate}.ts` | 4 |
| Discord role mirror | `services/memberSync.ts` | per member: 1 read, 2 reads, up to 1 role update, 1 read, up to 2 edition writes; full resync in groups of 5 | `events/guildMemberUpdate.ts`, `commands/developer/systemsync.ts` | 4 |
| Deleted Discord role | `services/roles.ts` | `updateMany` clearing `discord_role_id` | `events/roleEvents.ts` | 4 |
| Web → Discord | `services/pgSync.ts` | raw `pg` connection on `DIRECT_URL` running `LISTEN discord_sync`, plus 3 Prisma reads per event | `index.ts` (`startPgSync`) | 5 |
| Infrastructure | `lib/prisma.ts`, `config/env.ts`, `package.json` | client, `DATABASE_URL`, `DIRECT_URL`, `postinstall: prisma generate` | everywhere | 6 |

## 4. Target architecture

```
src/
  lib/api/
    client.ts     ApiClient: one request method, timeouts, retries, concurrency limit, logging
    errors.ts     ApiError and the helpers that classify it
    types.ts      Types of the API responses the bot uses (named as in the OpenAPI document)
    index.ts      the shared client instance
  services/       same module names and exports as today, now backed by the client
```

**Client behaviour** (details and code in Appendix C):

- Base URL from `PANITA_API_URL` (default `https://api.panitacraft.com`), key from `PANITA_API_KEY`, sent as `X-Api-Key`. Path parameters are always passed through `encodeURIComponent`.
- JSON in, JSON out. Success bodies are `{ "data": ... }` (lists also have `meta`). Errors are `{ "error": { "code", "message", "details" } }` and become an `ApiError` carrying `status`, `code`, `details` and the `X-Request-Id` of the response, which identifies the call in the API's logs.
- A body that is not that envelope (for example a `429` from the firewall) becomes an `ApiError` with `code: "http_<status>"`. A network failure or a timeout becomes `ApiError` with status `0` and code `network` or `timeout`.
- **Timeouts:** 8 s by default, 30 s for the resync chunks, 2 s for the calls made before a Discord interaction has been acknowledged (section 5).
- **Retries:** at most 2, with exponential backoff and jitter, only for idempotent calls (`GET`, `PUT`, `DELETE` and the calls explicitly marked) and only for network failures, timeouts, `502`, `503`, `504` and `429`. Never for other `4xx`. Never for `POST /v1/tickets`, `POST …/activate` or `POST …/next-number`, which are not idempotent.
- **Concurrency limit:** at most 6 requests in flight; the rest wait. Without it, a burst of member joins (a raid) would open one request per join.
- **Logging:** one line per call without bodies (section 10).

**Startup check.** After the environment is validated, `index.ts` calls `GET /v1/whoami`. If the answer is `401`, `403` or a client other than `bot`, the bot logs a clear message and exits, like it does today for missing variables. Any other failure (network, `5xx`) only logs a warning: the bot should still start when the API is briefly down.

**Types.** The bot's API types are written by hand in `lib/api/types.ts`, about a dozen small interfaces named like the OpenAPI schemas (`BotUser`, `TicketPanel`, `Ticket`, `TicketWithPanel`, `Tag`, `RandomPhoto`, `RoleSyncCounts`, `ResyncSummary`, `BulkDeleteResult`, `SyncEvent`). Dates arrive as ISO strings; services convert them where the bot needs a `Date` (only the gallery). See decision D4 for generating them instead.

**Configuration.** `config/env.ts` gains `PANITA_API_KEY` (required) and `PANITA_API_URL` (optional, with the default above). The default URL is a constant, not a literal in the client.

**Errors shown to people.** `core/errors.ts` learns about `ApiError`:

- A transient failure (network, timeout, `429`, `5xx`) becomes a `UserError` with the new message `❌ El servicio no está disponible en este momento. Inténtalo de nuevo en unos segundos.`
- A rejected key (`401`, `403`) is logged loudly and shown as the generic error.
- Everything call-specific (404 → "not found", 409 → "already taken") is decided in the service or the command, using the table in Appendix B.

## 5. Discord timing rules

Discord requires an interaction to be acknowledged within **3 seconds**. Database queries took tens of milliseconds; API calls take hundreds (measured from a developer machine: p95 about 0.5 s, and a cold function can add more). The rules:

1. **Acknowledge first, call the API second.** `defer` (or `deferReply`/`deferUpdate`) before the first API call wherever the flow allows it. The visibility chosen when deferring (ephemeral or public) cannot change later.
2. **A call made before acknowledging must be single and short:** one request, 2 s timeout, no retries, and a message to the user if it times out.
3. **Gateway events have no deadline**, but must never throw. A failing API call is logged and dropped, as a failing database call is today.
4. **Prefix commands have no deadline** either; `ctx.defer()` already sends the typing indicator.

Every path that touches data, checked against the current code:

| Path | Today | Change |
|---|---|---|
| `/register` (command) | `ensureUser` and `syncProfile` run **before** the reply | `await ctx.defer({ ephemeral: true })` first |
| `/register` modal submit | validates, then `deferReply`, then queries | unchanged |
| `/gallery`, reroll | defers first | unchanged |
| `/tag list`, `/tag add`, `/tag delete` | query **before** replying | defer first (list: public, add and delete: ephemeral). See section 7 |
| `!tag <name>` (prefix) | queries, then sends | unchanged; optionally cache (D3) |
| `/ticket …` subcommands, `/close`, `/add`, `/remove` | defer first | unchanged |
| Create Ticket button | `deferReply` first | unchanged |
| Ticket buttons with a `guard` (close prompt/confirm/cancel, reopen, delete, transcript) | the router runs the guard, which calls `findTicketByChannel` **before** the handler acknowledges, and the handler then fetches the same ticket again | memoize the lookup per interaction so guard and handler share **one** call, and give it the 2 s timeout. If measurements show pre-ack times above 1.5 s, redesign: let a handler declare an `ack` mode that the router applies before the guard (decision D7) |
| `/systemsync`, `/cleanalts` | defer first | unchanged |

## 6. Migration slices

Slices 1 to 4 are independent of each other and of the website; slice 0 comes first, slice 5 has a hard dependency on the website, slice 6 comes last. Each slice ends with: tests passing, deploy, manual verification from Appendix E, and a day or more of normal use before the next one.

### Slice 0: Foundations (no behaviour change)

- **Files:** new `lib/api/{client,errors,types,index}.ts`; `config/env.ts`; `core/errors.ts`; `index.ts` (startup check); `package.json` (script `smoke:api`); new `src/scripts/api-smoke.ts`; `test/apiClient.test.ts`; README configuration table.
- **Work:** the client of section 4 and Appendix C; `ApiError` handling in `core/errors.ts`; the startup check; an `npm run smoke:api` script that makes read-only calls (`whoami`, `photos/random`, `tags`, `ticket-panels?guild_id=<GUILD_ID>`, `tickets/open` for a made-up user, `discord/sync-events?after=latest`) and exits non-zero on any unexpected status. It never writes.
- **Tests:** headers and URL building; path encoding; success and error envelopes; non-JSON error bodies; timeout; retry only on the listed conditions and never for the non-idempotent calls; concurrency limit; the log line has no body or key.
- **Before deploying:** confirm `PANITA_API_KEY` is set in the hosting environment (the bot will refuse to start without it).
- **Done when:** the bot starts, logs `[API] Connected as bot`, every existing command still works, `npm run smoke:api` passes.
- **Rollback:** revert.

### Slice 1: Gallery (read only, lowest risk)

- **Endpoint:** `GET /v1/photos/random`. `404` means the gallery is empty and maps to `null`, as today.
- **Files:** `services/gallery.ts`; `commands/fun/gallery.ts` (type import only).
- **Types:** `GalleryPhoto` becomes a bot-owned type with `date_taken: Date | null` and `created_at: Date` (converted from the ISO strings), `user: { ign: string | null } | null`, `edition: { id, name } | null`, `categories: { id, name }[]`. These are exactly the fields the embed reads.
- **Behaviour:** the API applies the same filter as `PHOTO_WHERE` (enabled, image, video extensions excluded) and picks the photo on the server, so the two Prisma queries and the `skip` trick disappear.
- **Tests:** a fake client returns a photo (dates become `Date`), a `404` (null) and a `503` (the error propagates).
- **Verify:** `/gallery`, then 🎲 five times, then 🔗; the same through `!gallery`.
- **Rollback:** revert.

### Slice 2: Tags

- **Endpoints:** `GET /v1/tags`, `GET/PUT/DELETE /v1/tags/{name}`.
- **Files:** `services/tags.ts`; `commands/moderation/tag.ts`.
- **Name rule.** The API accepts names of 1 to 64 letters (accents allowed), digits, `_` and `-`. Export `TAG_NAME_PATTERN = /^[\p{L}\p{N}_-]{1,64}$/u` from the service and use it so the bot never sends a name the API would refuse:
  - `getTag` and `deleteTag` with a name that does not match behave as "not found" without a request (so `!tag ¿hola?` still answers "no existe el tag").
  - `saveTag` with a bad name throws a `UserError`: `❌ El nombre del tag solo puede tener letras, números, `-` y `_` (máximo 64 caracteres).`
- **`saveTag`** sends `{ content, media_urls, author_id }`; a tag needs text or at least one attachment (already enforced by the command). Media URLs must be `https`, at most 10 (Discord CDN links qualify; the command accepts one attachment). Also set `.setMaxLength(4000)` on the `texto` option, which is the API's limit.
- **`/tag list/add/delete`** defer first (section 5). `!tag <name>` stays as it is; `refreshAttachmentUrls` still talks to Discord, not the API.
- **Tests:** request shapes for each function; invalid names make no request; `404` on delete returns `false`.
- **Verify** with a throwaway tag (tags are global): add with text, add with an attachment, `!tag <name>`, replace it, list, delete, delete again (not found). Never touch the 34 real tags.
- **Rollback:** revert.

### Slice 3: Tickets

- **Endpoints:** `GET/POST /v1/ticket-panels`, `GET/PATCH/DELETE /v1/ticket-panels/{id}`, `POST /v1/ticket-panels/{id}/next-number`, `POST /v1/tickets`, `GET /v1/tickets/by-channel/{channelId}`, `GET /v1/tickets/open`, `PATCH /v1/tickets/{id}`.
- **Files:** `services/tickets.ts`; `features/tickets/{components,context}.ts`; `commands/tickets/{ticket,close,add,remove}.ts`; new `features/tickets/create.ts`.
- **Types:** `TicketPanel`, `Ticket`, `TicketWithPanel` replace the Prisma rows and `PanelConfigUpdate`. Field names are the same (`staff_role_id`, `category_id`, `ticket_counter`, `show_panel_id_in_name`, `channel_id`, `message_id`, `creator_id`, `status`), so most call sites do not change.
- **Service mapping:**

  | Function | Becomes | Notes |
  |---|---|---|
  | `listPanels(guildId)` | `GET /v1/ticket-panels?guild_id=` | ordered by id |
  | `getPanel(id)` | `GET …/{id}` | `404` → `null`; an id that does not match `PANEL_ID_PATTERN` (staff typed `Soporte`) → `null` without a request |
  | `createPanel` | `POST /v1/ticket-panels` | `409` with `details.field: id` → the existing "ya existe un panel" message |
  | `updatePanel` | `PATCH …/{id}` | `404` → `null`; body is only the fields being changed |
  | `deletePanel` | `DELETE …/{id}` | `404` → the "no se encontró" message. Deleting a panel deletes its tickets, as today |
  | `nextTicketNumber` | `POST …/{id}/next-number` | returns the updated panel; the first ticket of a panel is number 1 |
  | `findTicketByChannel` | `GET /v1/tickets/by-channel/{id}` | `404` is the normal answer in any channel that is not a ticket → `null` |
  | `findOpenTicketByCreator` | `GET /v1/tickets/open?creator_id=&guild_id=` | `200` with `data: null` when none |
  | `createTicket` | `POST /v1/tickets` | see below |
  | `setTicketStatus` | `PATCH /v1/tickets/{id}` | `{ "status": "OPEN" \| "CLOSED" }`, set whatever the current status is |

- **The create flow changes, on purpose.** Today two quick clicks can both pass the "already open" check, create two channels and two ticket rows. The API closes that race: of simultaneous `POST /v1/tickets` for one user in one guild exactly one succeeds. The channel is created *before* the ticket is recorded, so the bot must undo the loser. Extract the orchestration from the button handler into `features/tickets/create.ts`, with the Discord operations injected so it can be unit tested:

  1. `deferReply` (ephemeral) — unchanged.
  2. `findOpenTicketByCreator`; if one exists, reply with the existing message — unchanged (fast path).
  3. `getPanel`; unknown → "no se encontró el panel".
  4. `nextTicketNumber`.
  5. Create the Discord channel.
  6. `POST /v1/tickets`. Outcomes:
     - **201** → welcome message, pin, reply with the new channel — unchanged.
     - **409 `already_open`** (`details.channel_id`) → delete the channel just created (best effort) and reply with the same "ya tienes un ticket abierto en <#channel>" message, using `details.channel_id`. The panel counter has moved, so a number is skipped; that gap is accepted.
     - **409 `channel_taken`** → cannot happen for a fresh channel; log an error, delete the channel, generic reply.
     - **400 `unknown_id`** (the panel was deleted meanwhile) → delete the channel, "no se encontró el panel".
     - **Any other failure** (network, `5xx`) → delete the channel, so no channel is left without a ticket row (today a failed `createTicket` leaves an orphan channel), and show the unavailable message.
- **Guards:** `features/tickets/context.ts` and `components.ts` memoize the ticket lookup per interaction (a `WeakMap` keyed by the interaction) so a guard and its handler make one call, with the pre-ack timeout of section 5.
- **`ticket config counter`:** add `.setMinValue(0)` to the option; the API rejects negative values and anything above 1,000,000,000.
- **Tests:** an adapter test per function (method, path, query, body); the orchestration test with fakes for each outcome above, including that the channel is deleted on every failure path and not on success; the guard memoization.
- **Verify** (Appendix E, tickets): create a ticket, click Create Ticket twice quickly (exactly one channel must remain), close, reopen, transcript, delete; panel create, list, info, every `config`, resend, delete using a throwaway panel id in a private channel. Do not touch the real panels `tezzlar3` and `web` or their counters.
- **Rollback:** revert. Tickets created by the new code are ordinary rows, so the old code reads them.

### Slice 4: Accounts and the Discord → database mirror

- **Endpoints:** `PUT /v1/discord/users/{id}`, `PATCH …/profile`, `POST …/activate`, `PUT …/roles`, `POST /v1/discord/members/resync`, `POST /v1/discord/users/bulk-delete`, `POST /v1/discord/roles/{id}/unmap`.
- **Files:** `services/{users,memberSync,roles}.ts`; `commands/general/register.ts`; `commands/developer/{cleanalts,systemsync}.ts`; `events/{guildMemberAdd,guildMemberUpdate,userUpdate,roleEvents}.ts`.
- **Types:** the Prisma `User` row is replaced by `BotUser` (`id`, `discord_id`, `enabled`, `ign`), which is all the bot reads (`register.ts` only needs `enabled`).
- **Service mapping:**

  | Function | Becomes | Notes |
  |---|---|---|
  | `ensureUser(profile)` | `PUT …/users/{id}` with `{ username, avatar_url, joined_at }` | answers `{ user, created }`; creation is race-safe on the server, so the local `P2002` handling goes away. `joined_at` is `member.joinedAt?.toISOString() ?? null` |
  | `syncProfile` | `PATCH …/profile` | sends only the fields that changed; answers `{ updated }` (0 when the user has no account, not an error) |
  | `activateAccount` | `POST …/activate` with `{ ign, password }` | the API validates and hashes; `bcryptjs` is no longer used |
  | `syncMemberRoles` | `PUT …/roles` with `{ discord_role_ids, remove_editions }` | `404` → `null`, as today. Live events send `true`, resync sends `false` (unchanged) |
  | `resyncMembers` | `POST /v1/discord/members/resync` in chunks of 50 | see below |
  | `deleteUsersByDiscordIds` | `POST …/bulk-delete` in chunks of 500 | answers `{ deleted, skipped: [{ discord_id, reason }] }` |
  | `unmapDiscordRole` | `POST …/roles/{id}/unmap` | answers `{ unmapped }` (0 when no web role was mapped) |

- **`/register`:** defer first (section 5). Keep the cheap local checks that mirror the API exactly (IGN pattern, the two passwords match) so the user gets an instant answer without a request. **Remove the local special-character check**: the rule now lives in the API and allows more characters (`/ [ ] ~` as well), so a second copy would reject valid passwords. Map the API answers: `400` `details.reason` `ign_format` → the existing invalid IGN message, `special` → the existing special-character message, `length` → a new message (`La contraseña debe tener entre 6 y 32 caracteres.`); `409` `conflict` with `details.field: ign` → the existing "IGN ya registrado" message; `409 already_activated` → the existing "ya está activada" message; `404` → run `ensureUser` and retry once, then the generic failure.
- **`resyncMembers`:** the bot still filters bots and alt accounts (a Discord concern), then sends chunks of 50 **one after another** (the API does the work set-based, so a chunk takes about a second and does not grow with its size). The summary adds the API's `created` and `processed` over the chunks; `skipped` is the bot's skips plus the API's (duplicates). `/systemsync` keeps the global sync lock and its reply, so a guild of a thousand members is about 20 sequential calls. The reply is already deferred, so this fits.
- **`/cleanalts`:** the API refuses to delete a user who still owns a form or a wiki article and reports it as skipped with `reason: owns_content`. Add the count to the reply (`N cuentas omitidas porque tienen contenido en la web`).
- **Events:** the sync lock logic in `guildMemberUpdate` and `lib/syncLock.ts` stays exactly as it is.
- **Tests:** an adapter test per function; the activation error mapping; resync chunking (101 members make 3 calls, summaries add up, bots and alts are skipped before any call); bulk delete chunking.
- **Verify:** a new member joining (account created disabled), a username and avatar change, adding and removing a mapped role, a deleted Discord role, the whole `/register` flow including a taken IGN and an invalid password, `/cleanalts` against a test alt, and finally `/systemsync` on the real guild: it must report `0` created and change nothing visible.
- **Rollback:** revert. The writes are the same rows the old code wrote.

### Slice 5: Web → Discord through the outbox (blocked until the website is ready)

**Preconditions, all required:**

1. Panita Web's admin panel changes user roles, user editions and roles **only through the API**. The outbox is written by the API alone; a change the website still makes straight to the database produces no event, so the bot would silently stop seeing it. Check by searching Web for remaining direct writes to user roles, user editions and role deletion.
2. Check with a real round trip before cutting over: make a role change from the Web admin, then `curl` `GET /v1/discord/sync-events?after=<cursor before>` with the bot key and see the event.
3. Slice 4 has run in production for at least a day (the bot's own writes must be stable first).

**Design** (algorithm in Appendix D):

- New `services/webSync.ts` replaces `services/pgSync.ts`; `index.ts` starts it where it starts `startPgSync` now. It still requires `GUILD_ID`.
- On start it asks for `after=latest` and keeps the returned cursor **in memory**: the same as today, where events that happened while the bot was offline are never replayed.
- It polls every 5 seconds with a `setTimeout` chain (never two polls at once) and `limit=100`; a full page is followed immediately by another request.
- It skips events whose `origin` is `bot`, skips (but consumes) everything while a global `/systemsync` is running, and applies the rest with the same logic as `applyEvent` today: fetch the member, compare with the desired state, `withSyncLock`, add or remove the role. The event already carries the Discord ids (`discord_id`, `discord_role_id`), so the three database reads per event disappear.
- Event ids are assigned when a transaction inserts and visible when it commits, so a slow transaction can surface an event *behind* the cursor. The poller therefore asks from `cursor - 20` and ignores ids it has already handled (a bounded set). Applying an event twice is harmless anyway, because it is a no-op when Discord already matches.
- If the API fails, it backs off (1 s doubling to 60 s, like the current reconnect) and logs on the first failure and on recovery, not on every attempt.
- **Latency changes:** `LISTEN` was instant; now a change reaches Discord within the poll interval (5 s by default, decision D1).

**After it works:** keep `pgSync.ts`, `DIRECT_URL` and the `pg` dependency until slice 6 so a revert can go back to `LISTEN`. Then the owner of the API applies `db/0005_drop_discord_sync_notify.sql` (it drops the database triggers; its `.down.sql` restores them).

- **Tests:** the poller with a fake client, fake guild and fake clock: cursor advances; overlap and dedupe; `bot` origin skipped; lock skip; failures back off and recover; a member who left is ignored; an already-matching state does nothing.
- **Verify:** from the Web admin, add a mapped role to a test user and see it in Discord within about 5 s; remove it; add and remove an edition; delete a mapped role from the Web admin and see every holder lose it.
- **Rollback:** revert to `pgSync` (still in the repository).

### Slice 6: Remove Prisma

Only after slices 1 to 5 have been stable in production for a few days.

- **Delete:** `prisma/`, `prisma.config.ts`, `src/generated/` (already ignored), `src/lib/prisma.ts`, `src/services/pgSync.ts`, the `/src/generated/prisma` line of `.gitignore`.
- **`package.json`:** remove `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`, `@types/pg`, `bcryptjs`, `@types/bcryptjs` and the `postinstall` script; refresh `package-lock.json`.
- **`config/env.ts`:** remove `DATABASE_URL` and `DIRECT_URL`. **Hosting:** remove both variables.
- **README:** requirements (an API key replaces "access to the database"), the configuration table, the installation note about `prisma generate`, the "Panita Web synchronization" section (outbox instead of `NOTIFY`), and the known-issues item about edition history (it now belongs to the API and the shared schema, not to the bot).
- **`.agents/AGENTS.md`:** the "Base de datos" rule, the architecture lines that mention Prisma, and the "Sincronización con la base de datos" section.
- **Check:** `npm ls prisma pg bcryptjs` finds nothing; `npm run build`, `npm test` and `npm run smoke:api` pass; the production deploy starts without the two removed variables; one pass of Appendix E.

## 7. Behaviour changes people will notice

| Change | Why |
|---|---|
| Clicking Create Ticket twice no longer produces two tickets: the second channel is removed and the person is pointed to the first | The API enforces one open ticket per user and guild atomically |
| A skipped number can appear in ticket numbering after such a double click | The counter moves before the channel is created |
| An IGN is now rejected if another user has it as an IGN **or** as a Discord name, ignoring case | The API's activation is stricter than the database's case-sensitive unique index |
| Passwords may use a few more special characters, and a too short or too long password gets its own message | One password policy for the bot and the website |
| Role and edition changes made on the website reach Discord within about 5 seconds instead of instantly | Polling replaces `NOTIFY` |
| When the API is down, commands that need data answer "El servicio no está disponible…" | Previously the same situation was a generic error |
| `/tag list` with no tags answers publicly instead of ephemerally | The reply is deferred before the lookup |
| A tag name or panel id with unsupported characters answers "not found" (or a clear format message when creating) | The API validates the format |
| `/cleanalts` reports accounts it skipped because they own web content | The API refuses to delete them |
| Deleting a panel that does not exist answers "no se encontró" | Previously it threw |
| A ticket channel is never left behind without a ticket record if recording it fails | The new create flow cleans up |

## 8. Testing strategy

**Unit tests** (`node:test`, as today, with `mock.method(globalThis, 'fetch')` and injectable clocks and timers):

- The client: everything under slice 0.
- One adapter test per service function: the exact method, path, query and body sent, and the mapping of each documented answer (success, `404`, `409`, `400` reasons) to the value or error the rest of the bot expects.
- The ticket create orchestration, the activation error mapping, resync and bulk-delete chunking, and the outbox poller.

**`npm run smoke:api`** (read-only) runs against the real API after every deploy, from the bot's own environment. It proves the key, the URL and the response shapes the bot depends on.

**Manual QA** follows Appendix E. There is **no staging database**, so:

- Use a **second Discord application and a test guild** for anything that writes, with its own `GUILD_ID`. Never run two instances on the same token.
- Test panels and tickets are scoped by guild, so a test guild cannot touch the real ones. **Tags are global** and accounts are shared: use throwaway names (`zz-test-…`) and delete them afterwards. Members of the test guild get accounts in the real database; use `/cleanalts` on test alts, and do not run `/systemsync` from a large test guild.
- Never modify the real panels (`tezzlar3`, `web`), their counters, or the 34 real tags.
- Read-only checks (`smoke:api`, `/gallery`, `tag list`) are safe to run against the production guild.

## 9. Deployment and rollback

Per slice, on FadeHost:

1. For slice 0 only: confirm `PANITA_API_KEY` (and `PANITA_API_URL` if it is not the default) in the hosting environment.
2. `git pull`, `npm install`, `npm run build`, restart (`npm start`). Run `npm run deploy:prod` only if commands changed (none of these slices change command definitions except the option bounds in slices 2 and 3, which do need it).
3. Watch the logs for the `[API]` lines and `npm run smoke:api`.
4. Roll back with `git revert` of the slice's commits and the same steps. Because Prisma stays in the repository until slice 6, this always works; after slice 5 keep `DIRECT_URL` configured until slice 6.

**API key rotation.** The API accepts two active keys per client, so rotation has no downtime: the API owner adds the new key, you update `PANITA_API_KEY` and restart the bot, then the owner retires the old one. The key is read once at startup, so a restart is required.

**Never** run two instances of the bot with the same token at the same time (already in the README).

## 10. Observability

- One line per API call: `[API] GET /v1/tags/{name} 200 143ms req=<request id>`. The path is the template, not the raw URL; bodies and the key are never logged.
- A warning above 1,500 ms, and an error with `status`, `code` and `req` for every failure. The API logs one JSON line per request with the same `request_id`, so a bot log line leads straight to the server side in Vercel's logs.
- The outbox poller logs its start (with the cursor), the first failure, and the recovery; and one line per applied event (as `[PG-Sync]` does now).
- After slices 1 and 2, read the real numbers (typical and worst call time, how many calls exceed 1,500 ms). They decide decisions D3 and D7.

## 11. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The API is down or slow | Commands that need data fail; events are dropped; the outbox pauses | Clear user message, retries for idempotent calls, backoff in the poller, `/systemsync` repairs drift afterwards |
| Interaction expires (3 s) | "La aplicación no respondió" | Acknowledge first, one short pre-ack call, 2 s timeout (section 5), measure after slice 1 |
| Cold starts on the API | An occasional slow first call | Measure; if it matters, ping the hot routes periodically (decision D3 and the 1,500 ms threshold) |
| Race in ticket creation | An orphan channel | The create flow deletes the loser's channel on every failure path, and it is unit tested |
| Missed web events (events behind the cursor, bot offline) | Discord role not updated | Overlap window and dedupe; offline gaps are the same as with `LISTEN` today; `/systemsync` fixes drift |
| Slice 5 started before the website writes through the API | Web changes never reach Discord | The preconditions and the round-trip check of slice 5 |
| A burst of events (a raid, a mass role change) | Many parallel API calls | The client's concurrency limit of 6 |
| The bot key leaks | Anyone could write bot data | Rotation without downtime (section 9); the key only grants the bot's endpoints, never the website's or admin ones |
| Tests pollute production data | Stray accounts, tags | Test guild and throwaway names (section 8) |
| The API contract changes | Bot breaks | The API contract is versioned (`/v1`), changes are additive, and `smoke:api` runs after every deploy |

## 12. Decisions needed

| # | Question | Recommended default |
|---|---|---|
| D1 | Poll interval of the outbox | 5 s (about 17,000 calls a day; raise to 10 to 15 s if usage matters) |
| D2 | Retries for idempotent calls | 2 retries with backoff, as in section 4 |
| D3 | Cache `!tag <name>` lookups for a short time | No, until measured after slice 2. If added: 30 s, cleared when the bot adds or deletes a tag (only the bot edits tags) |
| D4 | Hand-written API types, or generated from the OpenAPI file | Hand-written (about a dozen interfaces). Generating needs a dev dependency and a way to reach the spec, which lives in the API repository |
| D5 | Is there a second Discord application and a test guild for manual QA? | Yes, create them before slice 3 |
| D6 | Persist the outbox cursor so events during downtime are replayed (the API keeps 7 days) | No: same as today. Revisit if downtime gaps become a problem |
| D7 | Redesign the ticket guards to acknowledge before checking | Only if measured pre-ack time exceeds 1.5 s; until then memoize plus a 2 s timeout |

## 13. Order and effort

```
0 Foundations ──┬─ 1 Gallery ──┐
                ├─ 2 Tags ─────┤
                ├─ 3 Tickets ──┼──► 6 Remove Prisma
                └─ 4 Accounts ─┤        ▲
                               └─ 5 Outbox (needs the website's admin on the API)
```

| Slice | Effort | Notes |
|---|---|---|
| 0 Foundations | small | The client, the smoke script and the tests are the bulk |
| 1 Gallery | small | One endpoint, one type |
| 2 Tags | small | Name validation is the only subtlety |
| 3 Tickets | medium | The new create flow and its tests |
| 4 Accounts and mirror | medium | `/register` mapping, chunked resync |
| 5 Outbox | medium | Blocked by the website; the poller itself is small |
| 6 Remove Prisma | small | Mostly deletion and documentation |

Recommended order: 0, 1, 2, 4, 3, then 5 when the website allows, then 6. Slice 4 before 3 because the account flows are simpler to verify and exercise the client under load (joins, resync), which de-risks the ticket work.

---

## Appendix A: endpoint map

All calls use `X-Api-Key` with the bot key. Success bodies are `{ "data": ... }`.

| Bot function | Method and path | Success | Other answers the bot handles |
|---|---|---|---|
| `getRandomPhoto` | `GET /v1/photos/random` | `RandomPhoto` | `404` empty gallery → `null` |
| `listTags` | `GET /v1/tags` | `Tag[]` ordered by name | |
| `getTag` | `GET /v1/tags/{name}` | `Tag` | `404` → `null` |
| `saveTag` | `PUT /v1/tags/{name}` | `201` created or `200` replaced | `400` invalid name, media or content |
| `deleteTag` | `DELETE /v1/tags/{name}` | `{ deleted: true }` | `404` → `false` |
| `listPanels` | `GET /v1/ticket-panels?guild_id=` | `TicketPanel[]` | `400` without `guild_id` |
| `getPanel` | `GET /v1/ticket-panels/{id}` | `TicketPanel` | `404` → `null` |
| `createPanel` | `POST /v1/ticket-panels` | `201` `TicketPanel` | `409` `details.field: id` |
| `updatePanel` | `PATCH /v1/ticket-panels/{id}` | `TicketPanel` | `404` → `null`; `400` empty or invalid body |
| `deletePanel` | `DELETE /v1/ticket-panels/{id}` | `{ deleted: true }` | `404` |
| `nextTicketNumber` | `POST /v1/ticket-panels/{id}/next-number` | updated `TicketPanel` | `404` |
| `createTicket` | `POST /v1/tickets` | `201` `Ticket` | `409` `details.reason` `already_open` (with `channel_id`) or `channel_taken`; `400` `details.reason: unknown_id` |
| `findTicketByChannel` | `GET /v1/tickets/by-channel/{channelId}` | `TicketWithPanel` | `404` → `null` |
| `findOpenTicketByCreator` | `GET /v1/tickets/open?creator_id=&guild_id=` | `Ticket` or `null` | |
| `setTicketStatus` | `PATCH /v1/tickets/{id}` | `Ticket` | `404`; `400` invalid status |
| `ensureUser` | `PUT /v1/discord/users/{id}` | `{ user: BotUser, created }` (`200` or `201`) | `400` invalid body |
| `findUserByDiscordId` | `GET /v1/discord/users/{id}` | `BotUser` | `404` → `null` |
| `syncProfile` | `PATCH /v1/discord/users/{id}/profile` | `{ updated: 0 \| 1 }` | `400` nothing to update |
| `activateAccount` | `POST /v1/discord/users/{id}/activate` | `{ activated: true }` | see Appendix B |
| `syncMemberRoles` | `PUT /v1/discord/users/{id}/roles` | `RoleSyncCounts` | `404` → `null` |
| `resyncMembers` | `POST /v1/discord/members/resync` (≤ 50 members) | `{ processed, created, skipped }` | `400` over 50 or malformed |
| `deleteUsersByDiscordIds` | `POST /v1/discord/users/bulk-delete` (≤ 500 ids) | `{ deleted, skipped: [{ discord_id, reason }] }` | |
| `unmapDiscordRole` | `POST /v1/discord/roles/{id}/unmap` | `{ unmapped: 0 \| 1 }` | |
| web sync poller | `GET /v1/discord/sync-events?after=&limit=` | `SyncEvent[]` with `meta.cursor` | `after=latest` returns no events and the newest cursor |
| startup check | `GET /v1/whoami` | `{ client: "bot" }` | `401`, `403` |

`SyncEvent`: `id`, `kind` (`role` or `edition`), `action` (`add` or `remove`), `user_id`, `discord_id`, `discord_role_id`, `origin` (`web`, `bot`, …), `created_at`. `RoleSyncCounts`: `rolesAdded`, `rolesRemoved`, `editionsAdded`, `editionsRemoved`.

## Appendix B: error mapping

| Situation | `ApiError` | What the bot does |
|---|---|---|
| Network failure, timeout, `429`, `502`, `503`, `504` | `status` 0 or that status | Retry if idempotent, then the "servicio no disponible" message; in events, log and drop |
| `401`, `403` | rejected key or wrong client | Log an error with the request id; generic reply; startup check exits |
| `404` | `not_found` | Per call: `null`, `false`, or the "not found" message (Appendix A) |
| `400` `invalid_request` | `details.reason` / `details.fields` | A call the bot validates beforehand should never get it: log as a bug. For activation, map the reasons below |
| `409` `conflict` | `details.field` or `details.reason` | Per call (panel id, IGN, `already_open`, `channel_taken`) |
| `409` `already_activated` | | "Tu cuenta ya está activada" |
| `500` `internal_error` | | Unavailable message; log the request id |

Activation: `ign_format` → invalid IGN message; `special` → special-character message; `length` → length message; `409` `conflict` (`details.field: ign`) → "IGN ya registrado"; `409 already_activated` → "ya está activada"; `404` → ensure the account, retry once.

## Appendix C: API client skeleton

A sketch of the shape, not final code. It uses only Node 22 built-ins.

```ts
// lib/api/errors.ts
export class ApiError extends Error {
  constructor(
    readonly status: number,                 // 0 for network failures and timeouts
    readonly code: string,                   // the API's error code, or http_<status>, network, timeout
    message: string,
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
  ) { super(message); }

  get transient() { return this.status === 0 || this.status === 429 || this.status >= 502; }
}

// lib/api/client.ts
export interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  timeoutMs?: number;      // default 8000; 2000 before acknowledging an interaction; 30000 for resync
  idempotent?: boolean;    // default: true for GET, PUT, DELETE
}

export class ApiClient {
  constructor(private readonly baseUrl: string, private readonly key: string) {}

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    // acquire one of the 6 concurrency slots
    // loop up to 3 attempts:
    //   fetch(url, { method, headers: { 'X-Api-Key': key, ... }, body, signal: AbortSignal.timeout(timeoutMs) })
    //   parse JSON if any; on { error } build ApiError; on a non-JSON error body build http_<status>
    //   retry only when options.idempotent !== false && error.transient, after 300 ms * 2^n + jitter
    //   log "[API] METHOD path-template status ms req=id" (no bodies, no key)
    // return body.data (or the whole body for lists, which also need meta)
  }

  get<T>(path: string, options?: RequestOptions) { return this.request<T>('GET', path, options); }
  put<T>(path: string, body: unknown, options?: RequestOptions) { return this.request<T>('PUT', path, { ...options, body }); }
  patch<T>(path: string, body: unknown, options?: RequestOptions) { return this.request<T>('PATCH', path, { ...options, body, idempotent: false }); }
  post<T>(path: string, body?: unknown, options?: RequestOptions) { return this.request<T>('POST', path, { ...options, body, idempotent: false }); }
  delete<T>(path: string, options?: RequestOptions) { return this.request<T>('DELETE', path, options); }
}
```

`PATCH …/profile` is idempotent in effect and may opt in with `idempotent: true`. A service adapter then looks like:

```ts
// services/tags.ts
export const getTag = async (name: string): Promise<Tag | null> => {
  if (!TAG_NAME_PATTERN.test(name)) return null;
  try {
    return await api.get<Tag>(`/v1/tags/${encodeURIComponent(name)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
};
```

## Appendix D: outbox poller algorithm

```
state: cursor (number), handled (bounded set of event ids), failures (number)

start():
  require GUILD_ID
  cursor = GET /v1/discord/sync-events?after=latest  →  meta.cursor
  schedule poll()

poll():
  try:
    do:
      page = GET /v1/discord/sync-events?after=max(0, cursor - 20)&limit=100
      for event in page.data (oldest first):
        if event.id in handled: continue
        handled.add(event.id)                       # keep the newest ~500 ids
        if event.origin == 'bot': continue
        if globalSyncLocked(): continue             # consumed and dropped, as today
        apply(event)                                # never throws; logs failures
      cursor = max(cursor, last id in page.data)
    while page.data.length == 100                   # a full page: ask again at once
    failures = 0 (log "recovered" if it was > 0)
    next = 5 s
  catch:
    failures += 1 (log only the first failure)
    next = min(60 s, 1 s * 2 ** failures)
  setTimeout(poll, next)                            # never two polls at the same time

apply(event):
  guild = client.guilds.cache.get(GUILD_ID); member = guild.members.fetch(event.discord_id) or return
  has = member.roles.cache.has(event.discord_role_id)
  if (event.action == 'add') == has: return        # already in the desired state
  withSyncLock(event.discord_id, add or remove the role)
```

## Appendix E: manual QA checklist

Run the relevant part after each slice (all of it once after slice 6). Use the test guild for anything marked ✎ (it writes). Read-only checks may run in the real guild.

**Always:** the bot starts and logs `[API] Connected as bot`; `npm run smoke:api` passes.

**Gallery (slice 1):** `/gallery` shows author, date, categories and edition; 🎲 five times; 🔗 returns a working link; `!gallery` works; behaviour with an unreachable API (temporarily wrong URL in a local run) is the unavailable message, not a crash.

**Tags (slice 2) ✎:** add a text tag, add a tag with an attachment, `!tag <name>` for both (the image still loads), replace the text, `!tag` with an unknown name, `tag list`, delete, delete again, a name with a space or symbol.

**Tickets (slice 3) ✎:** create a panel in a private channel and see it in `ticket panel list` and `info`; every `ticket config` option (a negative counter is refused); `ticket panel resend`; Create Ticket; click it twice quickly (one channel remains and the second click gets the "ya tienes un ticket abierto" message); `/add`, `/remove`; close prompt, cancel, confirm; the closed controls (transcript, reopen, delete); an old-style button from a pre-existing panel still works; `ticket panel delete` and confirm its tickets are gone; delete an already deleted panel.

**Accounts and mirror (slice 4) ✎:** a new member joins (disabled account created); a returning member's avatar updates; a username change; a mapped role added and removed; an edition role added and removed (`history_text` behaviour unchanged); delete a mapped Discord role; `/register` for an alt (rejected), for a new member (success), with a taken IGN, with an invalid IGN, with mismatched passwords, with a password lacking a special character, with a too short password, twice (already activated); `/cleanalts` with a test alt; on the real guild only, `/systemsync` (read the summary: nothing created, nothing visible changes).

**Outbox (slice 5):** add and remove a mapped role from the website admin and see Discord follow within the poll interval; the same for an edition; delete a mapped role on the website; a change made while `/systemsync` runs is ignored; stop the API briefly (or block the URL locally) and confirm the poller backs off, logs once, and recovers.

**Cleanup (slice 6):** the bot starts with no database variables; `npm ls prisma pg bcryptjs` prints nothing; one pass of every section above.
