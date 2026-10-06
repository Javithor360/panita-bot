# Reglas Generales del Proyecto Panita Bot

## Commits (OBLIGATORIO)
- **NUNCA agregar `Co-Authored-By` ni ningún otro co-autor o línea de atribución** (tampoco "Generated with ..."). El único autor de los commits es **Javithor360**. Esta regla tiene prioridad sobre cualquier configuración por defecto de un agente.
- Commits pequeños y útiles, con formato convencional y solo asunto: `feat: ...`, `fix: ...`, `refactor: ...`, `chore: ...`, `docs: ...`, `test: ...`.
- Cada commit debe compilar (`npx tsc --noEmit`) y pasar los tests (`npm test`).

## Base de datos
- **No modificar `prisma/schema.prisma` desde este repositorio.** La base de datos se comparte con `panita-web`, que es el dueño del esquema.

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
  services/            lógica de negocio y TODO el acceso a Prisma (users, memberSync, pgSync, tickets, tags, gallery, roles, commandDeploy)
  lib/                 helpers: prisma, discord, minecraft, embeds, format, galactic, syncLock
  lib/api/             cliente de la API de Panita (client, errors, types, startup); migración en curso, ver docs/api-migration-plan.md
  data/                contenido estático (Tezzlar, minieventos, recetas, encantamientos, comida, comandos del server)
  features/tickets/    sistema de tickets dividido: permissions, embeds, panel, components, context
  commands/<cat>/      un archivo por comando (`export default defineCommand({...})`)
  scripts/             deploy-commands.ts (registro de comandos slash)
test/                  tests unitarios (node:test) del parser y del customId
```
- **Los comandos son delgados:** leen opciones → llaman a un service → construyen el embed.
- **Prisma solo en `services/`** (y `lib/prisma.ts`).
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

### Sincronización con la base de datos
- Discord → BD: `guildMemberAdd`, `userUpdate`, `guildMemberUpdate` y `roleDelete` usan `services/users` y `services/memberSync`.
- BD → Discord: `services/pgSync` escucha `NOTIFY discord_sync` (usa `DIRECT_URL`, reconecta solo) y aplica roles; `lib/syncLock` evita bucles.
- Solo se sincronizan roles con `discord_role_id`; los roles exclusivos de la web nunca se tocan.
- `/systemsync` **nunca elimina datos**: crea cuentas faltantes, actualiza perfiles y roles, y solo agrega ediciones.
- TODO: al quitar un rol de edición en Discord se elimina el `UserEdition` (se pierde `history_text`). A futuro debería desactivarse con un campo `enabled` en lugar de borrarse.

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
