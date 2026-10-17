# Panita Bot

The official Discord bot of the **Panitacraft** community. It keeps Discord and [Panita Web](https://www.panitacraft.com) in sync (accounts, roles and editions), and gives members a Minecraft server toolkit, a ticket system, quick-reply tags and more.

- **One command, two styles.** Every command works as a Slash Command (`/ip`) and with the classic prefix (`!ip`). Prefix commands also accept aliases (`!server`, `!jugar`).
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
| `MC_AVATAR_PREMIUM`, `MC_AVATAR_CRACKED` | — | Head templates for players with a Microsoft account and for those with a PIN, with `{uuid}`, `{name}` and `{nickname}`. Default to `mc-heads.net`. |
| `MC_TOPIC_TEMPLATE` | — | The topic of the global channel, with `{online}`, `{max}`, `{tps}` and `{uptime}`. |
| `MC_SYNC_DRY_RUN` | — | `true` by default: the topic, nickname and role changes of the bridge are only logged. Set it to `false` to apply them. |
| `MC_SYNC_MINUTES` | — | Minutes between runs of the topic and nickname sync. At least 10. |
| `PASSWORD_RESET_CHANNEL_ID` | — | Public channel (`#comandos`) where a password reset goes when the member's DMs are closed and they agree to it on the website. Without it that fallback is reported as failed. |
| `GALLERY_CHANNEL_ID` | — | Gallery channel (`903017941300281344`). A trusted author's photo post there gets the bot's 👍, and the author's own 👍 offers the quick upload. Without it the quick upload is off. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | With `GALLERY_CHANNEL_ID` | The website's Cloudinary account (cloud name `panita`; the API only accepts photos from `res.cloudinary.com/panita`). The bot signs its uploads with them and never logs them. |
| `BIRTHDAY_CHANNEL_ID` | — | General channel (`707103391167545422`) where the daily birthday greeting is posted. Without it there is no greeting. |
| `BIRTHDAY_UTC_OFFSET_HOURS` | — | Offset from UTC of the day the greeting follows, from -12 to 14. Defaults to `-6` (no daylight saving). |
| `BIRTHDAY_HOUR` | — | Hour (0-23, in that offset) from which the greeting is sent. Defaults to `10`, so 16:00 UTC. |

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
  features/      large features split into modules (tickets, minecraft, login, passwordReset, quickUpload, birthdays)
  commands/      one file per command, grouped by category
test/            unit tests
```

The full conventions (how to add a command, where each piece of logic belongs, how the prefix parser reads arguments, the Tezzlar data format) live in [`.agents/AGENTS.md`](.agents/AGENTS.md).

---

## Features

### Commands

Syntax: `<required>`, `[optional]`, `[--flag]`. Aliases work with the prefix only. `/help` lists only the commands the member can use, and `/help <command>` shows a command's usage in both styles.

<details open>
<summary><strong>General</strong></summary>

| Command | Description | Aliases |
|---|---|---|
| `confirm <code>` | Confirms a sign-in on the website or the launcher with the 4-digit code the app shows. The reply is private. Slash only. | — |
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
| `uptime` | How long the bot has been online. | `tiempo`, `online` |

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
| `ip [--numeric]` | Server address (domain or numeric IP). | `server`, `jugar` |
| `minievent <id\|list>` | Details of a Tezzlar minievent, or the full list. | `minieventos`, `minievents`, `me` |
| `playerlist` | Who is online on the Minecraft server, by chat nickname with the real name beside it. Asks the server live. | `jugadores`, `conectados` |
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

Members sign in to the website and the launcher without a password. The app shows a 4-digit code and the member proves who they are from Discord:

1. The member sends the code to the bot: `/confirm <code>` in the server (the reply is private), or a message that is only the 4 digits in a **DM** with the bot.
2. The bot confirms the sign-in with the API and tells the member who is signing in, where and when. The app, which was waiting, receives its session.
3. `/sessions` lists the open sessions and closes any of them.

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

### Minecraft bridge

The bot is the only Discord client of the Minecraft server. The server (the Enriquecraft mod) keeps one authenticated WebSocket to the bot on `/bridge` of its HTTP server, with `BRIDGE_KEY` as the bearer token, and the two exchange small JSON frames. The mod never talks to Discord and holds no Discord token. The protocol is in [`docs/minecraft-bridge-plan.md`](docs/minecraft-bridge-plan.md).

- **Game to Discord.** Chat lines are posted through the bot's own webhook in the joined channel (it makes it the first time and finds it again), under the player's chat nickname or name, with their head. Joins, leaves, first joins, deaths, advancements, `/broadcast` and the server starting and stopping are posted as the bot. Nobody is ever mentioned.
- **Discord to game.** What a **linked** member writes in a joined channel goes to the server under their Minecraft name. Anyone else gets a ❌ on their message and nothing else. Commands (`!`), bots and webhooks are never bridged, and each member is heard at most five times in ten seconds.
- **Commands.** `/playerlist` and `/tps` ask the server live. If it is not connected they say so.
- **Join role.** When a linked member joins the server they get `MC_JOINED_ROLE_ID` if they lack it. It is never removed by the bridge.
- **Topic and nicknames.** Every `MC_SYNC_MINUTES` (10 at least) the topic of the global channel shows the server (or that it is down; it is only edited when the text changes), and each linked member's server nickname is set to their Minecraft name, even if they changed it. Members the bot cannot rename (the owner, higher roles) are skipped.
- **Careful rollout.** The join role, the nickname sync and the topic are in **dry run** until `MC_SYNC_DRY_RUN=false`: the log says what each would change and nothing changes. Set it to `false` to apply them.
- **The game never depends on the bot.** If the bot is down, chat is just not mirrored.

Never run a second copy of the production bot with its token: it would answer every command twice. Develop with a test application and guild, or turn the production bot off first.

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
