# Reglas Generales del Proyecto Panita Bot

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
