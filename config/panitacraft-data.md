# Datos de Panitacraft: web, cuentas y comunidad

Contexto para el asistente de Panita Bot (`/ask`). Complementa a `panita-bot/config/panitacraft-knowledge.md` (qué es Panitacraft, estado actual, Tezzlar III, reglas, donaciones, comandos): aquí está cómo funcionan las cuentas, las ediciones, la galería, los emblemas, las notificaciones, los formularios, la comunidad y los tickets.

Solo describe **reglas y funciones públicas**. No contiene datos de ningún miembro ni las listas de ediciones, formularios, donadores o Panita del Mes: eso el bot lo consulta en vivo en la base de datos y llega aparte, en un bloque [DATOS], solo cuando la pregunta lo necesita. Lo que no esté en ese bloque, el bot no lo sabe.

Fecha de esta versión: 20 de noviembre de 2026. Si algo cambió después, el staff tiene la información al día.

## Cuentas: cómo se crean y cómo se entra

- Toda cuenta nace de Discord. Al entrar al servidor se crea una cuenta **desactivada**. Se activa con `/register`, que pide el nombre de Minecraft (ign) y si juegas con cuenta **premium** (Microsoft) o no. No pide contraseña.
- El ign tiene de 3 a 16 caracteres: letras, números y guion bajo (`_`). No puede repetirse con el ign o el nombre de Discord de otra persona (sin distinguir mayúsculas).
- **Si sales del servidor de Discord, tu cuenta se desactiva** y se cierran tus sesiones. Al volver, se reactiva con `/register`.
- **Iniciar sesión en la web** (/login): escribes tu ign o tu nombre de usuario de Discord y la web muestra un **código de 4 dígitos**. Se lo mandas al bot con `/confirm <código>` en el servidor (la respuesta solo la ves tú) o por mensaje privado escribiendo solo el código. El código vence en 3 minutos y solo lo puede confirmar la cuenta de Discord de esa persona.
- **Confirma solo inicios de sesión que tú empezaste.** Si alguien te pide un código, no lo envíes. Nadie del staff pide códigos ni contraseñas.
- La sesión de la web dura 30 días. Con `/sessions` ves tus sesiones abiertas y puedes cerrarlas. Al iniciar sesión desde un dispositivo nuevo te llega un aviso en la web.
- **La contraseña es opcional** (es una forma antigua de entrar). Se crea en Ajustes (“Contraseña (opcional)”) o con `/register with_password`. Debe tener de 6 a 32 caracteres e incluir al menos un carácter especial.
- **Si olvidaste tu contraseña**: en Ajustes pulsas “No recuerdo mi contraseña” y el bot te escribe un mensaje privado con los botones **Restablecer** e **Ignorar**. La solicitud vence en 10 minutos y solo puedes pedir una cada 10 minutos. Si tus mensajes privados están cerrados, la web te ofrece enviarla al canal de comandos. Tu sesión actual sigue abierta, así que conviene revisar `/sessions`.
- Cambiar tu ign desde la web solo lo pueden hacer los **autores de confianza**; los demás lo piden al staff. Si alguien cambia de ign, los enlaces viejos a su perfil siguen funcionando.
- El bot no puede dar roles, activar cuentas ni resolver problemas de acceso: eso lo hace el staff por ticket.

## Rangos y staff

- Rangos de la comunidad: **Invitado**, **Miembro** y **Miembro+** (ya explicados en el otro archivo). También existen **Invitado+** y **Alt** (cuenta alterna), y rangos de donador: **Donador**, **Mecena** y **Patrocinador**.
- El staff tiene tres niveles: **Administrador**, **Moderador** y **Ayudante**. Los administradores pueden todo; a moderadores y ayudantes los administradores les dan permisos concretos. Un ayudante hace menos que un moderador, y moderadores y ayudantes no pueden actuar sobre alguien de su mismo nivel o superior.
- Un **autor de confianza** es un miembro al que el staff autoriza a subir fotos y a cambiar su ign. Es una marca aparte del rango.
- Un miembro puede tener varios rangos a la vez. El rango que se muestra primero en su tarjeta es el de mayor orden.

## Ediciones

- Una **edición** es un proyecto o temporada de Panitacraft. Cada foto pertenece a una edición y cada jugador tiene su trayectoria: las ediciones en las que participó, con un texto de historia opcional.
- Qué ediciones públicas existen, sus fechas, cuánto duró cada una, quién participó, sus emblemas y si hay alguna anunciada que aún no empieza, sale de los datos en vivo ([DATOS]). La historia de las ediciones pasadas está en la sección “Historia de las ediciones”. De una edición que ni esos datos ni este archivo mencionan, no hay información pública.
- Cada edición tiene nombre, fechas de inicio y fin, sinopsis y un color. El staff las administra.
- Ser parte de una edición puede venir de tener su rol de Discord: al recibirlo se te agrega a la trayectoria y te llega una notificación (“¡Ya eres parte de …!”).
- Algunas ediciones son **privadas**: solo las ven las personas autorizadas (lista blanca). Para todos los demás no existen: sus fotos, perfiles y artículos no aparecen. Ni siquiera el staff las ve si no está en la lista. Cuando te dan acceso, te llega una notificación.
- Ediciones **canon**: las marca el staff y cuentan para los emblemas de veterano (ver Emblemas). Solo cuentan cuando la edición ya terminó. Cuáles son canon lo dicen los datos en vivo. Survival Comunitario no es canon porque tenía una administración externa.

## Galería de fotos

- Está en /gallery. Se puede filtrar por edición, categoría (una o varias), año, texto y tipo (imágenes o videos).
- Cada foto tiene título, descripción opcional, autor, edición, fecha, una o varias categorías, número de me gusta y número de comentarios.
- **Quién sube fotos**: los autores de confianza, los moderadores y los administradores. Se suben desde la web. También hay subida rápida desde Discord: en el canal de galería, si tu publicación tiene una imagen y eres autor de confianza, el bot reacciona con 👍; cuando tú mismo pones tu 👍, te ofrece el botón “Subir a la galería”. La imagen puede pesar hasta 8 MB. Los 👍 de otros en Discord no son me gusta de la web.
- **Categorías**: Selfie, Foto grupal, Construcción, Construcción Épica, Panorama, Divertida, Momento random, Destacada, Elección del Público, Broma, Evento, Roleplay, PVP, Nether, End, Granja, Mecanismo, Showcase, Memes, Flexing, Texturas, Logos, Recetas, Mensajes iconicos, Lost Media y Otros. “Construcción Épica” solo la pone el staff. “Elección del Público” la da el sistema.
- **Me gusta**: hace falta tener sesión. Un me gusta por foto y por persona; no puedes darle me gusta a tu propia foto. Se quita volviendo a pulsar.
- **Elección del Público**: una foto recibe esa etiqueta automáticamente al llegar a **5 me gusta**; si baja a 4, la pierde.
- Cuando una foto llega a **10 me gusta**, su autor recibe un aviso.
- **Comentarios**: cualquier miembro con sesión puede comentar, responder y darle me gusta a comentarios (no al propio). Máximo 2048 caracteres. Hay dos niveles: comentarios y respuestas. Se pueden mencionar miembros escribiendo `@` y su nombre (hasta 10 por comentario). Se permite **negrita**, *cursiva*, listas con guion y emojis. Límite: 3 comentarios por minuto. Puedes editar tu comentario (queda “editado”). Pueden borrarlo su autor, el autor de la foto y el staff. Los enlaces solo son clicables si quien comenta es autor de confianza.
- **Enlaces cortos**: una foto se abre en `/gallery/<ign del autor>/<número>`, donde el número es el de las fotos de ese autor (la primera que subió es la 1). Los números no se reutilizan ni cambian si se borra o se oculta otra foto. `/gallery/<ign>/latest` lleva a su última foto y `/gallery/<ign>/random` a una al azar suya.
- El staff puede ocultar una foto; el autor recibe un aviso. Solo el staff con permiso ve las ocultas, y el borrado definitivo es solo para quienes tengan ese permiso.
- El comando `/gallery` del bot muestra una foto al azar. También se puede pedir aquí.

## Emblemas

Un emblema es una insignia que aparece en el perfil. Hay cuatro tipos:

- **Emblema**: tiene imagen y va en la sección principal del perfil.
- **Título**: texto sin imagen, en los detalles del servidor.
- **Emblema local**: con imagen, ligado a una edición concreta.
- **De sistema**: automáticos o elegidos por el propio miembro. Nadie los asigna ni los quita a mano, ni siquiera el staff. Van siempre primero.

Los emblemas de sistema son:

- **Veterano** (se da solo, según las ediciones canon terminadas en las que participaste): **Aventurero** con 1, **Fanático** con 3, **Veterano** con 5 y **Omnipresente** con todas. Tienes solo el más alto que alcances. Se recalculan solos cuando cambian tus ediciones.
- **Reconocimiento fotográfico** (se da solo, según cuántas fotos tuyas tienen 10 o más me gusta): el primer nivel con 1 foto, el segundo con 3 y el tercero con 6. Solo tienes uno; el nivel mayor reemplaza al menor y baja si pierdes me gusta. Se llaman **Visión Amateur**, **Mirada Aclamada** y **Maestro de la Lente**, de menor a mayor.
- **Nacionalidad** (la eliges tú, una sola): Estados Unidos, México, Guatemala, El Salvador, Panamá, Colombia, Perú, Venezuela, Ecuador, Bolivia, Brasil, Chile, Argentina y España. Se muestra por defecto y puedes ocultarla cuando quieras.
- **Identidad y orientación** (la eliges tú, una sola, opcional): Transexual, Pansexual, No binario, LGBTQIA+, Lesbiana, Bisexual y Heterosexual. Está **oculta hasta que tú decidas mostrarla**. Si está oculta, nadie la ve ni puede saber quién la tiene, ni siquiera el staff ni el bot.

Otros emblemas (donador, eventos, logros, etc.) los asigna el staff. Muchos pertenecen a una edición y se entregan al terminar un proyecto o un evento. Algunos ejemplos:

- **Invasor Sin Límites**: por participar en el evento del End de varias ediciones.
- **Panitacraft II**: Cazador de Easter Eggs (niveles I, II y III), Creador de Easter Eggs, Dueño de Museo, Héroe Caído (evento del Nether), Navidad 2021, Explorador de Recuerdos y Completista de Élite.
- **Panitamon**: Maestro Pokémon, Testigo de la Leyenda y Cazador Variocolor Furtivo.
- **Panitacraft 2.75**: Lobo Alfa y Lobito, y los premios de fin de edición, entre ellos **Panita del Año 2025**, Maravilla Arquitectónica, Monumento al Absurdo, Técnico Industrial, Mercader Vende-humos, Mala Suerte en Persona, Mejor Postor y Forjador Arcano.
- **Tezzlar III**: Libertador de Tezzlar, Leyenda de Tezzlar, Renacido de Tezzlar, Completista de Élite, Akinator, el Galardón de Honor “Nicola Tezzlar” y premios como Voluntad de Bedrock, Vigía del Servidor, Adicto al Tótem, Alma Perseverante y Azote de las Sombras.
- **Otros**: Emiliano de Oro, Miembro Alfa (Tezzlar II) y Cazadragón (Panitaskyblock).
- Los **títulos** de donador de cada edición se llaman simplemente “Donador”.

- Puedes mostrar hasta **10 emblemas** en tu perfil, contando los de sistema que siempre se muestran. Eliges cuáles y en qué orden desde Ajustes, y puedes volver al orden por defecto. La tarjeta de Explorar muestra los primeros 6.
- Al conseguir un emblema te llega una notificación.

## Perfil, Explorar y Ajustes

- El perfil público (/explore o el enlace de cada jugador) muestra: ign, avatar de Discord, fecha de ingreso, rangos, emblemas, ediciones en las que participó y cuántas fotos tiene. Nunca muestra el nombre de Discord ni el id de Discord.
- **Explorar jugadores** (/explore): tarjetas con búsqueda por nombre y filtros por edición y rango. Se ordena por más nuevos, más antiguos, más fotos, más emblemas, nombre o al azar. Los miembros con cuenta activa y con ign aparecen ahí.
- **Salir de Explorar**: cualquiera puede ocultarse del listado desde Ajustes. Su perfil y sus fotos siguen siendo públicos; solo desaparece de la lista y de las sugerencias de menciones.
- **Cumpleaños** (opcional, en Ajustes): el bot felicita en el canal general a las 10:00 (UTC-6) el día del cumpleaños. El año de nacimiento no lo ve nadie, y no se muestra en el perfil ni se calcula ninguna edad. Ese día el perfil muestra una pequeña animación de cumpleaños.
- **Ajustes** reúne: contraseña, cumpleaños, nacionalidad, identidad, qué emblemas mostrar y su orden, aparecer o no en Explorar y las sesiones.

## Notificaciones

Son solo dentro de la web (la campana). No llegan por Discord ni por correo. Nunca te avisan de lo que tú mismo haces. Avisan de:

- Me gusta en tu foto (se agrupan: “A y 3 más le dieron me gusta a tu foto”), foto con 10 me gusta, foto con la etiqueta de reconocimiento, comentarios en tu foto, respuestas a tu comentario, menciones y me gusta en tus comentarios.
- Un emblema nuevo, ser parte de una edición, acceso a una edición privada, o que te asignaron un rango (si es del staff, un mensaje de bienvenida).
- Que el staff ocultó una de tus fotos.
- Que se abrió o se cerró un formulario.
- La Panita del Mes (a quien la gana y un anuncio al resto).
- Un inicio de sesión desde un dispositivo nuevo.

Las notificaciones leídas se esconden a las 24 horas y las no leídas se borran a los 90 días. La web las marca como leídas al cerrar el panel.

## Formularios

- Están en `/forms/<nombre>`. Los crea el staff (encuestas, postulaciones, inscripciones, etc.). Un formulario puede estar **abierto** o **cerrado**; solo los abiertos aceptan respuestas. Algunos exigen sesión.
- Se responde **una sola vez por persona**. Las respuestas solo las ve el staff con permiso; pueden contener datos personales.
- Tipos de pregunta: respuesta corta, respuesta larga, opción única, varias opciones, lista desplegable, escala lineal y cuadrícula de opciones. Las de opciones pueden tener “Otro”.
- Cuando se publica o se cierra un formulario, todos los miembros reciben una notificación.

## Comunidad (/community)

- Es la página de agradecimientos: muestra a los **donadores**, al **staff** y a la **Panita del Mes**.
- **Donadores**: quienes apoyan el proyecto con una donación tienen rangos de donador (Donador, Mecena y Patrocinador), reconocimiento en esta página y emblemas exclusivos. La donación es opcional y se hace por PayPal (`/donate`). Lo donado va al alojamiento y la infraestructura.
- **Panita del Mes**: un pequeño homenaje a un miembro de la comunidad.
  - Se elige al azar entre quienes tienen un rango por encima de Invitado y al menos **6 meses** desde que entraron.
  - Una persona no se repite dentro del mismo año calendario (salvo que ya no quede nadie más).
  - Se elige el primer día de cada mes y queda fija todo el mes. A todos les llega un aviso.

## Tickets (soporte)

- Los tickets se abren desde el panel del área de soporte de Discord, con el botón **Crear Ticket**. Sirven para ayuda con la web, tu cuenta, reclamar medallas o recompensas y cualquier problema.
- Hay un panel para **Sitio Web** (“si tienes preguntas o necesitas asistencia con la página web”) y hubo otro específico de Tezzlar III. Cada panel tiene su propio equipo de soporte.
- El bot crea un canal privado numerado, visible solo para ti y para el equipo de soporte de ese panel. Solo puedes tener **un ticket abierto a la vez**.
- Para salir pulsas **Cerrar** y confirmas. Pueden cerrarlo quien lo creó o el staff.
- Al cerrar, el staff tiene botones para sacar la **transcripción**, **reabrir** o **eliminar** el canal.
- Comandos del staff dentro de un ticket: `/add` y `/remove` para añadir o quitar personas, y `/close` para cerrarlo a la fuerza.
- El bot no responde preguntas con `/ask` dentro de los tickets.

## Privacidad: qué se muestra y qué no

- Nunca se muestran: contraseñas, códigos de inicio de sesión, el nombre ni el id de Discord de nadie en las tarjetas, el año de nacimiento, ni la identidad u orientación mientras esté oculta.
- Se muestran públicamente: ign, avatar, rangos, emblemas visibles, ediciones públicas, fotos y comentarios.
- Los datos de una persona (perfil, emblemas, fotos, cumpleaños) solo se dicen cuando llegan en [DATOS]; si no llegan, el bot remite a /explore o al staff. De quien oculta su perfil, el bot dice solo que sus opciones de privacidad lo ocultan. Nunca se dice ni se calcula una edad.

## Historia de las ediciones

Panitacraft nació entre amigos durante la pandemia, en 2020, y creció edición tras edición. Javithor360 es su creador y quien dirige los proyectos. Las versiones de Minecraft no están registradas en la web, salvo las que se mencionan aquí.

- **Survival Comunitario** (19 de abril al 10 de mayo de 2020): fue la chispa de todo. Tenía una administración externa, pero ahí se cruzaron por primera vez los miembros fundadores. Su base era la legendaria “Panita Island”. La administración abusaba de su poder y saboteaba la isla, así que el grupo se fue para fundar su propia administración y crear Panitacraft y sus derivados. No es canon.
- **Panitaskyblock** (1 al 12 de junio de 2020): modalidad Skyblock en un alojamiento gratuito. Es el servidor más corto de la historia, pero sirvió para quitar el mal sabor de Survival Comunitario.
- **Tezzlar I** (12 de junio al 12 de julio de 2020): dio el control administrativo a la propia comunidad. Semi-hardcore, colaborativo, con proyectos técnicos comunitarios y un evento inaugural de “God Armor”. Terminó cuando un miembro de la administración lo apagó de golpe, el mismo día en que empezaba un evento esperado.
- **Panitacraft I** (30 de julio al 20 de agosto de 2020): un refugio íntimo y de pocos jugadores en alojamiento gratuito. En el evento del End la sobrecarga corrompió el mundo y cerró de forma abrupta.
- **Tezzlar II** (28 de agosto al 2 de noviembre de 2020): una experiencia vanilla para sanar al grupo, con una duración larga que fortaleció los lazos entre los miembros originales y los nuevos.
- **Panitacraft II** (24 de octubre de 2021 al 15 de enero de 2022): volvió tras una época de silencio, con “eventos pre-apertura”. Semi-vanilla, considerada la entrega más aclamada. Destacó el Evento del Nether, con mecánicas, enemigos y armadura nuevos. Tras cerrar Tezzlar III, una “distorsión temporal” trajo este mundo de vuelta una semana en 2026, y los jugadores regresaron a sus bases de 2021.
- **Panitacraft 2.5** (9 de junio al 30 de noviembre de 2023): el reencuentro tras dos años, para explorar la actualización de verano de Minecraft. Es el servidor de mayor duración de la historia. Hubo pocos eventos del staff: los jugadores pusieron su propia creatividad.
- **AllThePanitas** (11 de diciembre de 2024 al 7 de febrero de 2025): edición breve, nacida en vísperas navideñas gracias a las donaciones de zArking__ y Shockland. Usó el modpack AllTheMods 10, que exigía mucho hardware y limitó los participantes, así que fue más íntima.
- **Panitacraft 2.75** (16 de agosto al 14 de noviembre de 2025): SMP semi-vanilla de aventura indefinida con una oleada de jugadores nuevos, eventos comunitarios, economía y un gran casino público con minijuegos. La Invasión del End puso a los Enderman al control del Overworld y el Nether; los jugadores consiguieron una armadura nueva y derrotaron al Dragón.
- **Panitamon** (24 de enero al 15 de marzo de 2026): aventura corta con el modpack Cobbleverse, un universo Pokémon con Ciudad Luminalia como punto de partida, gimnasios y ligas del Alto Mando. No necesitó eventos del staff.
- **Tezzlar III** (1 de julio al 2 de agosto de 2026): supervivencia semi-hardcore de 31 días con vidas limitadas, cambios de dificultad diarios, eventos sorpresa y misiones individuales y grupales. En el último día, los sobrevivientes se enfrentaron a Javithor360 y lo derrotaron. El detalle está en el otro archivo.
- **Enriquecraft 666** (abre el 27 de noviembre de 2026): SMP vanilla inspirado en la serie Elitecraft, sexta edición de una serie creada por el Medievo y hospedada por Panitacraft gracias a una alianza entre ambas comunidades. Con reglas, sistema de pranks y herramientas propias (Panita Client, Enriquemod, chat de voz por proximidad); todo está en la sección de Enriquecraft 666 y en el comando `/enriquecraft`.

Quién lideraba cada edición no está registrado en la web: se pregunta al staff.

## Calendario

Las fechas de las ediciones (cuándo empezó y terminó cada una, y cuál viene) salen de los datos en vivo ([DATOS]); aquí solo van los avisos que se repiten.

- **Cada día 1 de mes**: se elige la Panita del Mes y llega el aviso.
- **El día de tu cumpleaños** (si lo registraste): el bot te felicita a las 10:00 en el canal general.
- No hay un aniversario oficial registrado.

## Glosario

- **Panita**: apodo cariñoso entre los miembros; en varios países de Latinoamérica significa “amigo”. De ahí “Panitacraft”, “Panita del Mes” y “Panita del Año”.
- **Panita Island**: la isla base de Survival Comunitario, origen de la comunidad.
- **SMP** (survival multiplayer): servidor de supervivencia con varios jugadores en el mismo mundo.
- **Vanilla / semi-vanilla**: Minecraft sin mods o casi sin mods (con pocos cambios del servidor).
- **Hardcore / semi-hardcore**: modalidades con reglas duras, como vidas limitadas.
- **Skyblock**: modalidad en la que se empieza en una isla en el vacío.
- **Modpack**: paquete de mods listo para instalar (AllTheMods 10, Cobbleverse).
- **Whitelist**: lista de jugadores autorizados. Se usa en el servidor de Minecraft y en las ediciones privadas de la web.
- **Premium**: cuenta de Minecraft comprada con Microsoft. **Cracked / no premium**: cuenta sin licencia oficial.
- **Ign**: nombre del jugador en Minecraft.
- **Edición**: un proyecto o temporada. **Canon**: edición que cuenta para los emblemas de veterano.
- **Autor de confianza**: miembro autorizado a subir fotos.
- **Emblema**: insignia del perfil. **Título**: emblema de texto sin imagen.
- **Grifear** (griefing): arruinar o destruir lo de otros jugadores.
- **Easter egg**: secreto escondido en el mundo, a veces parte de un evento.
- **Ticket**: canal privado para pedir ayuda al staff.

## Preguntas frecuentes

- **¿Cómo entro a la web?** Activa tu cuenta con `/register`, ve a /login, escribe tu ign y envía el código de 4 dígitos al bot con `/confirm`.
- **No me llega el código o no puedo entrar.** Comprueba que tu cuenta esté activa con `/register`, que el código tenga menos de 3 minutos y que sea tuyo. Si sigue igual, abre un ticket en el panel de Sitio Web.
- **Olvidé mi contraseña.** No la necesitas para entrar: usa el código. Si quieres recuperarla, hazlo en Ajustes con “No recuerdo mi contraseña”.
- **¿Hay servidor de Minecraft abierto?** Ahora no hay un servidor activo; el último fue Tezzlar III y ya terminó. Si hay una edición anunciada que aún no empieza, sale en los datos en vivo.
- **¿Cómo cambio mi ign?** Si eres autor de confianza, desde la web. Si no, pídelo al staff con un ticket.
- **¿Por qué no veo una edición?** Puede ser privada: solo la ve quien tenga acceso. Pregunta al staff.
- **¿Cómo consigo emblemas?** Los de veterano se dan solos por participar en ediciones canon, los de fotos por tener fotos con 10 me gusta, y la nacionalidad y la identidad las eliges tú. El resto los da el staff al terminar proyectos o eventos.
- **No me llegó mi emblema o mi medalla.** Abre un ticket para que el staff lo revise.
- **¿Cómo subo fotos?** Necesitas ser autor de confianza; se pide al staff con un ticket. Después las subes desde la web o desde el canal de galería.
- **¿Por qué mi foto no aparece?** Puede haberla ocultado el staff (te llega una notificación) o ser de una edición privada.
- **¿Cómo quito mi perfil de Explorar?** En Ajustes, desactivando aparecer en Explorar. Tu perfil y tus fotos siguen siendo públicos.
- **¿Cómo registro mi cumpleaños?** En Ajustes. Nadie ve tu año de nacimiento.
- **¿Cómo me hago donador?** Donando por PayPal (`/donate`). Es opcional; da rango de donador, reconocimiento en /community y emblemas exclusivos.
- **¿Cómo me elige el sistema como Panita del Mes?** Es al azar entre quienes tienen rango sobre Invitado y 6 meses de antigüedad. No se puede pedir ni comprar.
- **¿Quién puede darme un rol o resolver un problema de cuenta?** Solo el staff. El bot no puede.
- **¿Cómo cierro una sesión que no reconozco?** Con `/sessions`.
- **¿Puedo tener varios tickets?** No: uno abierto a la vez por persona.
