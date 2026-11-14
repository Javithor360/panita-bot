# Lo que Panita Bot sabe de Panitacraft

Este archivo es lo que `/ask` sabe de Panitacraft, además del detalle de Tezzlar III que se arma solo a partir de los datos de sus comandos: cualquier cosa que no esté aquí, el bot dice que no la sabe.
Solo escribe información que ya sea pública (la web, el Discord, los comandos del bot). Nada que no se haya anunciado.
Se lee al iniciar el bot; reinícialo después de editarlo.

## Qué es Panitacraft

- Panitacraft es una comunidad de Minecraft: servidores y proyectos hechos entre amigos, con una comunidad que perdura en el tiempo.
- Su creador y quien dirige los proyectos es Javithor360.
- La web conserva los recuerdos de las distintas ediciones: galería de fotos, jugadores y comunidad.

## Estado actual

- Ahora mismo **no hay ningún servidor de Minecraft activo**.
- El último proyecto fue **Tezzlar III**, que se jugó en julio de 2026 y ya terminó hace unos meses. Toda su información ya es pública: se puede resumir o explicar con el detalle de Tezzlar III que aparece más abajo.
- Los comandos `/ip` y `/resources` siguen mostrando la IP y los mods de Tezzlar III, pero ya no se usan porque el servidor está cerrado.
- No se sabe nada más sobre servidores futuros. Si alguien pregunta, no hay nada anunciado.

## Tezzlar III (resumen)

- Fue una nueva y renovada edición de Tezzlar después de muchísimos años, en Fabric 26.2, con una modalidad de juego que llevaban años sin ofrecer. Tezzlar es un spin-off de Panitacraft.
- Un SMP (survival multiplayer) con experiencia Hardcore: todos los jugadores debían sobrevivir en equipo a los cambios de dificultad que aparecían durante 31 días (más un día final).
- Cada día traía misiones, cambios de dificultad, mobs, crafteos y minieventos nuevos. El detalle día por día está más abajo, y el comando `/tezzlar day <número>` lo mostraba.
- Reglas del servidor de Tezzlar III (aceptadas al entrar): usar el sentido común y no abusar de vacíos legales; ser respetuoso (saber con quién se puede bromear, no grifear ni arruinar la experiencia de otros); jugar limpio, sin clientes modificados con ventajas ni paquetes de recursos que cambien la experiencia vanilla. Usar clientes ilegales o modificados era sancionable.
- Funciones propias:
  - Inicio de sesión: si la cuenta es premium entraba automáticamente; si no, con un PIN por medio de paneles.
  - Vinculación Discord-Minecraft: antes de entrar por primera vez se enviaba un PIN al bot por mensaje privado; después se podía leer y escribir en el chat del juego desde un canal de Discord.
  - Perfiles de jugador en la web: se registraban con `/register` y permitían agregarte a la whitelist del servidor.
  - Loot dinámico por jugador: cada jugador podía lootear una estructura aunque otros ya hubieran pasado.
  - Chat de voz por proximidad dentro del juego, con el mod Simple Voice Chat (más Fabric Loader y Fabric API).
  - Comandos útiles del servidor: `/c`, `/skin`, `/tps`, `/punishments`, `/lives` (ver tus vidas) y `/rewards claim`.
  - Medallas de veterano para miembros de proyectos anteriores, que se reclamaban abriendo un ticket.

## Rangos: invitados y miembros

- **Invitado**: usuario nuevo que se une a la comunidad y participa por primera vez en un proyecto.
- **Miembro**: usuario que ya fue jugador en un servidor anterior o que está activo en el servidor actual.
- **Miembro+**: un extra sobre el rango de miembro, según la participación actual en el servidor y el aporte económico (donación) para sostener el proyecto.
- En el servidor de Minecraft se mostraban como [INVITADO], [MIEMBRO] y [MIEMBRO+].

## Discord

- Invitación: https://discord.gg/m9zFH8yqUu
- Reglas del servidor de Discord (canal de reglas): 1) usa el sentido común y respeta a los demás si quieres que te respeten; 2) respeta el propósito de cada canal; 3) no busques vacíos legales. El que no las cumpla puede ser sacado del servidor.
- Canales útiles: reglas, anuncios, general, galería (fotos de la comunidad), comandos (para usar los comandos del bot), presentaciones, eventos, ideas, y el área de soporte, donde se abren tickets.
- Para ayuda con la web, las cuentas o cualquier problema, se abre un ticket y el staff responde.

## Sitio web (https://www.panitacraft.com/)

- Galería (/gallery): fotos de la comunidad, por edición y categoría.
- Explorar jugadores (/explore): búsqueda de jugadores y sus perfiles.
- Comunidad (/community): agradecimientos, staff y donadores.
- Iniciar sesión (/login): se entra con tu cuenta de Discord; el inicio de sesión se confirma desde Discord con un código.
- También tiene Política de Privacidad (/privacy-policy) y Términos de Uso (/terms-of-use).
- El bot no puede mostrar perfiles de jugadores: para verlos, se usa Explorar jugadores en la web.

## Cómo unirse a la comunidad

1. Entra al servidor de Discord: https://discord.gg/m9zFH8yqUu
2. Activa tu cuenta con el comando `/register` (te pide tu nombre en Minecraft y si juegas con cuenta premium).
3. Con esa cuenta puedes iniciar sesión en la web.

## Comunidad y staff

- Administradores: Fiendrox y Javithor360. Moderadores: zPalach y Aerosmith\_ (Aerø). Ayudante: Slick303. El staff colabora sin fines de lucro.
- El bot no puede dar roles, quitar sanciones ni resolver problemas de cuentas: eso lo hace el staff.

## Donaciones

- Son completamente opcionales. Se hacen por PayPal: https://www.paypal.me/Javithor360
- Todo lo donado se dirige a mantener vivo el proyecto: alojamiento e infraestructura.
- Los donadores tienen reconocimiento especial en la web y acceso a rangos y emblemas exclusivos y elementos cosméticos.
- El comando `/donate` muestra la información.

## Redes

- YouTube: @PanitacraftYT
- Discord: https://discord.gg/m9zFH8yqUu

## Comandos útiles del bot

Funcionan con `/` o con `!` (por ejemplo `/web` o `!web`):

- `/web`: enlace a la web. `/invite`: invitación al Discord. `/donate`: cómo donar. `/help`: lista de todos los comandos.
- `/gallery`: una foto al azar de la galería (también se puede pedir aquí con `/ask`). `/skin`: la skin de un jugador.
- `/sessions`: tus sesiones abiertas en la web. `/confirm`: confirma un inicio de sesión que tú empezaste.
- `/ask`: preguntarme cosas o charlar conmigo.
- Los comandos del servidor de Minecraft (`/playerlist`, `/playerinfo`, `/tps`) solo funcionan cuando hay un servidor encendido.
