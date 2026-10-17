# Minecraft bridge: the bot's side (master plan)

Status: proposal, 2026-10-12. Not started. This is the master document of the Discord to Minecraft integration. It defines the protocol both sides speak (section 4) and the work in this repository. The mod's work is in `Enriquecraft/docs/discord-bridge-plan.md` (a local file of that repository) and the small API changes are in `panita-api/docs/minecraft-bridge-api-plan.md`.

## 1. Context and reason

The Minecraft server (the Enriquecraft mod) must be joined to Discord: chat in both directions, notifications, a live channel topic, commands such as `/playerlist` and `/tps`, and the sync of the roles and nicknames of linked members. DiscordSRV does this for Paper servers with its own bot.

We first considered a Discord client inside the mod using this bot's token. It was rejected: two programs would answer the same slash commands (this bot answers "Este comando ya no existe" to any command it does not own), `npm run deploy` would delete the mod's commands, and the integration would not show in `/help` or in the deploy. The decision is a **single Discord client: this bot**. The mod never talks to Discord and holds no Discord token. It opens one authenticated connection to the bot and they exchange small JSON messages.

What this gives us:

- New commands are ordinary commands of the `Minecraft` category: in `/help`, slash and prefix from one definition, in the normal deploy. Nothing to coordinate.
- One identity, one set of permissions, one place for Discord rate limits.
- The game never depends on Discord or on this bot: if the bot is down, the server plays on and chat is simply not mirrored.

The cost is that the bridge works only while the bot is up and reachable by the mod (sections 5 and 12).

## 2. What the bot gains

| Piece | Summary |
|---|---|
| Bridge server | A WebSocket endpoint (`/bridge`) on the existing HTTP server. One authenticated connection from the mod. |
| Chat to the game | Messages in a bridged channel, written by **linked** members, are sent to the mod under their IGN. |
| Chat to Discord | Game chat is posted through the bot's own webhook, with the player's nickname (or IGN) and head. |
| Notifications | Join, leave, death, advancement, first join, broadcast, server start and stop, as the bot (embeds). |
| Commands | `/playerlist`, `/tps` (and later ones) in the `Minecraft` category, answered live by the mod. |
| Ten-minute job | Channel topic and nickname set to the IGN. Dry run first. |
| Role at join | A linked member who joins the server gets the "joined the server" role. |

## 3. Facts about the current code that shape this plan

- Commands are one `defineCommand` per file in `src/commands/<category>/`; the registry loads them, `/help` groups them by `meta.category`, slash and prefix come from the same definition, and `npm run deploy` registers them. `ip.ts` is the model of a Minecraft command (`CATEGORIES.minecraft`).
- `src/server.ts` is an express keep-alive on `env.PORT`; it ignores the `http.Server` that `listen` returns. That server can take WebSocket upgrades.
- `ws` 8.21 is installed as a dependency of discord.js but is not declared in `package.json` (**dependency approval needed**: declare `ws` and `@types/ws`; no new code is downloaded).
- `src/config/env.ts` is the only reader of `process.env`; `lib/minecraft.ts` is the only home of head and skin URLs; `config/constants.ts` holds URLs, colors and categories.
- API access exists only in `services/` through `lib/api`. The API has no bulk list of enabled users with their IGN (`enabled-ids` returns ids only): see the API plan.
- `messageCreate` already ignores bot authors (webhooks included) and unknown `!` commands, so the bridge does not disturb it. The prefix is `!`.
- `webSync` is the pattern for background loops: injected dependencies, backoff, tests with fakes. The ten-minute job follows it.
- Repo rules (`.agents/AGENTS.md`): no co-author or "Generated with" lines, conventional subjects only, each commit passes `npx tsc --noEmit` and `npm test`, the bot never touches the database, no request bodies or keys in logs, texts in Spanish.

## 4. The protocol (version 1)

Shared by both sides; the mod plan only points here.

### 4.1 Connection

- The mod connects to `wss://<bot host>/bridge` (plain `ws://` only for localhost). Header `Authorization: Bearer <BRIDGE_KEY>`. The bot checks it with a constant-time comparison **before** upgrading and answers `401` otherwise.
- One mod at a time: a new valid connection closes the old one with code `4000 replaced`.
- The bot pings every 30 s and drops a connection that does not pong in 60 s. The mod reconnects with backoff (1 s doubling to 60 s, with jitter) and treats 90 s without a ping as dead.
- Frames are UTF-8 JSON text, at most 16 KiB. Every frame has `type`. Unknown types and unknown fields are ignored (so a later version can add them); a malformed frame closes the connection with `4003`.

### 4.2 Frames

Mod to bot:

| `type` | Fields |
|---|---|
| `hello` | `protocol` (1), `modVersion`, `minecraftVersion`, `startedAt` (ISO), `maxPlayers`. Sent first. |
| `chat` | `channel` (chat channel id, lowercase), `player`, `text` (at most 256 characters, plain), `emote` (boolean). |
| `event` | `kind` (`join`, `first_join`, `leave`, `death`, `advancement`, `broadcast`, `started`, `stopping`), `player` (not for `broadcast`, `started`, `stopping`), `text` (the game's own English text for `death` and `advancement`, the message for `broadcast`), `key` (the game's translation key, so a later version can translate). |
| `reply` | `id`, `ok`; with `ok: true` a `data` object, otherwise `error` (a code). |

`player` is `{ uuid, name, nickname (or null), premium (boolean) }`. `premium` selects the head template.

Bot to mod:

| `type` | Fields |
|---|---|
| `welcome` | `protocol` (1), `channels` (the chat channels the bot bridges). The mod sends `chat` only for these. |
| `chat` | `channel`, `author` (`{ discordId, ign }`), `text`. Already checked: the author is linked and active. |
| `query` | `id`, `what` (`playerlist`, `tps`, `status`). |
| `error` | `code` (`protocol`, `rate`, `frame`), `message`. Sent before closing. |

Answers of a `query` (`reply.data`): `playerlist` is `{ online: [{ name, nickname }], max }`; `tps` is `{ tps, mspt }`; `status` is `{ online, max, tps, mspt, uptimeSeconds, version }` and, from the messages config (`minecraft-messages-plan.md`), an optional `totalPlayers`. The bot waits 5 s and then tells the member the server did not answer.

Close codes: `4000` replaced, `4002` protocol mismatch (the mod then stays disconnected and says so in `/discord status`), `4003` invalid frame.

### 4.3 Delivery rules

- Best effort, at most once, no acknowledgements. A game line is not replayed by the bot; the mod keeps at most 100 frames for at most 60 s while it reconnects, then drops them. Discord messages are never buffered: while the mod is away they are not delivered.
- Mentions are never live in either direction (`allowedMentions: { parse: [] }` on Discord; the mod treats Discord text as plain text).
- Limits: the bot accepts at most 20 frames per second from the mod; Discord to game is limited to 5 messages per 10 s per member.

## 5. Where the bot and the mod connect (transport)

The server runs locally for now and may later move to a VPS (HolyGG, Contabo); the bot runs on FadeHosting. The mod connects **out** to the bot, so the Minecraft host needs no open port. What must hold is that the bot's host forwards WebSocket upgrades on its public address. This is unknown today, so it is the gate of phase B1.

If it does not, the fallback is the API relay (phase F, last, only for that case): the same frames travel as batches through the API (`panita-api/docs/minecraft-bridge-api-plan.md`, part 2) with a few seconds of latency. Both sides hide the transport behind a small interface (`BridgeLink` here, `BridgeTransport` in the mod), so the relay is a replacement of one class and changes nothing else.

## 6. Design

```
src/features/minecraft/
  protocol.ts      frame types and the validators (hand written type guards, no new dependency)
  link.ts          BridgeLink: the interface the rest uses (send, request, onFrame, state)
  server.ts        WebSocket implementation of BridgeLink: auth, one connection, ping, limits, request/answer with timeout
  inbound.ts       frames from the mod: chat to webhook, events to notifications, the role at join
  outbound.ts      Discord messages to frames: linked check, conversion, rate limit
  webhook.ts       the bot's own webhook per channel: find or create, send, recreate when deleted
  render.ts        the messages for the events, from the config; announcer.ts posts them; crashWatch.ts tells a crash from a stop
  messageConfig.ts reads `config/minecraft-messages.yml` (see `minecraft-messages-plan.md`)
  sync.ts          the ten-minute job: pure planning of topic, nicknames and roles, then applying (dry run)
  messages.ts      Spanish texts
src/events/bridgeMessage.ts   thin: delegates to features/minecraft/outbound
src/commands/minecraft/playerlist.ts, tps.ts
```

### 6.1 Configuration (`config/env.ts`, `constants.ts`)

All optional: without `BRIDGE_KEY` the feature is off and the log says so once.

| Variable | Purpose |
|---|---|
| `BRIDGE_KEY` | The shared secret of the connection. Long and random. |
| `MC_CHANNEL_GLOBAL` | Discord channel id of the global chat. First value: `1559056568794742864`. |
| `MC_CHANNEL_STAFF` | Optional channel for the staff chat. |
| `MC_JOINED_ROLE_ID` | Role given to a linked member when they join the server. First value: `1559056709094342688`. |
| `MC_AVATAR_PREMIUM`, `MC_AVATAR_CRACKED` | Head URL templates with `{uuid}`, `{name}`, `{nickname}`. Defaults in `lib/minecraft.ts`: `https://mc-heads.net/avatar/{uuid}/128` and a fixed Steve head. |
| `MC_SYNC_DRY_RUN` | `true` by default: the job only logs what it would change. |
| `MC_SYNC_MINUTES` | Interval of the job, 15 by default, at least 10. |

The bot's `.env.example` and README are updated in the same commits.

### 6.2 Discord to game

`bridgeMessage` ignores: bot and webhook authors, DMs, other guilds, channels that are not bridged, messages that start with `!` (they are commands), empty messages. For the rest, in order: the bridge must be connected; the author must be linked and active (`GET /v1/discord/users/{id}` through `services/users`, cached 60 s); the rate limit; then the text is converted (mentions resolved to names, custom emojis to `:name:`, attachments and stickers to `[adjunto]` and `[sticker]`, newlines to spaces, at most 256 characters) and sent as `chat`. An author who is not linked gets a ❌ reaction on the message and nothing else.

### 6.3 Game to Discord

`chat` goes through the channel's webhook: `username` is the nickname or IGN, `avatarURL` from the template, `allowedMentions` empty, content at most 2000 characters; an emote is shown in italics. The bot finds a webhook it owns with its name in the channel or creates one (needs Manage Webhooks), and creates a new one if Discord says it was deleted. `event` frames become embeds posted by the bot, with the player's head as author icon. `death` and `advancement` use the game's English text for now (open question 4).

### 6.4 Commands

`/playerlist` (alias `jugadores`) and `/tps` are `everyone`, category Minecraft, thin: send the `query`, render the embed. If the bridge is down they answer with a `UserError` ("El servidor de Minecraft no está conectado en este momento."). A developer-only `/bridge` shows the connection state, the bridged channels and the last frames, for diagnosis. They are added to the `/help` text and the README tables.

### 6.5 The ten-minute job

At ready and then every `MC_SYNC_MINUTES` (never under 10), `sync.ts` builds a plan and applies it:

1. **Topic.** Asks the mod for `status` and renders the topic of `config/minecraft-messages.yml`; when the bridge is down the topic says so. It edits only when the text changed (Discord allows about two edits per ten minutes).
2. **Nicknames.** For every enabled linked member (from the new bulk endpoint of the API), the guild nickname must equal the IGN; others are corrected, even if they changed it. Members the bot cannot change (the owner, higher roles) are skipped and counted.

The role is not part of the job. When a `join` or `first_join` event arrives, the bot finds the linked member of that IGN in its list of enabled users (kept in memory, refreshed by the job and on a miss) and adds the role if they lack it. It is never removed by the bridge, and it is granted again only at a later join, so it does not fight an admin who removed the edition on the web.

Dry run logs "would set nickname of X to Y" and "would add the role to Z" and changes nothing; The plan is a pure function (members, enabled users, roster, config in; actions out) and is tested. The role is an edition role: the existing web sync turns it into the website edition, which is intended.

## 7. Implementation phases

Every phase is one or more commits (conventional subject, no attribution), each passing `npx tsc --noEmit` and `npm test`.

**B0. Approvals and test environment.**
- The owner approves declaring `ws` and `@types/ws`, and the API changes of the API plan.
- A **test Discord application and guild** for development. Running a second copy of the production bot with its token would answer everything twice, so development never uses the production token. Production keeps one application.
- Generate `BRIDGE_KEY` for the test setup.

**B1. Connection.** `ws` dependency, `protocol.ts`, `link.ts`, `server.ts`, `env` entries, the `/bridge` upgrade in `server.ts`, `/bridge` (developer) command. Tests with a real `ws` client in the same process: auth accepted and refused, replacement, ping timeout, oversized and malformed frames, request timeout. **Gate:** deploy this phase to FadeHosting and connect the mod from the local machine. If the host does not forward WebSocket upgrades, go to F before anything else.

**B2. Game to Discord.** `webhook.ts`, `notifications.ts`, `inbound.ts`, `messages.ts`. Tests: webhook reuse and recreation, embed contents, text limits, no live mention.

**B3. Discord to game.** `outbound.ts`, `events/bridgeMessage.ts`. Tests: the filter (bots, webhooks, prefix, channels), the linked check and its cache, the rate limit, the text conversion.

**B4. Commands.** `playerlist`, `tps`, help and README. Tests: the pure formatting of the answers.

**B5. Ten-minute job.** The API's bulk endpoint, `sync.ts`. Tests: the planner (nickname equal, different, unchangeable; role present or missing; dry run) and the topic text.

**F. API relay fallback (only if B1's gate fails).** `RelayLink` in this repository polling the API; see the API plan.

**B6. Docs and deploy.** `README.md` (variables, commands, the bridge), `.agents/AGENTS.md` (the architecture block gets `features/minecraft`), `npm run deploy` for the new commands, and a live check in the test guild and then in `#live-server-test`.

## 8. Tests

Pure functions and the bridge server with an in-process `ws` client; no test needs Discord. Manual, in the test guild with a local mod: connect, wrong key, replace, kill the mod, chat both ways, a linked and an unlinked member, an `@everyone` in game, every event kind, `/playerlist` and `/tps` with the mod up and down, topic, dry run, then live.

## 9. Security

- `BRIDGE_KEY` is a secret: only in the environment, compared in constant time, never logged. A wrong key is logged as a count, not a value. Rotating it is a change in both places.
- Everything from the mod is untrusted input: validated, size-limited, never executed as a command, never able to mention anyone.
- Everything from Discord is plain text for the game; the bot only forwards members it has verified through the API.

## 10. Risks

| Risk | Mitigation |
|---|---|
| The host does not forward WebSocket upgrades | Gate in B1, then the API relay (F). |
| The bot is offline | The game is unaffected; chat is not mirrored; commands say the server is not connected. |
| The nickname job renames people by mistake | Dry run first, then live; skips what the bot cannot change. |
| Webhook or topic rate limits | discord.js queues; the topic is edited only on change and not more than every 10 minutes. |
| The role comes back after an admin removed the edition on the web | Accepted: it is re-added only the next time the player joins. |

## 11. Out of scope

Translating death and advancement texts to Spanish, AFK notifications, running game commands from Discord, a Discord to staff-chat mapping before the global one works, and any change to the role and edition sync.

## 12. Decisions of the owner (2026-10-12)

1. An unlinked member who writes in the bridged channel gets a ❌ reaction and nothing else.
2. The role is granted at join events, not by a periodic roster.
3. Death and advancement lines are in English at first.
4. The staff chat is bridged later, once the global channel works.
4a. While the bridge is developed the production bot is turned off by the owner, and the production token and guild may be used for live checks, carefully (dry run, then one member).
