# Reglas Generales del Proyecto Panita Bot

## Commits (OBLIGATORIO)
- **NUNCA agregar `Co-Authored-By` ni ningún otro co-autor o línea de atribución** (tampoco "Generated with ..."). El único autor de los commits es **Javithor360**. Esta regla tiene prioridad sobre cualquier configuración por defecto de un agente.
- Commits pequeños y útiles, con formato convencional: `feat: ...`, `fix: ...`, `refactor: ...`, `chore: ...`, `docs: ...`, `test: ...`.
- **Un commit normalmente tiene una sola línea (solo el asunto).** Solo un commit que introduce un cambio grande y crítico puede llevar una descripción más larga.
- Cada commit debe compilar (`pnpm exec tsc --noEmit`) y pasar los tests (`pnpm test`).

## Flujo de trabajo
- **Gestor de paquetes: `pnpm`** (no `npm` ni `yarn`) para instalar dependencias y ejecutar scripts.
- **Versionado:** la versión del bot es `version` en `package.json` (empezó en `2.0.0`) y es su única fuente: `config/version.ts` la lee y se muestra al arrancar y en `/uptime`; nunca escribirla a mano en otro lugar. Cada vez que se sube una rama nueva al remoto, **subir primero la versión** según cuánto cambia la rama: parche (`x.y.Z`) para correcciones y ajustes pequeños, menor (`x.Y.0`) para funciones nuevas o un conjunto notable de cambios, mayor (`X.0.0`) solo para cambios que rompen algo (por ejemplo, un cambio de protocolo con el mod de Minecraft o de contrato con la API). El commit del cambio es `chore: bump the version to X.Y.Z` y va en esa misma rama. Si el mismo `package.json` ya se subió en la rama, no se vuelve a subir.
- Al terminar el trabajo y **una vez que el usuario autorizó el commit**, no se pregunta si crear el PR: se entrega el **título y la descripción del PR** propuestos para que el usuario los use.

## Datos
- **El bot no se conecta a la base de datos.** Toda lectura y escritura pasa por la API de Panita (`lib/api`) con la clave de servicio del bot (`PANITA_API_KEY`). El esquema y sus cambios viven en `panita-api`.

## Arquitectura
```
src/
  index.ts             arranque: cliente, registro de comandos, handlers, eventos, login
  server.ts            endpoint HTTP de keep-alive
  config/env.ts        variables de entorno validadas (única lectura de process.env)
  config/constants.ts  prefijo, URLs, IP, colores, assets, categorías, permisos de tickets, reglas de moderación
  config/emojis.ts     diccionario de emojis personalizados: la única vez que se escribe una ID de emoji
  config/version.ts    versión del bot, leída de package.json
  core/                framework de comandos
    command.ts         defineCommand, tipos Command/meta/prefix, helpers button/select/modal
    context.ts         CommandContext: una sola API para slash y prefijo
    prefixParser.ts    parser de argumentos de prefijo basado en el esquema del SlashCommandBuilder
    usage.ts           genera las líneas de uso (<obligatorio> [opcional] [--bandera]) desde el esquema
    customId.ts        codec de customId de componentes
    registry.ts        carga de comandos (única), alias y descripciones para /help
    access.ts          permisos everyone | staff | developer
    errors.ts          UserError, respuestas seguras y handlers de proceso
  handlers/            interactionCreate (slash + componentes) y messageCreate (prefijo)
  events/              listeners del gateway, delgados; delegan en services/
  services/            lógica de negocio y TODO el acceso a la API (users, memberSync, webSync, birthdays, birthdayScheduler, tickets, tags, gallery, roles, commandDeploy)
  lib/                 helpers: discord, minecraft, embeds, format, galactic, syncLock
  lib/api/             cliente de la API de Panita (client, errors, types, startup)
  data/                contenido estático (Tezzlar, minieventos, recetas, encantamientos, comida, comandos del server)
  features/ask/        asistente `/ask`: prompt (reglas), guard (limpieza de pregunta y respuesta y marcador de foto), limits, conversations (memoria de las últimas respuestas para seguir la charla), chatContext (mensajes recientes del canal como contexto), pick (sorteo de una persona para "tu favorito"), emojis (emojis del servidor), names (menciones como nombres), knowledge (lee `config/panitacraft-knowledge.md` y `config/panitacraft-data.md`), tezzlarKnowledge (arma el detalle de Tezzlar III desde `data/`), mention (`@bot ask`), y los datos en vivo: gate (¿la pregunta puede necesitar datos? sin acierto no hay router ni API), router (una llamada con esquema JSON estricto que devuelve hasta 3 lookups), lookups (tipos, validación de valores y coincidencia de ediciones y formularios con las listas de la API), run (los ejecuta en paralelo, máximo 3 llamadas a la API por pregunta) y data (el bloque `[DATOS]` con duraciones, conteos y meses ya calculados y los textos limpios); la llamada a OpenAI está en `services/openai.ts` (sin tools ni function calling: `route()` solo pide un JSON de forma fija), las lecturas de la API en `services/knowledge.ts` (cachés de una hora en `lib/memoCache.ts`) y el flujo en `services/ask.ts`. **Reglas de privacidad**: `status: "private"` se responde solo como "sus opciones de privacidad ocultan su perfil" (fotos incluidas); una edición que no está en `/v1/bot/editions` o da `404` recibe una sola respuesta neutra, nunca "confidencial"; lo que viene `null` (nacionalidad, orientación, cumpleaños) no se menciona; el cumpleaños es solo mes y día, nunca el año ni una edad; `hidden_count` solo se cuenta; nunca se pide ni se repite un id o nombre de Discord
  features/tickets/    sistema de tickets dividido: permissions, embeds, panel, components, context
  features/minecraft/  puente con el servidor de Minecraft: protocol, link, server (WebSocket), inbound, outbound, webhook, messageConfig (lee `config/minecraft-messages.yml`), template, render, announcer, crashWatch, roles, sync, directory, queries, embeds, discord (los únicos adaptadores de discord.js)
  features/moderation/ comandos de moderación: messages (voz y embeds), checks (jerarquía), duration, autoSanction, recent (qué hizo el bot), modlog (canal de registro), channels, actions (llamadas compartidas a Discord)
  features/auditLog/   registro de auditoría: embeds y handlers (dependencias inyectadas), y `serverHandlers`/`serverEmbeds` para voz, roles, servidor y emojis, stickers y sonidos; los listeners están en `events/auditLog.ts`
  features/welcome/    bienvenida: `roles` (los roles por defecto de un miembro nuevo, `DEFAULT_ROLE_IDS`) y `welcome` (responde al mensaje de entrada de Discord con uno de los stickers de Discord de `WELCOME_STICKERS` en `config/constants.ts`, elegido al azar, o con un texto si Discord lo rechaza); los eventos delgados están en `events/guildMemberAdd.ts` y `events/welcome.ts`
  features/info/       comandos de información (`server`, `user`, `avatar`, `info`, `emoji`): una vista pura por comando (datos planos → embed), `serverData`/`replies` (leen Discord), `pages`, `badges`, `labels`, `presence`, `palette`, `dates`, `emojiParse`, `emojiMedia`
  features/lookup/     detector de usuarios de Noa: `rank` (coincidencia por nombre), `resolve` (mención, ID o nombre → una persona, un menú o un fallo), `pick` (el menú), `command` (el flujo común)
  lib/voice.ts         la voz del bot: `ok`, `fail`, `ask`, `usageLine`, `whoOf`
  commands/<cat>/      un archivo por comando (`export default defineCommand({...})`)
  scripts/             deploy-commands.ts (registro de comandos slash)
test/                  tests unitarios (node:test) del parser y del customId
```
- **Los comandos son delgados:** leen opciones → llaman a un service → construyen el embed.
- **El cliente de la API (`lib/api`) solo se importa desde `services/`** (y desde `index.ts` para la verificación de arranque). Las rutas llevan placeholders `{nombre}` con `params`; nunca se arman a mano. Nunca registrar cuerpos de petición ni la clave.
- **Variables de entorno solo vía `config/env.ts`**; nunca `process.env` directo.
- **URLs externas y assets solo vía `config/constants.ts` y `lib/minecraft.ts`** (skins, cabezas, etc.).
- **Un comando se define una sola vez** para slash y prefijo; el parser de prefijo usa el esquema del `SlashCommandBuilder`. Nunca ramificar por "¿es prefijo?" (la única excepción razonable es algo inherente al mensaje, como borrar el mensaje que invocó el comando con `ctx.deleteTrigger()`).
- **Alias solo para prefijo:** `meta.aliases` nunca se registra como comando slash.
- Respuestas efímeras con `{ ephemeral: true }` en el payload del contexto (se traduce a `MessageFlags`; en prefijo se ignora). En interacciones crudas (componentes) usar `flags: MessageFlags.Ephemeral`.
- Errores esperados: lanzar `UserError('mensaje')`; el handler lo muestra al usuario. Cualquier otro error se registra y se responde con un mensaje genérico.

### Parser de prefijo
El texto después de `!comando` se interpreta con el mismo esquema del slash:
1. Subcomando / grupo por nombre (`prefix.subcommandAliases`, `prefix.defaultSubcommand`). Si el primer token no es un subcomando y existe `prefix.fallback`, se ejecuta el fallback (ej. `!tag <nombre>`).
2. Booleanos como `--bandera` (o `--bandera=no`); un booleano obligatorio también acepta `si/no/true/false`.
3. Usuarios, roles, canales y números toman el primer token que coincida (mención o ID). Usuarios/roles/canales obligatorios aceptan un nombre como último recurso.
4. Los textos se asignan en orden; **el último texto toma el resto del mensaje tal cual** (con saltos de línea).
5. Adjuntos: los del mensaje. Si falta algo obligatorio se responde con el uso correcto generado automáticamente.

### Componentes (botones, menús, modales)
- Formato de customId: `comando:accion[:arg...][|ownerId]`. El namespace es el nombre del comando dueño; se crea con `ctx.customId('accion', args, { owned: true })` o `encodeCustomId(...)`.
- **Si solo quien ejecutó el comando debe poder usarlo, incluir el owner.** El router valida el dueño antes de llamar al handler, y luego el `guard` opcional del handler.
- Los handlers se declaran en `components` del comando con `button()`, `select()` o `modal()`.
- `legacyCustomId` mapea IDs antiguos (`btn_ticket_*`) de paneles y controles de tickets que ya están publicados en Discord. **No eliminarlo** mientras existan paneles antiguos.

### Puente con Minecraft
- **El bot es el único cliente de Discord del puente.** El mod de Minecraft se conecta al bot por WebSocket (`/bridge` del servidor HTTP, con `BRIDGE_KEY` como bearer) y nunca habla con Discord. El protocolo (versión 1) está en `docs/minecraft-bridge-plan.md` y en `features/minecraft/protocol.ts`.
- **Todo lo que llega del mod es entrada no confiable**: se valida en `protocol.ts` (forma, tamaño, tipos) antes de que nada más lo vea; un frame inválido cierra la conexión y un tipo desconocido se ignora.
- `features/minecraft/` trabaja con interfaces pequeñas (`Hook`, `HookChannel`, `BridgeMessage`, `TopicChannel`, `NicknameMember`, `RoleMember`) y solo `discord.ts` toca objetos de discord.js, así todo se prueba sin Discord. El acceso a la API sigue en `services/` (`listEnabledMembers`).
- Los comandos del puente (`/playerlist`, `/playerinfo`, `/tps`) están en la categoría `minecraftServer` ("Servidor de Minecraft"), mencionan a quien preguntó sin avisarle (`withSilentMention`: la mención va en el texto con `allowedMentions` vacío), `/playerlist` también responde a la palabra `playerlist` sola en un canal unido al servidor (`bareCommand`, sin prefijo y sin pasarla al chat del juego), se definen una vez y salen en `/help` y en el deploy como cualquier otro; usan `queryMinecraft`, que convierte "apagado", "no conectado" y "sin respuesta" en `UserError`.
- **Nunca mencionar a nadie**: los webhooks y las notificaciones usan `allowedMentions: { parse: [] }`. Solo se escuchan los mensajes de miembros **vinculados** (cuenta habilitada con IGN, según la API); los demás reciben una reacción ❌.
- La sincronización (tema, apodos) y el rol al entrar están en **modo de prueba** (`MC_SYNC_DRY_RUN=true`) por defecto: solo se registra lo que se cambiaría hasta poner `MC_SYNC_DRY_RUN=false`. El tema solo se edita si el texto cambió (Discord permite ~2 ediciones cada 10 minutos).
- **Nunca ejecutar una segunda copia del bot de producción con su token**: respondería cada comando dos veces. Para desarrollar, usar una aplicación y un servidor de prueba, o apagar antes el bot de producción.

### Sincronización con la web
- Discord → web: `guildMemberAdd`, `userUpdate`, `guildMemberUpdate` y `roleDelete` usan `services/users` y `services/memberSync`.
- Web → Discord: `services/webSync` consulta cada pocos segundos el outbox de la API (`GET /v1/discord/sync-events`, con cursor en memoria) y aplica roles; `lib/syncLock` evita bucles.
- Solo se sincronizan roles con `discord_role_id`; los roles exclusivos de la web nunca se tocan.
- `/systemsync` **nunca elimina datos**: crea cuentas faltantes, actualiza perfiles y roles, y solo agrega ediciones.
- `/avatarsync [usuario]` solo escribe el avatar (el del servidor si lo tiene, como los eventos en vivo) de los miembros que ya tienen cuenta, vía `syncProfile` de 5 en 5 (la API no tiene ruta masiva de perfiles); nunca crea cuentas y un fallo no detiene al resto. No usa el lock global: no cambia roles.
- TODO: al quitar un rol de edición en Discord se elimina el `UserEdition` (se pierde `history_text`). A futuro debería desactivarse con un campo `enabled` en lugar de borrarse.

### Restablecer contraseña desde la web
- La web crea la solicitud en la API; el bot la entrega. **La API no puede empujar al bot**: `services/passwordResetSync` consulta `GET /v1/discord/password-resets/pending` cada 5 s (la lista es estado, no eventos) y esa consulta es además el latido con el que la API sabe que el bot está vivo; por eso el siguiente poll se agenda antes de entregar y una entrega lenta nunca lo retrasa.
- La entrega vive en `features/passwordReset/` (`view` = textos, botones y formulario; `delivery` = DM o canal; `components` = handlers). El DM va primero; el error `50007` (DMs cerrados) se reporta como `dms_closed`, y cualquier otro fallo del DM también tras 3 intentos (`failed` es final y quitaría la opción del canal; solo se usa cuando falla el canal). El canal público (`PASSWORD_RESET_CHANNEL_ID`) solo se usa cuando la API pide `delivery: "channel"`, es decir, después de que la persona aceptó en la web; su mensaje no lleva ningún secreto y solo menciona a ese miembro.
- Los botones y el formulario son componentes del comando **`register`** (el namespace debe ser un comando). Todos llevan el id de la solicitud y el `|ownerId`. El formulario tiene un solo campo; **la contraseña nunca se registra, se devuelve ni se reintenta** (`completeReset` es un POST de un solo uso). Todo lo posterior al clic en el canal es efímero y el mensaje público se edita a una línea neutra.

### Subida rápida a la galería
- **Solo para `trusted_author`** (cuenta habilitada con esa marca; un admin o mod sin ella no sube desde Discord). La API decide: el bot nunca asume permisos, solo usa `trusted_author` de `GET /v1/discord/users/{id}` para decidir si reacciona y `GET .../upload-options` para armar el formulario.
- Vive en `features/quickUpload/` (`flow` = reglas y handlers, `view` = textos y formulario, `offers` = ofertas en memoria, `rules` = constantes y filtros, `download`), con el evento delgado en `events/galleryUpload.ts`, las llamadas a la API en `services/gallery.ts` y Cloudinary en `lib/cloudinary.ts` (`fetch` firmado, sin SDK). Se apaga sin `GALLERY_CHANNEL_ID`; con él, las tres variables `CLOUDINARY_*` son obligatorias.
- Un 👍 de Discord **no es un like de la galería** y no se guarda. Solo el 👍 del **autor del mensaje** abre la oferta; si el bot ya reaccionó con ✅ o hay una oferta pendiente no hace nada. Los botones y el formulario son componentes de `/gallery` (`gallery:upload` y `gallery:uploadsubmit`, con el id del mensaje y el `|ownerId`).
- El formulario se abre sin consultar nada (3 segundos); al enviarlo se hace `deferReply` efímero **primero**. El estado `uploading` se marca antes del primer `await` para que un doble envío suba una sola vez.
- **Carpeta de Cloudinary: `panita-web/gallery/{edition_id}/{discord_name}`** (la de la web; su importación de carpetas lee exactamente esa ruta). Sin preset, sin `public_id`, sin transformaciones. `discord_name` sale de `upload-options`, nunca del mensaje. Límite de **8 MB** comprobado sobre los bytes reales; solo PNG, JPEG, WebP o GIF.
- **Limpieza:** si la API **rechaza** la foto (4xx) se borra el archivo de Cloudinary; si el resultado es **desconocido** (timeout, error de red, 5xx, `ApiError.transient`) el archivo **se conserva** y la oferta termina, porque reintentar podría guardar la foto dos veces. Un fallo de descarga o de Cloudinary deja la oferta abierta. Nunca se registran las claves de Cloudinary ni la firma.
- Necesita el permiso *Añadir reacciones* en el canal, el intent `GuildMessageReactions` y las partials `Message`, `Reaction` y `User` (los 👍 de mensajes anteriores al arranque llegan parciales).

### Saludo de cumpleaños
- La fecha de cumpleaños se define en la web; el bot **solo la consulta**. `services/birthdays` llama a `GET /v1/discord/users/birthdays?date=YYYY-MM-DD` y recibe `discord_id`, `ign` y `discord_name`: **nunca el año ni la edad**, y el saludo nunca menciona una edad. La regla del 29 de febrero (se lista el 28 en años no bisiestos) la decide la API, no el bot.
- **El bot es dueño del horario, la zona horaria y el canal**: `BIRTHDAY_CHANNEL_ID` (sin él no hay saludo), `BIRTHDAY_UTC_OFFSET_HOURS` (`-6`) y `BIRTHDAY_HOUR` (`10`). La API recibe un día, nunca una hora.
- `services/birthdayScheduler` (dependencias inyectadas, se inicia en `ClientReady`) hace un tick por minuto. El saludo toca **desde** la hora (`>=`), no **a** la hora. El día se cierra **solo después de publicar** o con la lista vacía; si falla la API o Discord se reintenta en el siguiente tick y el fallo se registra una sola vez por racha.
- **El bot no guarda estado**: tras un reinicio lee el canal hacia atrás, de 100 en 100 y hasta 3000 mensajes, hasta pasar el inicio del día, y no repite si encuentra su propio saludo de ese día (`features/birthdays/greeting`: `searchGreeting`, `isGreetingOf`). Leer solo la última página no basta: en un canal ocupado el saludo se sale de ella y un reinicio saludaría otra vez. Si no puede leer el canal, o 3000 mensajes no llegan al inicio del día, no publica (podría duplicar) y no insiste.
- El mensaje es uno por día, menciona a todos y solo a ellos (`allowedMentions`). Helpers puros en `features/birthdays/` (`time`, `greeting`), probados con reloj falso.

### Moderación y registro de auditoría
- Comandos de staff en `commands/moderation/` (`kick`, `ban`, `unban`, `mute`, `unmute`, `clear`, `hide`, `unhide`, `warn`, `unwarn`, `warns`), con la voz de Noa (el bot viejo): respuestas cortas en español, embed `[KICK] nombre` con Usuario / Moderador / Razón y un mensaje directo al miembro. Los textos, los embeds y las frases están **solo** en `features/moderation/messages.ts`; los comandos no escriben texto suelto.
- **Todo comando de sanción sigue el mismo orden**: leer opciones → `memberOf` → `guardTarget` (reglas de `features/moderation/checks.ts`: no a uno mismo, al bot, al dueño, a otro staff salvo el developer o el dueño, ni a un rol igual o superior al propio ni al del bot) → aviso por DM **antes** de actuar (`notifyMember`) → `botActions.mark(...)` → la llamada de Discord dentro de `discordAction` (convierte "no tengo permiso" en una respuesta legible) → `announce` (responde y deja una copia del caso en el canal de registro). Nunca saltarse `guardTarget`.
- **El silencio es el *timeout* de Discord** (`member.timeout`), nunca un rol ni un `setTimeout`: sobrevive a los reinicios y no hay nada que configurar. Máximo 28 días; sin tiempo, 1 hora.
- **Las advertencias viven en la API** (`services/moderation`: `createWarning`, `listWarnings`, `revokeWarning`; `/v1/discord/warnings`), con la ID de Discord, no con la cuenta de la web. `unwarn` revoca, nunca borra. `POST` devuelve `active_count` y la sanción automática se decide **solo** con ese número (`features/moderation/autoSanction`: 3 → silencio de 1 hora, 5 → expulsión; los umbrales viven en `MODERATION` de `config/constants.ts`).
- **Nunca mencionar a nadie**: todo envío usa `allowedMentions: { parse: [] }` y el texto de los usuarios se escapa o se corta (`clip`, `escapeMarkdown`, `fenced`).
- **Registro de auditoría** (`MODLOG_CHANNEL_ID`, opcional): `features/moderation/modlog` es el único que escribe en ese canal, nunca lanza y registra el fallo una sola vez por racha. `features/auditLog/handlers` (dependencias inyectadas, probado con objetos falsos) lo alimenta con mensajes borrados o editados, entradas, salidas, expulsiones, baneos y silencios hechos a mano; `features/auditLog/serverHandlers` (con `serverEmbeds`) hace lo mismo con la voz (entrar, salir, cambiar o ser movido o desconectado; mute o ensordecimiento aplicado por otro; transmisión), los roles (crear, editar con diferencias, borrar), los ajustes del servidor y los emojis, stickers y sonidos, todo en el mismo canal; `events/auditLog.ts` solo registra los listeners, **separados** de los de `guildMember*` que sincronizan cuentas (un fallo del registro nunca debe frenar la sincronización). Ignora bots, webhooks (el puente de Minecraft), el propio canal de registro y los `!comandos`.
- **No duplicar entradas**: lo que hace el bot se marca con `botActions.mark(kind, id)` (`features/moderation/recent`, 30 s) y los listeners lo omiten. Un comando nuevo que cause un evento que el registro también escucha **debe marcarlo** antes de actuar. Quién hizo algo sale del registro de auditoría de Discord (`findAction`), que puede tardar: es de mejor esfuerzo y la entrada dice "No se pudo saber" si no lo encuentra.
- Requiere el intent `GuildModeration` y los permisos *Expulsar*, *Banear*, *Moderar miembros*, *Gestionar mensajes*, *Gestionar canales* y *Ver el registro de auditoría*.
- Los emojis personalizados están **solo** en `config/emojis.ts` (`EMOJI_DEFS`; `EMOJIS` para texto, `emojiOf` para botones y reacciones, `emojiUrl` para imágenes). Nunca escribir `<:nombre:id>` ni una ID de emoji en otro archivo.

### Voz del bot (Noa)
- **Toda respuesta a un miembro sale por `lib/voice.ts`**: `ok(quien, texto)` → `✅ ~ **Nombre**, texto`, `fail(...)` → `❌ ~ **Nombre**, texto`, `ask(...)` para una pregunta. El texto va en minúscula tras la coma (la función lo baja si empieza con mayúscula) y `quien` es el miembro (o `null`, que da `✅ ~ Texto`). **Nunca escribir un ✅ o un ❌ suelto** en un mensaje de respuesta; las únicas excepciones son las reacciones (`message.react`) y las vistas sin nadie a quien nombrar (títulos de embed, tarjetas de `passwordReset`, el aviso de `login/confirm`, `quickUpload/view`).
- **Un `UserError` lleva texto plano**, sin emoji ni nombre: `userMessageFor(error, comando, ámbito, quien)` le pone el `❌ ~ **Nombre**,`. Los handlers (`interactionCreate`, `messageCreate`, `dmMessage`) pasan siempre a quien preguntó (`whoOf(interaction)` o el miembro). Un error de uso se responde con `formatParseError` (el problema más la línea citada `> **Uso:** ...`, `usageLine`).
- **Un custom emoji no se ve en el título, el pie ni el autor de un embed** (sí en el contenido, la descripción y los valores de campo): ahí van emojis unicode o ninguno.

### Comandos de información
- Cada vista (`serverView`, `userView`, `avatarView`, `infoView`, `emojiView`) recibe **datos planos** y devuelve el embed, así se prueba con objetos falsos; solo `serverData` y `replies` leen objetos de discord.js. Los colores sin color propio usan `pastel()` (la paleta de Noa) con el azar inyectado.
- **Toda persona que se nombra pasa por `features/lookup`** (`answerFor` + `finishPick`, opciones `usuario` y `buscar`): una mención o un **ID** funciona aunque la persona **no esté en el servidor** (entonces se omite todo lo que sea del servidor, nunca es un error); un nombre se busca sin mayúsculas ni acentos, uno solo se usa, varios abren un menú con el dueño en el `customId`. Los comandos de sanción **no** lo usan: un nombre aproximado no debe banear a nadie sin confirmar.
- **Listas largas con botones** (`pages.ts`): la página va en el `customId` (`server:page:<vista>:<n>:<slot>|dueño`), la lista se vuelve a leer del servidor con quien presionó, y nada se guarda. **`server --channels` solo nombra canales que quien pregunta puede ver** (`permissionsFor(miembro)`); los demás solo se cuentan.
- **El estado (online/idle/dnd, actividad) necesita el intent privilegiado `GuildPresences`**, que el bot siempre pide: debe estar activado para el bot en el Developer Portal o Discord rechaza el login. Quien está desconectado no tiene presencia: se omite su estado, no se rompe.
- **Los datos extra de `server` se leen solo para su opción** (`collectExtra`: actividad, comunidad, eventos, sonidos, stickers); el `server` simple nunca hace esas llamadas. La lista completa de miembros se pide como máximo cada 10 minutos (`features/info/members`), y el puesto de entrada o los impulsores son aproximados cuando esa lista está incompleta.
- **Nada que Discord no dé al bot se inventa**: no hay biografía ni región del servidor, la placa de nombre no tiene URL y un sticker Lottie no tiene imagen; la vista lo dice en vez de adivinar.
- **El estado de la API de Panita** sale de `ApiClient.health()` (ruta pública `GET /v1/health`, sin clave, 3 s, sin reintentos, nunca lanza); su cuerpo no lleva el sobre `data`, por eso no usa `api.get`.
- **`emoji add`**: la imagen solo viene de un adjunto, de otro emoji o de un enlace https de `cdn.discordapp.com` / `media.discordapp.net` (los redireccionamientos deben quedarse en Discord); tiempo límite, tope de 8 MB, tipo por los primeros bytes, 256 KB como máximo (una imagen estática más grande se reduce a 128 px, una animada no). `emoji add/remove/rename` se limitan al Staff **dentro de `run`** con `accessDenial('staff', ...)` (el comando es de todos para `ver`), y los botones de confirmación lo repiten en su `guard`.

### Agregar un comando
```ts
import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../core/command';
import { CATEGORIES } from '../../config/constants';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('ejemplo')
    .setDescription('Descripción corta.')
    .addStringOption(o => o.setName('texto').setDescription('Texto').setRequired(true)),
  meta: {
    category: CATEGORIES.utility,
    description: 'Descripción larga para /help.',
    aliases: ['ej'],          // solo para prefijo (!ej)
    access: 'everyone',       // 'everyone' | 'staff' | 'developer'
  },
  async run(ctx) {
    await ctx.reply(ctx.options.getString('texto', true));
  },
});
```

## Formato de Tezzlar Days (`src/data/tezzlar.ts`)
Al momento de agregar información para los días de Tezzlar en el archivo `tezzlar.ts`, se DEBEN seguir estrictamente las siguientes reglas de formato para mantener una estética consistente en los Embeds de Discord:

1. **Títulos de Secciones en Mayúscula:**
   Los `name` de cada `field` deben estar siempre en mayúscula y con su respectivo emoji:
   - `MISIONES ACTIVAS 🛠️`
   - `CAMBIOS DE DIFICULTAD 🎯`
   - `NUEVOS CRAFTEOS 🔨`
   - `NUEVOS MOBS 🥚`

2. **Uso de Blockquotes:**
   Todos los strings en el campo `value` de cualquier field DEBEN comenzar con el prefijo `>>> ` para que Discord renderice todo el contenido como una cita (blockquote).

3. **Títulos en Negrita para los Items:**
   Cada item (cambio de dificultad, mob, misión, etc.) debe tener una palabra clave a modo de título en negrita acompañado de una flecha, seguido de un salto de línea y la descripción.
   *Formato:* `>>> **➔ Título clave**\nDescripción del cambio.`

4. **Separación:**
   Si hay múltiples items dentro de un mismo field, deben separarse por un doble salto de línea (`\n\n`).

5. **Identación de Recompensas y Castigos (Misiones):**
   Las listas debajo de las misiones deben usar el caracter invisible `⠀` (U+2800) para forzar la identación en Discord, y guiones escapados (`\\-`) para las sub-listas.
   *Ejemplo:*
   ```
   >>> **➔ Nombre de la Misión**
   Descripción de la misión.
   ⠀◈ Recompensas:
   ⠀⠀\\- Item 1
   ⠀⠀\\- Item 2
   ⠀◈ Castigos:
   ⠀⠀\\- Castigo 1
   ```
