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
  index.ts          arranque (cliente, registro, handlers, login)
  config/           env.ts (variables de entorno validadas) y constants.ts (URLs, IP, colores, assets)
  core/             framework de comandos: defineCommand, contexto unificado, parser de prefijo, customId, registro
  handlers/         interactionCreate (slash + componentes) y messageCreate (prefijo)
  events/           listeners del gateway, delgados, delegan en services/
  services/         lógica de negocio y TODO acceso a Prisma
  lib/              helpers compartidos (prisma, minecraft, discord, formato)
  data/             contenido estático (días de Tezzlar, minieventos, recetas...)
  features/         módulos grandes divididos (tickets)
  commands/<cat>/   un archivo por comando
```
- **Los comandos son delgados:** leen opciones → llaman a un service → construyen el embed.
- **Prisma solo en `services/`** (y `lib/prisma.ts`).
- **Variables de entorno solo vía `config/env.ts`**; nunca `process.env` directo.
- **URLs externas y assets solo vía `config/constants.ts` y `lib/minecraft.ts`** (skins, cabezas, etc.).
- **Un comando se define una sola vez** para slash y prefijo; el parser de prefijo usa el esquema del `SlashCommandBuilder`. Nunca ramificar por "¿es prefijo?".
- **Componentes (botones, menús, modales):** usar `customId()` e incluir `owner` cuando solo quien ejecutó el comando pueda usarlo. El router valida el dueño de forma centralizada.
- Respuestas efímeras con `{ ephemeral: true }` en el payload del contexto (se traduce a `MessageFlags`).

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

## Formato de Tezzlar Days (`src/utils/tezzlarData.ts`)
Al momento de agregar información para los días de Tezzlar en el archivo `tezzlarData.ts`, se DEBEN seguir estrictamente las siguientes reglas de formato para mantener una estética consistente en los Embeds de Discord:

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
