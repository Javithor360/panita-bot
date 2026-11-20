# Info commands and the bot's voice (plan)

Status: implemented 2026-11-19. Version 2.1.0.

## 1. Context and reason

The bot had no commands to look at a server, a member, an avatar, the bot itself or an emoji. The owner wanted them back from the old Noa bot (`0w0u/noa`), updated for what Discord has added in six years, and wanted the bot to answer in Noa's voice everywhere: `✅ ~ **Javi**, latencias de Noa`, `❌ ~ **Aaron**, no tienes los suficientes permisos`, with a quoted `Uso:` line for a bad command.

## 2. Voice

`src/lib/voice.ts` has `ok`, `fail` and `ask`: the emoji, a `~`, the name of whoever asked in bold, a comma and the text in lowercase (a text with no name keeps its capital). A `UserError` is plain text and the handlers add the cross and the name (`userMessageFor`). The 63 literal ❌ of the old code and the ✅ of the commands now go through it; the unicode ❌ the bridge uses as a reaction stays, and so do the views with nobody to name (embed titles, the password reset cards, the sign-in confirmation, the quick upload).

## 3. Commands

All in `src/commands/utility/`, open to everyone.

- **`server`** (`serverinfo`, `sinfo`, `guild`): Noa's layout (`⚡ ~ name`, "Creado el ... (Hace N días)", columns Miembros, Canales, Información, Extras, Parámetros). Flags, one at a time: `--roles`, `--emojis`, `--channels`, `--boost`, `--icon`, `--banner`. The lists are paged with buttons whose state is in the custom id. `--channels` names only the channels the person asking can see. It took the `!server` alias from `ip`, which keeps `jugar` and gets `minecraft`.
- **`user`** (`userinfo`, `whois`, `u`) with `--badges`: bold headings with bullets (Identificación, Cuenta, Actividad, Roles, Permisos clave). The color follows the status when the bot has presences, then the highest role, the account's accent color, or a pastel. A person outside the server only gets what the account has.
- **`avatar`** (`av`, `pfp`, `picture`) with `--global`: the title linking to the picture, the Google search line and the picture big; the server avatar when there is one.
- **`info`** (`botinfo`, `about`): statistics, technology and links in code blocks, and `Versión: v2.1.0` in the footer.
- **`emoji`** (`emote`, `e`): `ver` (the default: the picture big, `--info` for the details, unicode through Twemoji), and for the staff `add`, `remove` (with a confirmation) and `rename`. The command is open to everyone and the staff check is inside `run` and in the buttons' guard.

## 4. Naming a person

`user` and `avatar` take `usuario` (the picker, or a mention in prefix) and `buscar` (a name, an ID or a mention). An ID finds any account, in the server or not. A name is matched like Noa did (ignoring case and accents, exact over prefix over contains): one match, or one exact match among several, is used; several open a menu, and none or more than 25 is a refusal in Noa's words. The sanction commands do not use it: a fuzzy match should not ban anybody without a confirmation of its own.

## 5. Status needs the Presence intent

Online status is Discord's privileged Presence intent. Asking for it without the switch in the Developer Portal makes the login fail, so it is opt-in with `PRESENCE_INTENT=true`. With it off, the status parts are left out.

## 6. `emoji add`

The image comes from an attachment, another emoji or a link of `cdn.discordapp.com` or `media.discordapp.net` (https, redirects must stay on Discord, 15 s timeout, 8 MB cap, type by the first bytes). Discord needs at most 256 KB: a bigger static image is shrunk to 128 px with `@napi-rs/canvas`, a bigger animated one is refused. The free slots by boost tier are checked first, and each change is posted to the mod log. The intent `GuildEmojisAndStickers` keeps the emoji cache right.

## 7. Open points

- All the status emojis (`online`, `idle`, `dnd`, `streaming`, `offline`, `mobile`) are in the emoji server and `EMOJI_DEFS`.
- The sanction commands could take names with the same menu, asking for a confirmation.
- `user` is Discord-only; the linked Minecraft name and editions from the API are not shown.
