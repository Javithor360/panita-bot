# Minecraft messages: a config file for what the bot says (plan)

Status: implemented 2026-10-17 on the bot's side; the mod's part (section 9) is pending. Extends `minecraft-bridge-plan.md`; the protocol and the bridge are defined there. Section 9 lists what the mod must do (the mod's own plan is in `Enriquecraft/docs`, a local file of that repository).

## 1. Context and reason

Today the texts and colors of what the bot posts for the Minecraft server are fixed in code (`messages.ts`, `notifications.ts`), and the topic is one environment variable. DiscordSRV, which this bridge replaces, had a `messages.yml` where the owner changes every message without a deploy of code. We want the same: one committed file that holds the messages, with the current look as its defaults.

What this gives us:

- Join, first join, leave, death, advancement, broadcast, server start, server stop and "the server crashed" are written in one file, as plain text or as an embed.
- The channel topic (online and offline) is in the same file.
- A mistake in the file never silences the bridge: each wrong value falls back to its default and is logged.

## 2. Decisions (2026-10-17)

1. **YAML**, read with the `yaml` package (one new dependency, no sub-dependencies). It allows comments, which this file needs to document the placeholders.
2. **The file is committed with the defaults** (`config/minecraft-messages.yml`); changing a message is a commit and a redeploy.
3. A simpler schema than DiscordSRV's: no `Enabled`, `Webhook` or `Content` blocks (the bot posts as itself); `false` turns an event off.
4. Placeholders are written `{name}`, as the topic template already does. PlaceholderAPI, `%world%` and the in-game join text (`%message%`) are **not** supported: the owner writes the message in the file.
5. The crash message is posted when the connection to the mod is lost without a `stopping` event. A server that hangs but stays connected is not detected (a tick heartbeat from the mod would be needed; out of scope).
6. The topic is edited every 15 minutes and also at once when the server starts, stops or crashes.
7. **Broadcasts** keep their embed: the author is the server icon and the text "Anuncio Oficial", and the broadcast text is the description.
8. **`/me`** is a normal webhook message from the player, with `* ` in front of the webhook name (`* Javithor360`) and the text in italics.
9. **`{servericon}` comes from the Minecraft server** (its `server-icon.png`), sent by the mod in the `hello`; there is no URL in the config. The bot attaches the PNG to the message.

## 3. The file

```yaml
# Placeholders: {botname} {botavatar} {date}; player events: {displayname} {username} {avatar};
# death {deathmessage}; advancement {achievement}; broadcast {message}; crashed {guildowner};
# {servericon} (the server's own icon) only in icon, thumbnail and image fields.
# An event is `false` (off), a string (plain message) or an embed:
#   color: "#rrggbb" or a number   author | title | description | footer: text, or { text, icon, url }
#   thumbnail | image: url          fields: [{ name, value, inline }]        timestamp: true
#   content: text sent above the embed
events:
  join:
    color: "#00ff00"
    author: "{displayname} entró al servidor"
  first_join:
    color: "#ffd700"
    author: "{displayname} entró al servidor por primera vez. ¡Bienvenido!"
  leave:
    color: "#ff0000"
    author: "{displayname} salió del servidor"
  death:
    color: "#000000"
    author: "{deathmessage}"
  advancement:
    color: "#ffd700"
    author: "{displayname} completó el logro {achievement}"
  broadcast:
    color: "#5865f2"
    author: { text: "Anuncio Oficial", icon: "{servericon}" }
    description: "{message}"
  started: ":rayThumbsup: **Server despierto**"
  stopping: ":rayEdgy: **El server se ha puesto a mimir.**"
  crashed: "{date} {guildowner}, el servidor ha colapsado 🔥‼️"

# What a player does with /me: the webhook name and, in italics, the text.
chat:
  emote_name: "* {displayname}"

# Seconds without the server before it counts as crashed.
crash_after_seconds: 90

topic:
  online: "{playercount}/{playermax} jugadores en línea | Versión: {serverversion} | Activo por {uptimemins}m"
  offline: "Server mimido <:rayEdgy:745510357715517560>"
  # also {tps} {uptimehours} {totalplayers}
```

Rules:

- **Player events** (`join`, `first_join`, `leave`, `death`, `advancement`) show the player's head as the icon of the author when `author` is a string. Other events have no player.
- **`{servericon}`** is the icon of the Minecraft server. The mod sends `server-icon.png` (base64, at most 10,000 bytes) in the optional `icon` field of the `hello`; the bot checks it (base64, size, PNG signature), and a bad icon is dropped without refusing the hello. When a message uses `{servericon}` and an icon exists, the text becomes `attachment://server-icon.png` and the message carries the file; with no icon the field is left out, never sent empty. It is allowed only in `icon`, `thumbnail` and `image` fields.
- **`/me`** is a chat line with `emote: true`, posted by the webhook like any chat: the webhook name is `chat.emote_name` and the text is in italics (an `*` inside the text is escaped).
- **Emoji** written `:name:` are turned into `<:name:id>` from the home guild's emoji; a name the guild lacks stays as written. Works in messages and topics. Standard emoji must be written as the character (🔥): Discord does not turn `:fire:` into one in a message sent by a bot.
- **Escaping.** A placeholder holds text from the game, so it is escaped for Discord markdown where markdown is shown (`description`, field values, `content`, plain messages) and left as is where it is not (author, title, footer).
- **`{date}`** is a Discord timestamp (`<t:unix:f>`, in each reader's timezone, from `lib/format.ts`). It does not render inside backticks or in an embed author, so the default has no backticks.
- **`{guildowner}`** is the mention of the guild's owner. It is the only mention the bot ever allows, and only in `crashed`; every other message mentions nobody.
- **Limits** of Discord (author and title 256, description 4096, field name 256 and value 1024, footer 2048, 25 fields, 2000 of content, topic 1024) are cut at render, not rejected.

## 4. Facts about the current code that shape this plan

- `notifications.ts#eventEmbed` builds each embed from `MC_TEXT` and `COLORS`; `inbound.ts` posts it through `notify(channelId, embed)` (`discord.ts#notifierOf`), which only sends embeds and mentions nobody.
- `started` and `stopping` already arrive as events (`protocol.ts`); a crash has no frame, only the end of the connection. `BridgeServer` knows it (`dropped`) but `BridgeLink` only exposes frames, so a connection listener is needed. A connection replaced by a new one, or one that closed before its hello, is not a lost server.
- `sync.ts` holds the topic job; `renderTopic` uses `{online}`, `{max}`, `{tps}`, `{uptime}` from `MC_TOPIC_TEMPLATE` and falls back to `MC_TEXT.topicDown`. `syncTopic` is internal and only edits when the text changed.
- `MC_SYNC_MINUTES` exists with a floor of 10 and a default of 10.
- The bridge tests use fakes, never Discord (`test/bridgeInbound.test.ts`, `test/bridgeSync.test.ts`).
- Repo rules: no co-author or "Generated with" lines, conventional subjects, each commit passes `npx tsc --noEmit` and `npm test`, texts in Spanish, `config/env.ts` is the only reader of `process.env`.
- The built code lives in `dist/features/minecraft` and the source in `src/features/minecraft`: both are three folders below the project root, so `config/` is found with `path.resolve(__dirname, '../../../config')` in development and in production.

## 5. Design

New files in `src/features/minecraft/`:

| File | Content |
|---|---|
| `messageConfig.ts` | The types, `DEFAULT_MESSAGES` (the fallback, same values as the committed file), `parseMessageConfig(text, logger)` (pure: YAML text in, config and warnings out) and `loadMessageConfig(path, logger)` (reads the file; a missing file or a YAML syntax error gives all the defaults). Validation is per key: a bad color, a non-string, an unknown placeholder or a field of the wrong shape is logged as `[Minecraft] messages: events.join.color is not a color, using the default` and replaced. Unknown keys are ignored with a warning (typos). |
| `template.ts` | `fill(text, values, { escape })` for `{name}`, `escapeMarkdown`, `resolveEmojis(text, emojiByName)`, `clip`. Pure. |
| `render.ts` | `renderEvent(config, frame, context)` returns `{ content?, embeds? }` or null (event off, or missing data): it replaces `eventEmbed`. `renderTopic(config, status, context)`. Pure. |
| `crashWatch.ts` | The crash detector (section 6). Pure over injected timers and a clock. |

Changes: `notifierOf` sends `{ content, embeds, files, allowedMentions }`; `createInbound` takes the config, renders, and builds the `/me` webhook name; `protocol.ts` accepts the optional `icon` of the hello; `BridgeLink` and `BridgeServer` gain a connection listener and `serverIcon`; `sync.ts` renders the topic from the config and exports a topic refresh that the lifecycle events call; `index.ts` loads the config once at startup and wires everything; `env.ts` loses `MC_TOPIC_TEMPLATE` (replaced by the file) and `MC_SYNC_MINUTES` defaults to 15. `MC_TEXT` keeps only what is not a bridge notification (command answers).

The file is read at startup. Changing it needs a restart of the bot, which a deploy does anyway.

## 6. The crash detector

State: the `startedAt` of the last hello, whether a `stopping` was seen since, and a timer.

- On **disconnect** of a connection that had said hello: if `stopping` was seen, nothing. Otherwise start the timer (`crash_after_seconds`).
- On **hello** while the timer runs: if `startedAt` is the same as before, it was only a blip of the line: cancel the timer, post nothing. If it changed, the server restarted without saying it stopped: post `crashed` now.
- On **timer expiry**: post `crashed` once, set the topic offline.
- On **`stopping`**: remember it, set the topic offline. On **`started`**: forget it, refresh the topic.
- A bot restart loses this state on purpose: a server that kept running through a deploy of the bot is not a crash.

Known limits: a hung server that is still connected is not seen; a `stopping` that the mod could not send (it was not connected) can make a clean stop look like a crash. The mod waits up to one second for its last frame before closing (see section 9), which covers the normal case.

## 7. Phases

Branch from `master` (the avatar sync branch is separate). Each phase is one or more commits (conventional subject, no attribution), each passing `npx tsc --noEmit` and `npm test`.

**C0. Approval.** The owner approves declaring `yaml`. Add it to `package.json`.

**C1. Config.** `template.ts`, `messageConfig.ts`, `config/minecraft-messages.yml` with the defaults. Tests: placeholders and escaping, emoji, limits, valid file, partial file, each kind of bad value, YAML syntax error, unknown key, unknown placeholder, `{servericon}` outside icon fields, and that the committed file loads with no warning and equals `DEFAULT_MESSAGES`.

**C1b. Hello icon.** `protocol.ts` reads the optional `icon` of the hello (base64, at most 10,000 bytes, PNG signature; a bad one is dropped, the hello stays valid); `BridgeLink#serverIcon`. Tests in `bridgeProtocol.test.ts` and `bridgeServer.test.ts`.

**C2. Events and `/me`.** `render.ts#renderEvent`, `notifierOf`, `createInbound`, remove `eventEmbed`. Tests: every event kind as embed and as text, event off, no player, the owner mention only in `crashed`, nothing else able to mention, the length cuts, `{servericon}` attaches the file only when used and an icon exists, `/me` name and italics, normal chat unchanged. Update `bridgeInbound.test.ts`.

**C3. Crash detector.** The connection listener in `BridgeLink` and `BridgeServer` (a replaced connection and a connection without hello do not fire it), `crashWatch.ts`, wiring. Tests with fake timers: clean stop, loss then return (blip), loss then silence, return with another `startedAt`, one post per crash, a bot restart. Update `bridgeServer.test.ts`.

**C4. Topic.** `renderTopic` from the config, the immediate refresh on `started`, `stopping` and crash, `MC_SYNC_MINUTES` default 15, remove `MC_TOPIC_TEMPLATE`. Tests: online and offline text, every placeholder, `totalplayers` missing, dry run, no edit when the text did not change. Update `bridgeSync.test.ts`.

**C5. Docs and deploy.** `README.md` (the file, the placeholders, the removed variable, the restart), the master plan (protocol 4.2: `status` gains `totalPlayers`), then a live check in the test guild with the mod: every event kind, a clean stop, a killed server, a blip (cut the network for 20 s).

## 8. Risks

| Risk | Mitigation |
|---|---|
| A typo in the file | Per-key fallback and a log line; the file is tested in CI against the defaults. |
| A false "crashed" after a clean stop | The mod flushes `stopping`; the grace time; see section 6. |
| Topic edits hit Discord's limit (about 2 every 10 minutes) when the server restarts often | discord.js queues the edit; the text is only sent when it changed. |
| `{guildowner}` pings the owner at every false alarm | Only in `crashed`; the grace time and the `startedAt` check keep blips quiet. |
| The emoji does not exist in the guild | It stays as written; no error. |
| Removing `MC_TOPIC_TEMPLATE` surprises a deployment that set it | README and a startup log line when the variable is still set. |

## 9. What we need from the mod (Enriquecraft)

**Needed:**

1. **`totalPlayers` in the `status` answer.** An integer: how many different players the server knows. Use `KnownPlayers#namesOn` (online players plus the whitelist), counting distinct names without regard to case. The field is optional and additive: the bot shows `?` while the mod does not send it, and the mod can ship before or after the bot. Touches `Answers.status`, `QueryAnswers` and `DiscordModule`, with tests.
2. **`icon` in the `hello`.** The server's `server-icon.png`, base64, at most 10,000 bytes before encoding (so the frame stays under 16 KiB); omitted when the file is missing, unreadable, not a PNG or too large. Read once per start. Touches `ServerInfo`, `OutFrame.Hello` and `FrameCodec`, with tests. Optional and additive like the first.

**Already true, to keep (verified in the code today):**

3. `stopping` is sent before the line closes: `BridgeConnection.stop()` waits up to one second for the last send. Keep this, it is what separates a clean stop from a crash.
4. `started` is reported before the connection starts and so reaches the bot after the hello, from the buffer.
5. `hello.startedAt` is the moment the server started (`ServerInfo.started`), the same for every reconnect of one run. The crash detector depends on that.

**Not needed:** `%world%`, the in-game join and leave text, PlaceholderAPI support (the nickname is already in every frame), memory and MOTD placeholders.

**Later, only if hung servers matter:** a small tick heartbeat frame every few seconds, so the bot can tell a frozen server from a quiet one.
