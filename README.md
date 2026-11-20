# Panita Bot

The official Discord bot of the **Panitacraft** community. It keeps Discord and [Panita Web](https://www.panitacraft.com) in sync (accounts, roles and editions), and gives members a Minecraft server toolkit, a ticket system, quick-reply tags and more.

- **One command, two styles.** Every command works as a Slash Command (`/ip`) and with the classic prefix (`!ip`). Prefix commands also accept aliases (`!jugar`, `!minecraft`).
- **Spanish-first.** The bot talks to the community in Spanish. This document and the code are in English.

## Table of contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Registering slash commands](#registering-slash-commands)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [Features](#features)
  - [Commands](#commands)
  - [Ticket system](#ticket-system)
  - [Sign-in codes and sessions](#sign-in-codes-and-sessions)
  - [Quick upload to the gallery](#quick-upload-to-the-gallery)
  - [Birthday greeting](#birthday-greeting)
  - [Moderation and audit log](#moderation-and-audit-log)
  - [Info commands and the bot's voice](#info-commands-and-the-bots-voice)
  - [AI assistant (`/ask`)](#ai-assistant-ask)
  - [Minecraft bridge](#minecraft-bridge)
  - [Panita Web synchronization](#panita-web-synchronization)
  - [Reliability](#reliability)
- [Known issues and roadmap](#known-issues-and-roadmap)

---

## Requirements

- **Node.js 22** or newer.
- A **service key of the `bot` client** of the [Panita API](https://api.panitacraft.com/docs). The bot never connects to the database: every read and write goes through the API.
- A Discord application with a bot user and both **privileged gateway intents** enabled: *Server Members* and *Message Content*. The bot also uses the non-privileged *Direct Messages* intent (members confirm sign-in codes by DM), which needs no switch in the Developer Portal.

## Installation

```bash
git clone https://github.com/Javithor360/panita-bot.git
cd panita-bot
npm install
```

Next, create the `.env` file described below.

## Configuration

The bot reads its settings from a `.env` file in the project root. It validates them on startup and exits with a clear error if a required value is missing.

| Variable | Required | Purpose |
|---|:---:|---|
| `DISCORD_TOKEN` | ✅ | Bot token. |
| `PANITA_API_KEY` | ✅ | Service key of the `bot` client of the Panita API. The bot checks it on startup and exits if the API rejects it. |
| `PANITA_API_URL` | — | Base URL of the Panita API. Defaults to `https://api.panitacraft.com`; must use `https` (plain `http` only for `localhost`). |
| `STAFF_ROLE_ID` | ✅ | Staff role. Grants access to moderation and ticket commands. |
| `DEVELOPER_ID` | ✅ | Developer user ID. Grants access to developer commands. |
| `ALT_ROLE_ID` | ✅ | Role that marks secondary (alt) accounts. |
| `GUILD_ID` | Recommended | Home server. Events from other servers are ignored, and it's required for the Panita Web → Discord sync. |
| `CLIENT_ID` | — | Application ID. Resolved from the token when omitted. |
| `PORT` | — | Port of the health-check endpoint, which also takes the Minecraft bridge. Defaults to `3005`. |
| `BRIDGE_KEY` | — | Secret the Minecraft server sends to connect (at least 16 characters). Without it the Minecraft bridge is off. |
| `MC_CHANNEL_GLOBAL` | — | Discord channel joined to the server's global chat. Also where notifications go and whose topic shows the server. |
| `MC_CHANNEL_STAFF` | — | Optional channel joined to the server's staff chat. |
| `MC_JOINED_ROLE_ID` | — | Role given to a linked member when they join the Minecraft server. |
| `MC_ASSETS_DIR` | `data/minecraft-assets` | Folder with the game's fonts and latency icons, which the pictures of `/playerlist` and `/playerinfo` are drawn with. When it is empty the bot downloads them from Mojang's own servers at startup (about 10 seconds, checked against Mojang's hashes); `npm run assets:minecraft -- <client jar> <assets folder>` makes the same folder from an installed client. Mojang's files are never committed. If neither works the commands answer with text. |
| `MC_GAME_VERSION` | latest release | The game version whose fonts are downloaded, such as `1.21.5`. |
| `MC_RESOURCE_PACK_URL` | — | `https` address of the server's resource pack. The bot downloads it (renewed every few hours) to draw the custom icons of the ranks in those pictures. |
| `MC_AVATAR_PREMIUM`, `MC_AVATAR_CRACKED`, `MC_AVATAR_SKIN` | — | Head templates for players with a Microsoft account, for those with a PIN, and for any player whose skin the server reports (SkinsRestorer's, for example; it wins over the other two), with `{uuid}`, `{name}`, `{nickname}` and, in the skin one, `{skin}`. Default to `mc-heads.net`. |
| `MC_SYNC_DRY_RUN` | — | `true` by default: the topic, nickname and role changes of the bridge are only logged. Set it to `false` to apply them. |
| `MC_SYNC_MINUTES` | 15 | Minutes between runs of the topic and nickname sync. At least 10. |
| `PASSWORD_RESET_CHANNEL_ID` | — | Public channel (`#comandos`) where a password reset goes when the member's DMs are closed and they agree to it on the website. Without it that fallback is reported as failed. |
| `GALLERY_CHANNEL_ID` | — | Gallery channel (`903017941300281344`). A trusted author's photo post there gets the bot's 👍, and the author's own 👍 offers the quick upload. Without it the quick upload is off. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | With `GALLERY_CHANNEL_ID` | The website's Cloudinary account (cloud name `panita`; the API only accepts photos from `res.cloudinary.com/panita`). The bot signs its uploads with them and never logs them. |
| `BIRTHDAY_CHANNEL_ID` | — | General channel (`707103391167545422`) where the daily birthday greeting is posted. Without it there is no greeting. |
| `BIRTHDAY_UTC_OFFSET_HOURS` | — | Offset from UTC of the day the greeting follows, from -12 to 14. Defaults to `-6` (no daylight saving). |
| `BIRTHDAY_HOUR` | — | Hour (0-23, in that offset) from which the greeting is sent. Defaults to `10`, so 16:00 UTC. |
| `MODLOG_CHANNEL_ID` | — | Staff channel where every moderation case and the audit log (deleted and edited messages, joins, leaves, kicks, bans, timeouts) are posted. Without it the commands still answer and send the DM, but nothing is logged. See [Moderation and audit log](#moderation-and-audit-log). |
| `OPENAI_API_KEY` | — | Key of the OpenAI project of the bot (give it **Write** on *Responses* and *Moderations* only). Without it `/ask` answers that it is not available. Never logged. |
| `OPENAI_MODEL` | `gpt-6-luna` | Model `/ask` uses. It must be allowed in the OpenAI project. |
| `ASK_COOLDOWN_SECONDS`, `ASK_REPLY_COOLDOWN_SECONDS` | 20, 5 | Seconds a member waits between two new questions to `/ask`, and between two replies in a conversation (0 to 3600). |
| `ASK_DAILY_LIMIT`, `ASK_GLOBAL_DAILY_LIMIT` | 60, 1000 | Questions to `/ask` per member and in total per day (UTC). |
| `ASK_BLOCKED_TERMS` | — | Comma-separated words that `/ask` must never say or answer (for things that were not announced). A question containing one gets a fixed reply without calling OpenAI, and the knowledge files in `config/` are refused if they contain one. Kept here so they are not written in the repository. |

<details>
<summary>Example <code>.env</code></summary>

```env
DISCORD_TOKEN=your-bot-token
PANITA_API_KEY=pk_your-bot-service-key
STAFF_ROLE_ID=000000000000000000
DEVELOPER_ID=000000000000000000
ALT_ROLE_ID=000000000000000000
GUILD_ID=000000000000000000
```

</details>

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the bot from source and restarts it on every file change. |
| `npm run build` | Cleans `dist/` and compiles the TypeScript sources into it. |
| `npm start` | Starts the compiled bot (`dist/index.js`). |
| `npm run deploy` | Registers the slash commands **globally**. |
| `npm run deploy -- --guild` | Registers the slash commands in `GUILD_ID` only. |
| `npm run deploy:prod` | Same as `deploy`, using the compiled build. |
| `npm test` | Runs the unit tests. |
| `npm run smoke:api` | Read-only check of the Panita API from this environment (key, URL and response shapes). Run it after every deploy. |

## Registering slash commands

Register the commands again every time you add a command or change its options. Use `npm run deploy`, or run `/deploy` in Discord (developer only).

- **Global (default).** Commands are available in every server the bot is in, and Discord shows the **"Supports Commands"** badge on the bot's profile. That badge only appears for applications with global commands.
- **Guild (`--guild`, or `/deploy guild:true`).** Commands are registered in `GUILD_ID` only and update instantly. Use it while testing changes.

Each mode clears the other scope, so commands never show up twice. Commands are server-only in both modes: they don't appear in DMs, which is why the DM sign-in confirmation is a plain message (see [Sign-in codes and sessions](#sign-in-codes-and-sessions)). **Aliases are never registered as slash commands**; they only exist with the prefix.

## Deployment

The bot is hosted on **FadeHost**. A release consists of:

```bash
npm install
npm run build
npm run deploy:prod   # only when commands changed
npm start
```

`src/server.ts` exposes a small health-check endpoint (`GET /` → `Bot is alive!`) on `PORT`, handy for uptime monitors.

> [!WARNING]
> Never run two instances with the same token at the same time (for example locally and on the host). Both would answer every command.

## Project structure

```
src/
  index.ts       bootstrap: client, command registry, handlers, events, login
  config/        validated environment variables and shared constants
  core/          command framework (single definition for slash + prefix, parser, custom IDs, registry)
  handlers/      routing for interactions and prefix messages
  events/        Discord gateway events
  services/      business logic and every call to the Panita API
  lib/           shared helpers (`lib/api` is the API client)
  data/          static content (Tezzlar days, minievents, recipes…)
  features/      large features split into modules (tickets, minecraft, login, passwordReset, quickUpload, birthdays, moderation, auditLog, info, lookup)
  commands/      one file per command, grouped by category
test/            unit tests
```

The full conventions (how to add a command, where each piece of logic belongs, how the prefix parser reads arguments, the Tezzlar data format) live in [`.agents/AGENTS.md`](.agents/AGENTS.md).

### Versioning

The bot follows [semantic versioning](https://semver.org) and started at **2.0.0**. The only source of truth is `version` in `package.json`; the bot reads it at startup (`src/config/version.ts`) and shows it in the startup log and in `/uptime`.

Every branch pushed to the remote bumps the version first, in its own commit (`chore: bump the version to X.Y.Z`):

| Bump | When |
|---|---|
| Patch (`x.y.Z`) | Fixes and small tweaks. |
| Minor (`x.Y.0`) | New features or a noticeable set of changes. |
| Major (`X.0.0`) | Breaking changes, such as a new Minecraft bridge protocol or an API contract change. |

---

## Features

### Commands

Syntax: `<required>`, `[optional]`, `[--flag]`. Aliases work with the prefix only. `/help` lists only the commands the member can use, and `/help <command>` shows a command's usage in both styles.

<details open>
<summary><strong>General</strong></summary>

| Command | Description | Aliases |
|---|---|---|
| `ask <prompt>` | Asks the assistant about Panitacraft, or just chats with it. Also by mentioning the bot: `@Panita Bot <prompt>`. See [AI assistant](#ai-assistant-ask). | `pregunta`, `preguntar` |
| `confirm <code>` | Confirms a sign-in on the website or the launcher with the code the app shows: 4 digits on the website, `XXXX-YYYY-ZZZZ` in the launcher. The reply is private. Slash only. | — |
| `donate [--simple]` | How to support the server through PayPal. `--simple` sends just the link. | `donar`, `donacion`, `donaciones`, `fund` |
| `invite` | Invite link to the Discord server. | `invitacion`, `discord` |
| `register [--with_password]` | Activates the member's account: they say whether they play with a premium Minecraft account, then give their IGN in a private form. No password is needed; `with_password` adds or changes an optional one. A member who already has an account is only asked for what is missing (the status), and one who left and came back confirms the IGN they already had. Only the member who ran it can use the buttons. Alt accounts are rejected. | `registrar`, `activar` |
| `sessions` | Lists the member's open sessions (web and launcher) and closes one or all of them. The reply is private. Slash only. | — |
| `web` | Link to Panita Web. | `pagina`, `panel` |

</details>

<details open>
<summary><strong>Utility</strong></summary>

| Command | Description | Aliases |
|---|---|---|
| `help [command]` | Lists the available commands, or details one of them. | `ayuda` |
| `ping` | Bot and gateway latency. | `latencia` |
| `uptime` | How long the bot has been online, and its version. | `tiempo`, `online` |
| `info` | About the bot: its version, statistics, what it is made with and its links. | `botinfo`, `about` |
| `server [--roles\|--emojis\|--channels\|--boost\|--icon\|--banner]` | Information about the server. Each flag shows something else, one at a time: the roles, the emojis, the channels **you** can see, the boosts, the icon or the banner. | `serverinfo`, `sinfo`, `guild` |
| `user [user] [--badges]` | A person's account, when they joined, roles, key permissions and (with the Presence intent) status. `--badges` shows their Discord badges. Works with a mention, an ID (even of someone who left) or a name. | `userinfo`, `whois`, `u` |
| `avatar [user] [--global]` | A person's picture big, with download links and a Google search. Shows their server avatar when they have one; `--global` shows the account's. Same ways to name a person. | `av`, `pfp`, `picture` |
| `emoji <emoji> [--info]` | Shows an emoji big (a custom one from any server, a unicode one, an ID, or the name of one of this server). `--info` adds its name, ID, date and server. | `emote`, `e` |
| `emoji add <name> [emoji\|link]` | **Staff only.** Adds an emoji to the server from an attached image, by copying another emoji, or from a Discord image link. Big static images are shrunk to fit; big animated ones are refused. | `emoji agregar` |
| `emoji remove <emoji>` / `emoji rename <emoji> <name>` | **Staff only.** Deletes an emoji (after a confirmation button) / renames it. | `emoji eliminar`, `emoji renombrar` |

</details>

<details>
<summary><strong>Fun</strong></summary>

| Command | Description | Aliases |
|---|---|---|
| `announcements` | A "friendly" reminder, in Chilean slang, to read the announcements. | `anuncios` |
| `enchant <text>` | Translates text into the enchanting table alphabet (Standard Galactic Alphabet). | `encantar` |
| `disenchant <text>` | Translates Standard Galactic Alphabet back into plain text. | `desencantar` |
| `gallery` | A random photo from the Panita Web gallery, with author, date, categories and edition. 🎲 shows another photo and 🔗 returns its link; only the member who ran it can use them. | `galeria`, `foto` |
| `panita3` | "Reveals" the release date of Panitacraft 3. | — |

</details>

<details>
<summary><strong>Minecraft</strong></summary>

| Command | Description | Aliases |
|---|---|---|
| `commands` | Useful commands inside the Minecraft server. | `comandos`, `cmds` |
| `enchantments` | Maximum enchantment and potion levels in Tezzlar III. | `enchantment`, `encantamientos`, `enchants` |
| `food` | Rebalanced food values and special dishes in Tezzlar III. | `comida`, `foods`, `comidas` |
| `ip [--numeric]` | Server address (domain or numeric IP). | `jugar`, `minecraft` |
| `minievent <id\|list>` | Details of a Tezzlar minievent, or the full list. | `minieventos`, `minievents`, `me` |
| `playerlist` | Who is online on the Minecraft server, in an embed with a picture drawn like the game's tab list: head, rank, name and latency of each player. Asks the server live. Category *Servidor de Minecraft*. In a channel joined to the server it also answers to the bare word `playerlist` (no prefix), which is not passed on to the game chat. | `jugadores`, `conectados` |
| `playerinfo <jugador>` | A player's card: their head, rank and name as the game shows them, whether they are online and their time played. Asks the server live. Category *Servidor de Minecraft*. | `jugador`, `infojugador` |
| `recipes <id\|list>` | Custom crafting recipes with guide images, or the full list. | `recetas`, `crafteos`, `crafts` |
| `resources` | Download link for the mods and textures, plus installation steps. | `recursos`, `assets` |
| `skin <player>` | A player's skin with a menu to switch views (3D, bust, head…). Only the member who ran it can switch views. | `skins` |
| `tezzlar day <number> [--force]` | Information for a Tezzlar III day. Each day unlocks on its date; `--force` bypasses that for the developer. `!tz <number>` also works. | `tez`, `tz` |
| `tps` | Ticks per second of the Minecraft server and the average time of a tick. Asks the server live. | `rendimiento` |
| `trailer` | Link to the Tezzlar 3 trailer. | — |

</details>

<details>
<summary><strong>Moderation</strong> (staff)</summary>

| Command | Description | Aliases |
|---|---|---|
| `bot status <online\|idle\|dnd\|invisible>` | Changes the bot's status. | — |
| `bot activity <text>` | Changes the bot's custom activity. `clear` removes it. | — |
| `say <message> [channel]` | Sends a message as the bot, optionally in another channel. With the prefix, the invoking message is deleted. | — |
| `kick <user> <reason>` | Kicks a member and tells them by DM first. | — |
| `ban <user> <reason> [days]` | Bans a user, by mention or ID (so someone who already left too), and deletes 0 to 7 days of their messages. With the prefix, a number right before the reason is the days. | `banear` |
| `unban <user> [reason]` | Lifts a ban, by mention or ID. | — |
| `mute <user> [time] [reason]` | Times a member out (Discord's own timeout, no role) for `30m`, `2h`, `1d`, `1h30m`… up to 28 days; 1 hour when no time is given. With the prefix, if the first word is not a time, everything is the reason. | `silenciar` |
| `unmute <user> [reason]` | Lifts a timeout. | — |
| `clear <amount> [user]` | Deletes 2 to 100 messages of the channel, or only those of one person. Discord does not bulk-delete messages older than 14 days. With the prefix, the command message goes too. | `purge`, `prune` |
| `hide <user> [channel] [reason]` | Hides a channel from a member (a permission overwrite, they stay in the server). | — |
| `unhide <user> [channel] [reason]` | Shows the channel to them again. | — |
| `warn <user> <reason>` | Records a warning in the API and tells the member by DM. The 3rd active warning times them out for 1 hour and the 5th kicks them. | `w` |
| `unwarn <user> [number] [reason]` | Revokes the newest active warning, or the one with that number in `warns` (it stays in the history). With the prefix, a number right before the reason is the warning number. | — |
| `warns <user>` | Shows a member's warnings: the active ones numbered, the revoked ones struck through. Only you see it. | — |
| `tag add <name> [text] [attachment]` | Creates or replaces a tag. Attachments are optional. | `t` |
| `tag delete <name>` / `tag list` | Deletes a tag / lists every tag. | `t` |
| `!tag <name>` | **Prefix only.** Posts a tag. Stored Discord images are refreshed first, so they never expire. | `!t <name>` |

</details>

<details>
<summary><strong>Tickets</strong> (staff)</summary>

| Command | Description |
|---|---|
| `ticket panel create [channel]` | Creates a ticket panel through a form. **Slash only.** |
| `ticket panel resend <panel_id> <channel>` | Moves a panel to another channel. |
| `ticket panel delete <panel_id>` | Deletes a panel and its message. |
| `ticket panel list` / `ticket panel info <panel_id>` | Lists the panels / shows a panel's configuration. |
| `ticket config staff_role <panel_id> <role>` | Sets the panel's staff role. |
| `ticket config category <panel_id> <category>` | Sets the category where tickets are created. |
| `ticket config counter <panel_id> <number>` | Sets the ticket counter. |
| `ticket config show_id_in_name <panel_id> <yes\|no>` | Includes the panel ID in ticket channel names, or not. |
| `add <user>` / `remove <user>` | Adds or removes a user from the current ticket. |
| `close` | Closes the current ticket after a confirmation. |

</details>

<details>
<summary><strong>Developer</strong></summary>

| Command | Description | Aliases |
|---|---|---|
| `bridge` | State of the connection with the Minecraft server: version, joined channels, traffic and last error. | — |
| `systemsync` | Full sync with the server: creates missing accounts and updates profiles, roles and editions. **It never deletes data.** Slash only. | — |
| `syncnow` | Polls the API right now for web role changes and pending password resets, instead of waiting for the 60 s poll (it also renews the bot heartbeat). Slash only. | — |
| `avatarsync [usuario]` | Forces the Discord avatar (the server one when the member has it) into the database for every member with an account, or only for one. It never creates accounts or touches other data. Slash only. | — |
| `cleanalts` | Deletes the accounts of alt members from the database. Slash only. | — |
| `deploy [--guild]` | Registers the slash commands (globally, or in this server only with `--guild`). | `deploycommands` |

</details>

### Ticket system

- **Panels** have a *Create Ticket* button. Each member can have one open ticket per server.
- **Every ticket is a private channel** for the creator, the panel's staff role and the bot. Channels are numbered from the panel counter (`ticket-0001`, or `ticket-<panel>-0001`).
- **Closing:** the creator or the staff can close a ticket. Only the member who asked to close can confirm it. A closed ticket is renamed to `closed-…` and every member loses access.
- **Staff controls** on closed tickets: 📄 HTML transcript, 🔓 reopen and ⛔ delete. Only the panel's staff and administrators can use them.
- **Backwards compatible:** panels and buttons posted before the current version keep working.

### Sign-in codes and sessions

Members sign in to the website and the launcher without a password. The website shows a 4-digit code and the launcher a 12-character serial (`XXXX-YYYY-ZZZZ`); the member proves who they are from Discord:

1. The member sends the code to the bot: `/confirm <code>` in the server (the reply is private), or a message that is only the code in a **DM** with the bot. A serial is recognized in any case, with dashes, spaces or neither, and sent to the API as typed; the API does the matching.
2. The bot confirms the sign-in with the API and tells the member who is signing in, where (the app and, for the launcher, the device name and system) and when. The device text is typed by the client, so it is always shown inside a code span and no reply of the bot can mention anyone. The app, which was waiting, receives its session.
3. `/sessions` lists the open sessions (named by device and system) and closes any of them.

A code only confirms a sign-in created for the member who sends it, expires after 3 minutes and works once. Any other DM gets one short help reply per user per minute. Nothing about codes or sessions is stored by the bot; it all goes through the API.

### Password reset from the website

A signed-in member who forgot their password asks for a reset in the website's settings, and the reset is confirmed from Discord:

1. The API keeps the request (valid for 10 minutes, one every 10 minutes per member). The bot polls `GET /v1/discord/password-resets/pending` every 5 seconds and sends each request. That poll is also how the API knows the bot is alive: the website disables the option when the bot stops polling.
2. The bot sends a **DM** with the buttons **Restablecer** and **Ignorar**, and reports `delivered`, or `dms_closed` when the member does not accept DMs.
3. If the DMs are closed the website asks the member whether to use the public channel (`PASSWORD_RESET_CHANNEL_ID`). Only then does the bot post a minimal message there that pings that member and whose buttons only they can use. Discord cannot start an ephemeral message, so everything after the click (the form, the confirmation, the errors) is private, and the public message is edited to a neutral line without buttons. A channel that is missing or refuses is reported as `failed`.
4. **Restablecer** opens a form with one field (Discord does not mask text inputs, so a repeat field would add nothing). The password goes form → bot → API; the bot never logs it and never retries that call. A password the API refuses (length, special character) leaves the request open to try again. **Ignorar** cancels the request.
5. After a reset the member's other sessions are closed and they are told to review `/sessions`.

The buttons and the form are components of `/register` (the router needs a command as namespace); the logic is in `src/features/passwordReset/` and `src/services/passwordResetSync.ts`. A request listed twice by the API is delivered once, and a report that failed is retried without sending the DM again.

### Quick upload to the gallery

A **trusted author** (an enabled member with that flag on the website; admins and mods need it too) can send a photo to the gallery from Discord, in the gallery channel (`GALLERY_CHANNEL_ID`):

1. A post from a member with an image attachment gets the bot's 👍 when its author is a trusted author (`GET /v1/discord/users/{id}`). Other posts get nothing, and a failed lookup is only logged.
2. Anyone's 👍 is just a Discord reaction: **nothing is stored and it is not a gallery like** (those exist only on the website). When the **author** adds their own 👍, the bot asks `GET /v1/discord/users/{id}/upload-options` (4 s limit). If that fails it uses the last options it remembers (1 hour) and otherwise says so briefly. Nothing happens for an author who cannot upload, for a message with a ✅ from the bot, or while an offer for that message is up.
3. The bot replies, mentioning only the author, with **Subir a la galería**, a button only the author can press. The reply goes away after about 2 minutes or when the upload ends. The offers live in memory, so after a restart their buttons say they are gone.
4. The button opens a form straight away (Discord gives 3 seconds): title (up to 200), description (optional, up to 2000), edition (one, the newest preselected, at most 25) and categories (one or more). The bot hides `others`, `lost_media`, `logos` and `textures` on top of what the API leaves out (never `members_choice`; `epic_build` only for admins and mods).
5. On submit the bot checks the image (PNG, JPEG, WebP or GIF, **8 MB at most**, checked on the real bytes), uploads it to Cloudinary into `panita-web/gallery/{edition_id}/{discord_name}` (the website's folder, which its folder import reads, with no preset or transformation) and saves it with `POST /v1/discord/photos`. On success it adds ✅, removes the offer and sends the author the link, privately.
6. **A refusal from the API (4xx) removes the file from Cloudinary; a timeout, a lost connection or a 5xx keeps it**, because the photo may have been saved. In that case the offer ends and the author is told to check the gallery before trying again. A Cloudinary or download failure leaves the offer up for another try. A double click or a double submit uploads once.

The logic is in `src/features/quickUpload/` (`flow` has the rules, `view` the texts and the form, `offers` the held offers), the Cloudinary calls in `src/lib/cloudinary.ts` (signed `fetch`, no SDK) and the API calls in `src/services/gallery.ts`. The button and the form are components of `/gallery`. The bot needs the **Add Reactions** permission in the channel and the `GuildMessageReactions` intent; a pinned note in the channel should say that the author's own 👍 starts the upload and that Discord reactions are not gallery likes.

### Birthday greeting

Members set their birthday in the website's settings (there is no Discord command for it). On the day, the bot posts one greeting in the general channel (`BIRTHDAY_CHANNEL_ID`) that mentions everyone who has a birthday, so the rest can congratulate them.

- **Schedule.** The bot owns it: a tick every minute, and the greeting is due from 10:00 in UTC-6 (16:00 UTC; `BIRTHDAY_HOUR` and `BIRTHDAY_UTC_OFFSET_HOURS`). It is "from", not "at": a bot that was down at 10:00 greets when it comes back the same day.
- **The API only answers "who has a birthday on this date".** The bot sends the local day (`GET /v1/discord/users/birthdays?date=YYYY-MM-DD`) and gets `discord_id`, `ign` and `discord_name` per enabled member. The API decides the February 29 rule (it lists them on Feb 28 in years without a Feb 29) and never returns a year or an age, so the greeting never mentions one.
- **One greeting per day.** The day is closed only after the message was posted, or when the list is empty. If the API or Discord fails the day stays open and the next tick retries; the failure is logged once, not every minute. The bot keeps no state: after a restart it reads the channel's last 100 messages and does not greet again if its own greeting of that day is there (it also does not post when it cannot read the channel, since that could be a duplicate).
- **Mentions.** The message pings only the listed members (`allowedMentions`).
- The bot needs **View Channel**, **Send Messages**, **Read Message History** and **Mention Users** in the channel.

The logic is in `src/features/birthdays/` (`time` has the local day and the due rule, `greeting` the text) and `src/services/birthdayScheduler.ts`; the API call is in `src/services/birthdays.ts`.

### Moderation and audit log

The staff commands (`kick`, `ban`, `unban`, `mute`, `unmute`, `clear`, `hide`, `unhide`, `warn`, `unwarn`, `warns`) keep the spirit of the old Noa bot: short Spanish replies, a case embed headed `[KICK] name` with the member's picture and the fields Usuario, Moderador and Razón, and a DM to the member. Their emojis (`check`, `cross`, `online`, `idle`, `offline`, `stats`) come from the dictionary in `src/config/emojis.ts`, the only place an emoji id is written.

- **Who can be sanctioned.** Never yourself, the bot or the owner; never another staff member (only the developer and the owner can); and never someone whose highest role is equal or above yours, or above the bot's. A refusal says which of those it was.
- **Mute is Discord's timeout**, not a role: nothing to configure, it survives restarts and expires by itself. It needs the *Moderate Members* permission and cannot be applied to administrators.
- **Warnings live in the API** (`/v1/discord/warnings`, keyed by Discord id, so they survive a member leaving or never having an account). `unwarn` revokes, it never deletes: the history keeps who gave and who revoked each warning. The API hands out each active count once, so the sanction that goes with it is applied once: the **3rd** active warning times the member out for 1 hour and the **5th** kicks them (`MODERATION` in `src/config/constants.ts`). If the bot cannot apply it (the member is above it), the reply says so.
- **The DM goes first** on kick, ban, mute and warn, because once the member is gone it cannot be delivered. Closed DMs are not an error. Lifting a sanction, `hide` and `clear` send nothing.
- **Nobody is ever mentioned**: every message and log entry uses empty `allowedMentions`, and user text is escaped.

**Audit log.** With `MODLOG_CHANNEL_ID` set, the channel receives a copy of every case (with the channel where the command ran) and also what happens without the bot's help:

| Event | What is logged |
|---|---|
| Message deleted | Author, channel, text and attachment names. A message from before the bot started has no text, and the entry says so. |
| Message edited | Before and after, with a link to the message. |
| Bulk delete | Channel and count (a `clear` writes its own entry). |
| Member joins | The account and how old it is. |
| Member leaves | Their roles and when they joined. A kick done by hand shows as a **kick** with who did it. |
| Ban, unban | Who did it and why, from Discord's audit log. |
| Timeout set or lifted | Until when, and who did it. |

- **Not duplicated.** What the bot does itself (a `ban`, a `mute`, a `clear`...) is remembered for 30 seconds (`src/features/moderation/recent.ts`), so the same ban is not logged again when Discord reports it. Bots, webhooks (the Minecraft bridge), the log channel itself and `!commands` are never logged.
- **Best effort.** Who did a kick, ban or timeout comes from Discord's audit log, which can lag by a second or two; the bot waits a moment, and if it cannot read it the entry says "No se pudo saber". Nickname and role changes are not logged on purpose: the website and Minecraft syncs change them constantly.
- **Needs** the *Kick Members*, *Ban Members*, *Moderate Members*, *Manage Messages*, *Manage Channels* (for `hide`) and *View Audit Log* permissions, the *Server Moderation* intent (already requested in code) and *Send Messages* and *Embed Links* in the log channel. A leave is only logged for members the bot has cached.
- **Prefix quirks.** The prefix parser fills text in order, so a bare number before the reason is read as the `ban` days or the `unwarn` number, and `mute` takes the first word as the time only when it looks like one (`30m`, `2h`, `1d`).
- Remember to run `npm run deploy` after updating so Discord learns the new slash commands. The warning commands need the matching version of panita-api (the `warnings` endpoints and the `discord.warnings` table).

The logic is in `src/features/moderation/` (`messages` has the voice and the embeds, `checks` the hierarchy rules, `duration`, `autoSanction`, `recent`, `modlog`, `actions` the shared Discord calls) and `src/features/auditLog/` (`embeds`, `handlers`), wired by `src/events/auditLog.ts`; the API calls are in `src/services/moderation.ts`.

### Info commands and the bot's voice

`server`, `user`, `avatar`, `info` and `emoji` are the old Noa commands brought back and updated for what Discord has added since: badges, server avatars, banners, boosts, timeouts and expressions. They keep Noa's layouts (the `⚡ ~ name` header and `Label: **value**` columns of `server`, the bold headings with `•` bullets of `user`, the "Búscalo en Google" avatar embed, the big picture of `emoji`) and its random pastel colors.

- **The bot's voice.** Every answer opens like Noa's: the check or the cross emoji, a `~`, the name of whoever asked in bold and a comma, then the text in lowercase: `✅ ~ **Javi**, latencias de Panita`, `❌ ~ **Aaron**, no tienes los suficientes permisos`. A bad command adds a quoted `Uso:` line. It all goes through `src/lib/voice.ts`, so the old commands and errors speak the same way. The emojis come from the dictionary in `src/config/emojis.ts`.
- **Naming a person.** `user` and `avatar` take a mention, an **ID** (even of someone who is not in the server or who was banned: then only what the account has is shown, with no roles, nickname or join date), or a **name**. A name is searched like Noa did, ignoring case and accents: one match is used, and if several people match a menu asks which one you mean. In prefix, `!user Javi`, `!user 481512865795145730`, `!user @Javi --badges`. In slash, `usuario` is the picker and `buscar` takes a name, an ID or a mention.
- **Lists.** `server --roles`, `--emojis` and `--channels` are paged with ◀ ▶ buttons that only whoever asked can press. `--channels` shows only the channels **the person asking can see**, and only counts the rest, so staff and ticket channels are never named.
- **Status needs the Presence intent.** The colour of the `user` embed (green online, yellow idle, red do not disturb), its "Estado" and "Actividad" and the circles of `server` come from Discord's privileged Presence intent, which the bot always asks for. *Presence Intent* must be switched on for the bot in the Developer Portal, otherwise Discord refuses the login. Members who are offline have no presence, so they show as disconnected and the embed takes its color from the highest role.
- **`emoji add` is careful.** The image can come only from an attachment, another emoji or a link of `cdn.discordapp.com` / `media.discordapp.net` (https, 15 s timeout, 8 MB cap, redirects must stay on Discord, and the file type is checked by its first bytes). Discord needs at most 256 KB: a bigger static image is shrunk to fit in 128 px, a bigger animated one is refused. Free slots by boost tier are checked first, and every add, rename and delete is also posted to the mod log. It needs the *Manage Expressions* permission, and only the staff can use it.
- `server` took the `!server` alias that `ip` used to have; `!ip` answers to `!jugar` and `!minecraft` now.

The logic is in `src/features/info/` (the views, `emojiParse`, `emojiMedia`, `serverData`), `src/features/lookup/` (the name search and its menu) and `src/lib/voice.ts`; the commands are in `src/commands/utility/`.

### AI assistant (`/ask`)

`/ask <prompt>`, `!ask <prompt>` and `@Panita Bot <prompt>` send a question to OpenAI. After a mention the word `ask` is optional (`@Panita Bot hola` works), the mention has to come first in the message, and a mention with nothing after it does nothing; a mention only ever runs `/ask`, never another command. The assistant answers questions about Panitacraft from a knowledge file, and chats like a friendly member about anything else. It answers in the language of the question (Spanish when unsure) and keeps it short.

- **What it knows.** Only `config/panitacraft-knowledge.md` (the community, the rules, the ranks, the current state, the staff, the links) and `config/panitacraft-data.md` (how accounts, editions and their history, the gallery, emblems, notifications, forms, the community page and tickets work, with a calendar, a glossary and an FAQ; its source is `panita-api/docs/panitacraft-bot-knowledge.es.md`, so edit it there and copy it here) plus the detail of Tezzlar III, which is built at startup from the same data as `/tezzlar`, `/food`, `/recipes`, `/enchantments` and the other Tezzlar commands (`features/ask/tezzlarKnowledge.ts`), so it never needs copying. All of it is sent with every question (about 17K tokens; OpenAI caches the repeated part, so it costs a fraction of a cent). Anything not in it, the bot says it does not know. **Write only what is already public**: the model cannot repeat what it was never told. Restart the bot after editing the file.
- **Chat.** It talks like a friend in a group chat, not like customer service: it greets, asks about your day, jokes, teases kindly, laughs along, and may playfully refuse. It answers harmless everyday questions and steers away from heated topics (politics, religion, fights). Emojis are rare and never a habit at the end of each sentence.
- **Conversations.** A reply to an answer of the assistant, from anyone, continues the talk for ten minutes, with no mention and no command: the last four exchanges go to the model as earlier turns (about 150 tokens each, so a follow-up costs a few percent more than a first question). They are kept only in memory, by the id of the answer's message (`features/ask/conversations.ts`), so a restart forgets them. A reply that starts with `!` is still that command, and a question that named something blocked is never kept.
- **Favorites.** Asked for its favorite anything (food, game, member of the server), the assistant picks one and commits to it with a joke instead of saying it has none. For a person, the bot rolls the dice itself (`features/ask/pick.ts`): it picks at random among the other people who wrote in the channel in the last half hour, or, if nobody did, among the members who can see the channel, and tells the model who came out (never the member asking, never a bot, never a name with a blocked term). With nobody to pick from, the model falls back to someone mentioned or a staff member from the knowledge. A "least favorite" gets a real answer too, teasing and a little negative ("meh", "me cae menos") so it feels real, but never cruel: no insults or jokes about anyone's appearance, identity, health, family or real behavior, and the reason for a person is always an obvious joke.
- **Quoted chat.** To answer "what do you think about what Ana said", the bot reads the message the member replied to (always) and, when the question points at the chat ("lo que dijo", "de eso", "el mensaje de arriba"), the last messages of the channel from the previous ten minutes (`features/ask/chatContext.ts`). It needs *Read Message History* in the channel; without it the question is answered with no chat. At most 8 messages of 300 characters each go to OpenAI, cleaned (no mentions, links or emoji codes), skipping bots, commands and any message with a blocked term. They are marked as quoted text, never as instructions, and moderated together with the question, so a question about a harmful message is refused. This sends other members' messages to OpenAI, so it only happens in the channel where the question was asked, and only for these two cases.
- **Server emojis.** The model is offered the names of the custom emojis of the server (the ones the bot can use) and may write `:name:` when one fits the feeling. The bot turns each name into the real emoji from the server's own list (at most three per answer) and drops any name or emoji code that is not on it, so the model can never make up an emoji.
- **Other members.** When someone talks about another member, the assistant answers like a friend who knows them and keeps the conversation going. Mentions in the question are written as the member's display name, cleaned, so it can talk about them. It never states facts about that person that the asker did not say, never recites their data, and never insults or spreads rumors.
- **Photos.** Asked for a random gallery photo, the model ends its reply with the marker `[[photo]]`; the bot checks it exactly, removes it from the text and sends the same photo message as `/gallery` (with its 🎲 and 🔗 buttons). It is the only thing the model can ask the bot to do, and it is read-only. Random player profiles are not possible yet: the API's member listing only accepts the web client.
- **What it can't do.** The model gets no tools: it cannot run code, browse or act on anything, and it is told not to write code, follow instructions inside a question, reveal its rules, or claim access to keys or member data. Prompt rules can be bypassed, so the guarantees are the ones around it.
- **Before the model.** The question is cleaned (mentions and invisible characters removed, 500 characters at most), checked with OpenAI's free moderation (tried twice; if it still cannot run, the member is told the assistant cannot answer right now, the cause is logged, and the question is never answered unchecked), and compared with `ASK_BLOCKED_TERMS`.
- **After the model.** No one is ever pinged, links are kept only if they are of the website or in the knowledge file, previews are hidden, the text is cut to fit a message, and an answer with a blocked term is replaced.
- **Limits.** A wait between questions (shorter between replies in a conversation), a daily cap per member and a global one, and five answers at the same time (`ASK_*`). They live in memory, so a restart resets them. The real ceiling is the **spending limit of the OpenAI project**; with prepaid credits, the balance is the cap (keep auto-recharge off).
- **Where it works.** Servers only (not DMs), and not inside ticket channels. Questions are never logged or stored (`store: false`); OpenAI only gets a hashed id of the member for abuse tracking, never the Discord id.
- **Reading failures.** `401 missing_scope` in the log means the key lacks a permission (for moderation, *Moderations*). A `403` on moderation means the project's allowed models do not include `omni-moderation-latest`. `project_spend_limit_exceeded` or an empty balance shows members "the assistant is not available".

The logic is in `src/features/ask/` (`prompt` has the rules, `guard` the question and answer clean-up and the photo marker, `limits`, `knowledge`, `tezzlarKnowledge` and `mention`), the OpenAI calls in `src/services/openai.ts` (plain `fetch`, no SDK) and the flow in `src/services/ask.ts`.

### Minecraft bridge

The bot is the only Discord client of the Minecraft server. The server (the Enriquecraft mod) keeps one authenticated WebSocket to the bot on `/bridge` of its HTTP server, with `BRIDGE_KEY` as the bearer token, and the two exchange small JSON frames. The mod never talks to Discord and holds no Discord token. The protocol is in [`docs/minecraft-bridge-plan.md`](docs/minecraft-bridge-plan.md).

- **Game to Discord.** Chat lines are posted through the bot's own webhook in the joined channel (it makes it the first time and finds it again), under the player's chat nickname or name, with their head. Joins, leaves, first joins, deaths, advancements, `/broadcast`, the server starting and stopping, and the server crashing are posted as the bot, with the messages of [`config/minecraft-messages.yml`](#minecraft-messages). What a player does with `/me` is posted like chat, with `* ` before the name and the text in italics. Nobody is ever mentioned, except the owner of the server when it crashes.
- **Discord to game.** What a **linked** member writes in a joined channel goes to the server under their Minecraft name. Anyone else gets a ❌ on their message and nothing else. Commands (`!`), bots and webhooks are never bridged, and each member is heard at most five times in ten seconds.
- **Replies.** When a linked member replies to a message in a bridged channel, the game also shows whose message it answers (including the bot's), if the mod announced the `reply` feature.
- **Commands.** `/playerlist`, `/playerinfo` and `/tps` ask the server live. Their answer mentions whoever asked without notifying them. If it is not connected they say so.
- **Join role.** When a linked member joins the server they get `MC_JOINED_ROLE_ID` if they lack it. It is never removed by the bridge.
- **Crashes.** The server says it is stopping before it closes the line. A line that is lost without that is a crash if it does not come back within `crash_after_seconds` (90 by default), or if the server comes back as a new run; the bot then posts the `crashed` message once. A server that hangs but stays connected is not noticed.
- **Topic and nicknames.** Every `MC_SYNC_MINUTES` (15 by default, 10 at least), and at once when the server starts, stops or crashes, the topic of the global channel shows the server (or that it is down; it is only edited when the text changes), and each linked member's server nickname is set to their Minecraft name, even if they changed it. Members the bot cannot rename (the owner, higher roles) are skipped.
- **Careful rollout.** The join role, the nickname sync and the topic are in **dry run** until `MC_SYNC_DRY_RUN=false`: the log says what each would change and nothing changes. Set it to `false` to apply them.
- **The game never depends on the bot.** If the bot is down, chat is just not mirrored.

Never run a second copy of the production bot with its token: it would answer every command twice. Develop with a test application and guild, or turn the production bot off first.

#### Minecraft messages

What the bot posts about the server and the text of the topic are in [`config/minecraft-messages.yml`](config/minecraft-messages.yml), which is committed with the defaults and documents its own keys and placeholders. Change it, then restart the bot (a deploy does).

- Each **event** (`join`, `first_join`, `leave`, `death`, `advancement`, `broadcast`, `started`, `stopping`, `crashed`) is `false` (nothing is posted), a text (a plain message) or an embed (`color`, `author`, `title`, `description`, `thumbnail`, `image`, `footer`, `fields`, `timestamp`, `content`).
- **Placeholders** are written `{name}`: `{displayname}`, `{username}`, `{avatar}`, `{deathmessage}`, `{achievement}`, `{message}`, `{guildowner}`, `{date}`, `{botname}`, `{botavatar}` and, in the topic, `{playercount}`, `{playermax}`, `{tps}`, `{uptimemins}`, `{uptimehours}`, `{serverversion}` and `{totalplayers}`. `{servericon}` is the icon of the Minecraft server (its `server-icon.png`, which the mod sends), for the icon, thumbnail and image keys.
- **Emoji** of the Discord server are written `:name:`. Standard emoji must be written as the character (🔥), since Discord does not turn `:fire:` into one in a message from a bot.
- **A mistake never stops the bridge.** A missing file, a YAML error, or a wrong value (a bad color, an unknown placeholder, a link that is not one) falls back to the default of that key and is written to the log at startup as `[Minecraft] messages: …`.
- `MC_TOPIC_TEMPLATE` is gone; the bot says so at startup if it is still set. `config/` must be deployed with the bot.

### Panita Web synchronization

The sync runs in both directions and needs no manual steps.

<details>
<summary><strong>How it works</strong></summary>

| Trigger | Result |
|---|---|
| A member joins the server | A disabled Panita Web account is created with the default role. The member activates it with `/register`. |
| A member changes their username or avatar (global or server) | The stored profile is updated. |
| A member's Discord roles change | Their web roles and editions are updated. Only roles linked to a Discord role are synced; web-only roles are never touched. |
| Panita Web changes a user's roles or editions | The API records the change in an outbox. The bot polls it every few seconds and applies the matching Discord role, so a change reaches Discord within about 5 seconds. Polling backs off and recovers on its own if the API is down. |
| A Discord role is deleted | The web role is unlinked from Discord, not deleted. |
| A member leaves the server | Their account is deactivated and its sessions are closed. The IGN and status are kept, so they only confirm them if they come back. |
| The bot starts | Accounts of members who left while it was offline are deactivated too. It is skipped (and logged, with counts only) if the member list looks incomplete or if it would deactivate more than 10% of the active accounts, so a bad list can never lock everyone out. |
| A developer runs `/systemsync` | Every member is resynced. Missing accounts are created and nothing is deleted. |

</details>

### Reliability

- **Errors never take the bot down.** A failing command or button replies with an error message and is logged.
- **Buttons are owner-aware.** Components tied to a member (registration, gallery, skin views, ticket confirmations) reject anyone else.
- **Helpful prefix errors.** A prefix command with missing or invalid arguments replies with its correct usage, generated from the command's own definition.

---

## Known issues and roadmap

- [ ] **Keep edition history when a Discord role is removed.** Removing an edition role on Discord currently deletes the member's edition membership, including its `history_text`. It should be deactivated instead (an `enabled` flag in the shared schema, exposed by the API).
- [ ] **Move Discord CDN assets to Cloudinary.** Some icons and images (`Picel.gif`, `corazonestezzlar.png`, recipe images) point to Discord attachment links, which expire. They're centralized in `src/config/constants.ts` and `src/data/recipes.ts`, so moving them only means swapping those URLs.
