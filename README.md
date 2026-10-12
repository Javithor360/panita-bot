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
| `PORT` | — | Port of the health-check endpoint. Defaults to `3005`. |

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
  features/      large features split into modules (tickets)
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
| `recipes <id\|list>` | Custom crafting recipes with guide images, or the full list. | `recetas`, `crafteos`, `crafts` |
| `resources` | Download link for the mods and textures, plus installation steps. | `recursos`, `assets` |
| `skin <player>` | A player's skin with a menu to switch views (3D, bust, head…). Only the member who ran it can switch views. | `skins` |
| `tezzlar day <number> [--force]` | Information for a Tezzlar III day. Each day unlocks on its date; `--force` bypasses that for the developer. `!tz <number>` also works. | `tez`, `tz` |
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
