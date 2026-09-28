# Panita Bot

Bot de Discord de la comunidad **Panitacraft**. Complementa a [panita-web](https://www.panitacraft.com): sincroniza cuentas, roles y ediciones entre Discord y la base de datos de la web, y ofrece comandos de información del servidor de Minecraft, un sistema de tickets, tags y más.

Todos los comandos funcionan como **Slash Command** (`/comando`) y con el **prefijo clásico** (`!comando`), salvo que se indique lo contrario.

---

## Requisitos

- **Node.js 22** o superior.
- La base de datos **PostgreSQL** de panita-web (el esquema de Prisma lo administra panita-web; este repositorio no lo modifica).
- Una aplicación de Discord con un bot y estos **Privileged Gateway Intents** activados: *Server Members Intent* y *Message Content Intent*.

## Instalación

```bash
git clone https://github.com/Javithor360/panita-bot.git
cd panita-bot
npm install          # también ejecuta `prisma generate`
```

Crea un archivo `.env` en la raíz:

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Token del bot. |
| `DATABASE_URL` | ✅ | Conexión a PostgreSQL (pooler de transacciones, p. ej. puerto 6543 con `?pgbouncer=true`). |
| `DIRECT_URL` | ✅ | Conexión de sesión/directa (p. ej. puerto 5432). Se usa para `LISTEN/NOTIFY` y migraciones. |
| `STAFF_ROLE_ID` | ✅ | Rol de Staff (acceso a comandos de moderación y tickets). |
| `DEVELOPER_ID` | ✅ | ID de usuario del desarrollador (acceso a comandos de desarrollador). |
| `ALT_ROLE_ID` | ✅ | Rol que identifica cuentas secundarias (multicuentas). |
| `GUILD_ID` | Recomendada | Servidor principal. Si está definida, los comandos se registran solo en ese servidor y se ignoran eventos de otros. Necesaria para la sincronización web → Discord. |
| `CLIENT_ID` | Opcional | ID de la aplicación. Si no se define, se obtiene automáticamente del token. |
| `PORT` | Opcional | Puerto del endpoint de keep-alive (por defecto `3005`). |

El bot valida estas variables al arrancar y se detiene con un error claro si falta alguna obligatoria.

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Inicia el bot en desarrollo con recarga automática. |
| `npm run build` | Compila TypeScript a `dist/` (limpia la carpeta antes). |
| `npm start` | Inicia el bot compilado (`dist/index.js`). |
| `npm run deploy` | Registra los comandos Slash en Discord (desde el código fuente). |
| `npm run deploy:prod` | Igual que `deploy`, pero desde `dist/`. |
| `npm test` | Ejecuta los tests unitarios. |

### Registrar los comandos Slash

Cada vez que se agrega un comando o cambian sus opciones hay que registrarlos: con `npm run deploy`, o desde Discord con `/deploy` (solo desarrollador). Con `GUILD_ID` definida se registran en ese servidor (se actualizan al instante) y se limpian los comandos globales para evitar duplicados.

Los **alias solo existen con prefijo** (`!donar`, `!tz`, ...) y no se registran como comandos Slash.

## Despliegue

El bot está alojado en **FadeHost**. Pasos típicos:

```bash
npm install
npm run build
npm run deploy:prod   # solo si cambiaron los comandos
npm start
```

`server.ts` expone un endpoint HTTP (`GET /` → `Bot is alive!`) en `PORT`, útil para monitores de uptime. Es opcional en hostings que mantienen el proceso siempre activo.

> ⚠️ No ejecutes dos instancias con el mismo token a la vez (por ejemplo local y en el hosting): ambas responderían a cada comando.

## Estructura del proyecto

```
src/
  index.ts        arranque del bot
  config/         variables de entorno validadas y constantes (URLs, IP, colores, assets)
  core/           framework de comandos (definición única slash + prefijo, parser, customId, registro)
  handlers/       enrutamiento de interacciones y mensajes con prefijo
  events/         eventos del gateway de Discord
  services/       lógica de negocio y acceso a la base de datos
  lib/            utilidades compartidas
  data/           contenido estático (días de Tezzlar, minieventos, recetas...)
  features/       módulos grandes (sistema de tickets)
  commands/       un archivo por comando, agrupados por categoría
test/             tests unitarios
```

Las convenciones completas (cómo agregar un comando, dónde va cada cosa, formato de los datos de Tezzlar) están en [`.agents/AGENTS.md`](.agents/AGENTS.md).

---

## Funcionalidades

### Comandos

Sintaxis: `<obligatorio>`, `[opcional]`, `[--bandera]`. Los alias se usan con prefijo (`!alias`).

#### General

| Comando | Descripción | Alias |
|---|---|---|
| `donate [--simple]` | Información para apoyar el servidor con donaciones (PayPal). `--simple` envía solo el enlace. | `donar`, `donacion`, `donaciones`, `fund` |
| `invite` | Enlace de invitación al servidor de Discord. | `invitacion`, `discord` |
| `register` | Activa tu cuenta del Panel Web: abre un formulario privado para elegir IGN y contraseña. Solo quien ejecuta el comando puede usar el botón; no disponible para multicuentas. | `registrar`, `activar` |
| `web` | Enlace al Panel Web. | `pagina`, `panel` |

#### Utilidad

| Comando | Descripción | Alias |
|---|---|---|
| `help [comando]` | Lista los comandos que puedes usar, o el detalle de uno (uso con `/` y `!`, alias, permisos). | `ayuda` |
| `ping` | Latencia del bot y del gateway. | `latencia` |
| `uptime` | Tiempo que el bot lleva en línea. | `tiempo`, `online` |

#### Diversión

| Comando | Descripción | Alias |
|---|---|---|
| `announcements` | Un recordatorio "amistoso" (en chileno) para leer los anuncios. | `anuncios` |
| `enchant <texto>` | Traduce un texto al alfabeto de la mesa de encantamientos (Standard Galactic Alphabet). | `encantar` |
| `disenchant <texto>` | Traduce del Standard Galactic Alphabet al español. | `desencantar` |
| `gallery` | Foto aleatoria de la galería de la web, con autor, fecha, categorías y edición. Botones para otra foto 🎲 y para el enlace 🔗 (solo para quien ejecutó el comando). | `galeria`, `foto` |
| `panita3` | "Revela" la fecha de salida de Panitacraft 3. | — |

#### Minecraft

| Comando | Descripción | Alias |
|---|---|---|
| `commands` | Comandos útiles dentro del servidor de Minecraft. | `comandos`, `cmds` |
| `enchantments` | Niveles máximos de encantamientos y efectos de poción en Tezzlar III. | `enchantment`, `encantamientos`, `enchants` |
| `food` | Rebalanceo de comidas y platillos especiales de Tezzlar III. | `comida`, `foods`, `comidas` |
| `ip [--numeric]` | IP del servidor (dominio o numérica). | `server`, `jugar` |
| `minievent <id\|list>` | Información de un minievento de Tezzlar, o la lista completa. | `minieventos`, `minievents`, `me` |
| `recipes <id\|list>` | Crafteos y recetas especiales, con imagen guía, o la lista completa. | `recetas`, `crafteos`, `crafts` |
| `resources` | Descarga de mods/texturas y guía de instalación. | `recursos`, `assets` |
| `skin <jugador>` | Skin de un jugador con un menú para cambiar de vista (3D, busto, cabeza...). Solo quien ejecutó el comando puede cambiar la vista. | `skins` |
| `tezzlar day <numero> [--force]` | Información de un día de Tezzlar III (se desbloquea según la fecha; `--force` solo para el desarrollador). Con prefijo también funciona `!tz <numero>`. | `tez`, `tz` |
| `trailer` | Enlace al tráiler de Tezzlar 3. | — |

#### Moderación (Staff)

| Comando | Descripción | Alias |
|---|---|---|
| `bot status <online\|idle\|dnd\|invisible>` / `bot activity <texto>` | Cambia el estado o la actividad del bot (`clear` quita la actividad). | — |
| `say <mensaje> [canal]` | El bot envía un mensaje, opcionalmente en otro canal. Con prefijo se borra el mensaje original. | — |
| `tag add <nombre> [texto] [adjunto]` / `tag delete <nombre>` / `tag list` | Administra tags (mensajes rápidos con texto e imágenes). | `t` |
| `!tag <nombre>` | **Solo prefijo:** publica el contenido de un tag. Las imágenes guardadas se refrescan automáticamente para que no expiren. | `!t <nombre>` |

#### Tickets (Staff)

| Comando | Descripción |
|---|---|
| `ticket panel create [canal]` | Crea un panel de tickets mediante un formulario (**solo Slash**). |
| `ticket panel resend <panel_id> <canal>` | Reenvía un panel a otro canal. |
| `ticket panel delete <panel_id>` | Elimina un panel y su mensaje. |
| `ticket panel list` / `ticket panel info <panel_id>` | Lista los paneles o muestra la configuración de uno. |
| `ticket config staff_role <panel_id> <rol>` | Rol de staff del panel. |
| `ticket config category <panel_id> <categoría>` | Categoría donde se crean los tickets. |
| `ticket config counter <panel_id> <número>` | Ajusta el contador de tickets. |
| `ticket config show_id_in_name <panel_id> <si\|no>` | Incluir o no el ID del panel en el nombre del canal. |
| `add <usuario>` / `remove <usuario>` | Añade o remueve a un usuario del ticket actual. |
| `close` | Cierra el ticket actual (con confirmación). |

#### Desarrollador

| Comando | Descripción | Alias |
|---|---|---|
| `systemsync` | Sincronización completa con el servidor: crea cuentas faltantes y actualiza perfiles, roles y ediciones. **No elimina datos.** (Solo Slash) | — |
| `cleanalts` | Elimina de la base de datos las cuentas de las multicuentas. (Solo Slash) | — |
| `deploy` | Registra los comandos Slash en Discord. | `deploycommands` |

### Sistema de tickets

- **Paneles** con un botón "Crear Ticket"; cada usuario puede tener un solo ticket abierto por servidor.
- Cada ticket es un canal privado (creador, staff del panel y el bot), numerado con el contador del panel (`ticket-0001` o `ticket-<panel>-0001`).
- **Cerrar:** el creador o el staff; la confirmación solo la puede usar quien pidió cerrar. Al cerrarse se renombra a `closed-...` y se quita el acceso a los usuarios.
- **Controles del staff** en tickets cerrados: 📄 transcripción HTML, 🔓 reabrir y ⛔ eliminar el canal. Solo el staff del panel o los administradores pueden usarlos.
- Los paneles y controles publicados antes de la reestructuración siguen funcionando.

### Sincronización con Panita Web

- **Nuevos miembros:** se crea automáticamente una cuenta deshabilitada (con el rol por defecto), que se activa con `/register`.
- **Perfil:** los cambios de nombre de usuario y avatar (global o de servidor) se guardan en la base de datos.
- **Discord → Web:** al cambiar los roles de un miembro se actualizan sus roles y ediciones en la web (solo los roles vinculados a un rol de Discord).
- **Web → Discord:** cuando la web cambia los roles o ediciones de un usuario, la base de datos lo notifica (`LISTEN/NOTIFY`) y el bot aplica el rol en Discord. La conexión se reconecta sola si se cae.
- **Roles eliminados** en Discord: se desvincula el rol de la web sin borrarlo.

### Otros

- Manejo centralizado de errores: un fallo en un comando o botón responde con un mensaje de error y nunca tumba el bot.
- Mensajes de uso correcto generados automáticamente cuando faltan argumentos en un comando con prefijo.

---

## Problemas conocidos / TODO

- **Ediciones al quitar un rol en Discord:** hoy se elimina el `UserEdition` del usuario, lo que borra su `history_text`. A futuro debería desactivarse (un campo `enabled`) en lugar de eliminarse.
- **Assets en el CDN de Discord:** algunos íconos e imágenes (`Picel.gif`, `corazonestezzlar.png`, imágenes de recetas) apuntan a enlaces de Discord que expiran. Conviene moverlos a Cloudinary; están centralizados en `src/config/constants.ts` (y `src/data/recipes.ts`).
