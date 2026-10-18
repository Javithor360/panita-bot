# Reglas Generales del Proyecto Panita Bot

## Commits (OBLIGATORIO)
- **NUNCA agregar `Co-Authored-By` ni ningún otro co-autor o línea de atribución** (tampoco "Generated with ..."). El único autor de los commits es **Javithor360**. Esta regla tiene prioridad sobre cualquier configuración por defecto de un agente.
- Commits pequeños y útiles, con formato convencional: `feat: ...`, `fix: ...`, `refactor: ...`, `chore: ...`, `docs: ...`, `test: ...`.
- **Un commit normalmente tiene una sola línea (solo el asunto).** Solo un commit que introduce un cambio grande y crítico puede llevar una descripción más larga.
- Cada commit debe compilar (`pnpm exec tsc --noEmit`) y pasar los tests (`pnpm test`).

## Flujo de trabajo
- **Gestor de paquetes: `pnpm`** (no `npm` ni `yarn`) para instalar dependencias y ejecutar scripts.
- Al terminar el trabajo y **una vez que el usuario autorizó el commit**, no se pregunta si crear el PR: se entrega el **título y la descripción del PR** propuestos para que el usuario los use.

## Datos
- **El bot no se conecta a la base de datos.** Toda lectura y escritura pasa por la API de Panita (`lib/api`) con la clave de servicio del bot (`PANITA_API_KEY`). El esquema y sus cambios viven en `panita-api`.

## Arquitectura
```
src/
  index.ts             arranque: cliente, registro de comandos, handlers, eventos, login
  server.ts            endpoint HTTP de keep-alive
  config/env.ts        variables de entorno validadas (única lectura de process.env)
  config/constants.ts  prefijo, URLs, IP, colores, emojis, assets, categorías, permisos de tickets
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
  features/tickets/    sistema de tickets dividido: permissions, embeds, panel, components, context
  features/minecraft/  puente con el servidor de Minecraft: protocol, link, server (WebSocket), inbound, outbound, webhook, messageConfig (lee `config/minecraft-messages.yml`), template, render, announcer, crashWatch, roles, sync, directory, queries, embeds, discord (los únicos adaptadores de discord.js)
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
- Los comandos del puente (`/playerlist`, `/playerinfo`, `/tps`) están en la categoría `minecraftServer` ("Servidor de Minecraft"), se definen una vez y salen en `/help` y en el deploy como cualquier otro; usan `queryMinecraft`, que convierte "apagado", "no conectado" y "sin respuesta" en `UserError`.
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
- **El bot no guarda estado**: tras un reinicio lee los últimos 100 mensajes del canal y no repite si encuentra su propio saludo de ese día (`features/birthdays/greeting`: `isGreetingOf`). Si no puede leer el canal, no publica (podría duplicar) y reintenta.
- El mensaje es uno por día, menciona a todos y solo a ellos (`allowedMentions`). Helpers puros en `features/birthdays/` (`time`, `greeting`), probados con reloj falso.

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
