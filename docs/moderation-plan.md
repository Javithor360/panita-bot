# Moderation commands and audit log (plan)

Status: implemented 2026-11-19 on the bot's side. The API side (the `discord.warnings` table and the `/v1/discord/warnings` endpoints) is in `panita-api/docs/moderation-plan.md`; the warning commands need it deployed, everything else works without it.

## 1. Context and reason

The bot only had `/say`, `/bot` and `/tag` for the staff. The owner wants the usual moderation commands, with the personality of Noa (the old bot, `0w0u/noa`: short and friendly Spanish, a case embed headed `[KICK] name` with the fields Usuario, Moderador and Razón, a DM to the member, a warning counter that ends in a mute and then a kick), and a log channel that works as an audit log, not only for what the bot does.

What we kept from Noa: the voice, the case embed, the DM, the warn thresholds (3 active warnings are a timeout, 5 a kick). What we changed: the mute is Discord's timeout (Noa gave a role and used a `setTimeout`, which a restart loses), and the warnings are stored in the API (Noa kept a JSON file).

## 2. Commands

`kick`, `ban`, `unban`, `mute`, `unmute`, `clear`, `hide`, `unhide`, `warn`, `unwarn` and `warns` (the last one is needed to know which warning `unwarn` takes). All are staff-only, slash and prefix, with the aliases `banear`, `silenciar`, `purge`, `prune` and `w`. The table with their options is in the README.

Every sanction does the same, in this order: read the options, find the member, `guardTarget` (not yourself, the bot or the owner; not other staff unless developer or owner; not a role equal or above yours or the bot's), the DM, `botActions.mark`, the Discord call, and `announce` (the reply and a copy in the log channel).

## 3. Warnings

`POST /v1/discord/warnings` answers with the warning and `active_count`, counted in the same transaction, so each count is handed out once. The bot decides the sanction only from that number (`autoSanction`): 3 is a 1-hour timeout, 5 is a kick. `GET /v1/discord/users/{discordId}/warnings?active=true` gives what `unwarn` and `warns` show, and `PATCH /v1/discord/warnings/{id}` revokes one (`404` if it is gone, `409` if it was revoked first). A warning belongs to a Discord id, not to a website account.

## 4. Audit log

`MODLOG_CHANNEL_ID` is optional. Without it the commands still answer and send the DM. With it the channel receives a copy of every case and, from separate listeners, the messages deleted or edited, bulk deletes, joins, leaves, and the kicks, bans, unbans and timeouts done by hand. Who did it comes from Discord's audit log, which is best effort. Nicknames and roles are not logged because the website and Minecraft syncs change them constantly. The intent `GuildModeration` was added.

What the bot did itself is remembered for 30 seconds (`features/moderation/recent`), so the event Discord sends back is not logged twice. Bots, webhooks, the log channel and `!commands` are ignored.

## 5. Emojis

The custom emojis are in one dictionary, `src/config/emojis.ts`: `EMOJIS` (text for a message, the same strings the bot already used), `emojiOf` (the object for a button) and `emojiUrl` (the image). The new ones (`check`, `cross`, `online`, `idle`, `offline`, `mobile`, `dev`, `stats`, `boost`) are in the owner's emoji server, where the bot is also a member.

## 6. Open points

- Channel and role changes, invites and voice are not in the audit log; each is one more handler in `features/auditLog/handlers.ts` if it is wanted.
- A leave is only logged for members the bot has cached (there is no `GuildMember` partial, on purpose: the account sync handlers would receive partial members).
- `hide` works on text, announcement, voice, stage and forum channels; a thread follows its parent and cannot be hidden on its own.
