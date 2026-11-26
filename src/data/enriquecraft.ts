/**
 * What `/enriquecraft` says about the server. Plain text with Discord markdown: the look (quotes, arrows, uppercase titles)
 * is added by the views in `features/enriquecraft/`, so a rule or a feature is changed here as text only.
 */
import { LIVE_SERVER_CHANNEL_ID, SERVER, URLS } from '../config/constants';

// ── Information ──────────────────────────────────────────────────────────────────────────────────────────────────

export const info = {
  about:
    'Es un SMP *(survival multiplayer)* vanilla, inspirado en la serie **Elitecraft**. Creado originalmente por el Medievo, con cinco ediciones anteriores. '
    + 'Tras muchos años de espera y por medio de una alianza, se ha encomendado a Panitacraft el deber de hospedar una sexta edición, fusionando ambas comunidades y abierto a todo el público.',
  goal:
    'El propósito es traer un servidor de duración prolongada, orientado a una dinámica de juego libre dentro de la norma del modo supervivencia y fomentando la interacción entre usuarios, '
    + 'las construcciones, el roleplay y las pranks. El **principal objetivo** es aumentar el factor social y juntar a las comunidades del Medievo y Panitacraft en un espacio común '
    + 'donde cada uno pueda conocerse y formar una sola comunidad.',
  technology:
    'En esta nueva edición, con la presencia de las tecnologías de Panitacraft, se sugiere el uso del software **Medal** para grabar clips y poder compartirlos en la galería web. '
    + 'Por otra parte, el acceso al servidor es permitido desde el cliente de Minecraft Vanilla; sin embargo, si se desea una experiencia de juego personalizada y mejorada, '
    + 'se recomienda el uso del **Panita Client** para descargar la instancia oficial que contiene el modpack oficial que incluye Voice Chat, Texture Pack Oficial, **Enriquemod**, entre otros.',
} as const;

// ── Rules ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Rule {
  /** What `regla` is set to, and what `!ec rules <id>` accepts. */
  id: string;
  /** The name in the list of choices of the command. */
  label: string;
  title: string;
  text: string;
}

export const rulesIntro =
  'El único requisito para entrar al servidor es cumplir las normas. Cuando los jugadores hacen uso del ecosistema deben aceptar tanto los '
  + `[Términos de Uso](${URLS.termsOfUse}) como la [Política de Privacidad](${URLS.privacyPolicy}). `
  + 'Y, con el fin de mantener una armonía y sana convivencia, también se establece el siguiente reglamento.';

export const rules: readonly Rule[] = [
  {
    id: 'comun',
    label: 'Sentido común',
    title: 'Usa el sentido común (sí, de nuevo)',
    text: 'Está prohibido aprovecharse de vacíos legales. Si algo no figura en las normas, evalúa si realmente es correcto antes de actuar y aplica siempre el buen juicio.',
  },
  {
    id: 'respeto',
    label: 'Respeto',
    title: 'Sé respetuoso',
    text:
      'Tienes que saber con quiénes puedes bromear y con quiénes no. No hagas spam en el chat ni bromas fuera de lugar con personas ajenas a tu grupo de confianza. '
      + 'Si alguien te reporta por comportamiento inadecuado, se tomarán acciones en el caso.',
  },
  {
    id: 'limpio',
    label: 'Juego limpio',
    title: 'Juega limpio',
    text:
      'Evita el uso de clientes no autorizados. El uso de hacks no está permitido, tampoco se permiten texture packs o mods que otorguen ventajas como X-ray. '
      + 'En cambio, mods como Litematica o herramientas de calidad de vida sí están permitidos. Y cabe aclarar que el único mod de minimapa permitido es **Xaero\'s Minimap & Xaero\'s Worldmap**.',
  },
  {
    id: 'robar',
    label: 'No robar',
    title: 'No robar',
    text: 'Prohibido robar, incluso con nivel máximo. Solo se permiten bromas inofensivas y sin pérdidas.',
  },
  {
    id: 'pranks',
    label: 'Niveles de pranks',
    title: 'Obedece los niveles de pranks',
    text:
      'Consulta el perfil de cada usuario antes de actuar: la intensidad de la prank siempre la marca el nivel más bajo entre tú y tu objetivo, sin importar quién la inicie. '
      + 'Además, evita matar a otro jugador a menos que tenga el indicador Extremo activado.',
  },
  {
    id: 'limites',
    label: 'Límites de construcción',
    title: 'Construye dentro de los límites permitidos',
    text:
      'La zona del Spawn está reservada para el desarrollo de proyectos comunitarios. Las bases privadas se ubicarán a partir de las coordenadas 500 y sin salir de las 5000 en cualquier eje. '
      + 'Además, las facciones deben estar conformadas por un máximo de **seis** jugadores.',
  },
];

// ── Pranks ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const pranksIntro =
  'Se trata de un sistema regulador diseñado para que cada jugador elija el ritmo con el que desea jugar. El objetivo es fomentar las bromas y generar piques sanos entre los participantes, '
  + 'estableciendo límites claros para cada perfil. Por ende, el nivel asignado define tanto la magnitud de las bromas que un jugador puede recibir como las que puede realizar.';

export const pranksPrinciple = 'La intensidad de la prank siempre la marca el nivel más bajo entre los jugadores involucrados.';

export const pranksStart =
  'Al ingresar al servidor por primera vez, se asignará automáticamente el nivel **Mimo**, el cual otorga inmunidad total frente a cualquier broma durante la etapa de adaptación. '
  + 'Para modificarlo utiliza el comando `/prank set <level>`; este se reflejará tanto en el perfil de jugador como en los mensajes del chat.';

export interface PrankLevel {
  /** What `nivel` is set to, and what `!ec pranks <id>` accepts. */
  id: string;
  label: string;
  /** Shown as `MIMO (NIVEL CERO)`. */
  title: string;
  text: string;
  /** What is allowed; `null` for a level that allows nothing. */
  allowed: string | null;
}

export const prankLevels: readonly PrankLevel[] = [
  {
    id: 'mimo',
    label: 'Mimo (nivel cero)',
    title: 'Mimo (Nivel Cero)',
    text:
      'El nivel de partida, que se asigna automáticamente al entrar. No permite ningún tipo de broma, ni recibirlas ni hacerlas, y no puede tener el indicador Extremo. '
      + 'Otorga inmunidad total durante la etapa de adaptación.',
    allowed: null,
  },
  {
    id: 'bufon',
    label: 'Bufón (nivel básico)',
    title: 'Bufón (Nivel Básico)',
    text:
      'Enfocado en una experiencia libre de caos para quienes priorizan avanzar en sus proyectos sin contratiempos. '
      + 'Permite bromas inofensivas siempre que **no** dañen el entorno ni ralenticen el progreso del jugador.',
    allowed: 'Regalos sorpresa, llenar una base de animales pacíficos, construcciones humorísticas temporales o carteles.',
  },
  {
    id: 'payaso',
    label: 'Payaso (nivel medio)',
    title: 'Payaso (Nivel Medio)',
    text: 'Dirigido a jugadores que toleran interrupciones ligeras cuya recuperación no requiera demasiado tiempo ni recursos.',
    allowed: 'Desordenar cofres o estructuras, alterar la estética de una base de forma leve y reversible, o secuestrar mascotas (siempre sin matarlas).',
  },
  {
    id: 'arlequin',
    label: 'Arlequín (nivel elevado)',
    title: 'Arlequín (Nivel Elevado)',
    text: 'Diseñado para quienes aceptan el caos total y permiten intervenciones severas en sus propiedades sin restricciones de daño estructural.',
    allowed: 'Trampas de alto riesgo, alteraciones masivas del terreno o construcciones, explosiones controladas y traslado de mobs hostiles (como Wardens) hacia la base.',
  },
];

export interface PrankClarification {
  /** What `nivel` is set to for the one that has a choice of its own. */
  id?: string;
  title: string;
  text: string;
}

export const prankClarifications: readonly PrankClarification[] = [
  {
    id: 'extremo',
    title: 'Indicador Extremo',
    text:
      'Mostrar este distintivo indica que el jugador autoriza el PvP y las bromas letales en su contra. '
      + 'Si el objetivo **no** posee este indicador, cualquier acción que implique matarlo queda estrictamente prohibida.',
  },
  {
    title: 'Contexto obligatorio',
    text:
      'Las bromas no deben ejecutarse de forma gratuita ni contra desconocidos por el simple hecho de compartir un nivel alto. '
      + 'Debe existir un mínimo de interacción previa, contexto o complicidad para garantizar que la dinámica sea entretenida y no arruine la experiencia de juego.',
  },
  {
    title: 'Bases compartidas',
    text:
      'Si varios jugadores habitan una misma base o pertenecen a un mismo equipo, el integrante con el **nivel más alto** será quien determine el nivel de vulnerabilidad de toda la propiedad compartida. '
      + 'Se recomienda coordinar los niveles entre compañeros.',
  },
];

// ── Features ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const featuresIntro =
  'Como ya es costumbre, el servidor cuenta con algunas facilidades para mejorar la experiencia de juego haciendo uso de las tecnologías desarrolladas por Panitacraft o herramientas de terceros.';

export interface Feature {
  /** What `caracteristica` is set to, and what `!ec features <id>` accepts. */
  id: string;
  label: string;
  title: string;
  /** The line it has in the list of features. */
  summary: string;
  text: string;
  /** A picture of `assets/enriquecraft/` that goes with it. */
  image?: 'perfil.png' | 'login.gif' | 'interchat.png';
}

export interface UtilityCommand {
  command: string;
  description: string;
}

/** The commands of the game that the base game does not have. `enriquecraft commands` and its feature show the same list. */
export const utilityCommands: readonly UtilityCommand[] = [
  { command: '/c [jugador]', description: 'Comparte tu ubicación (coordenadas) con todos los jugadores. Si indicas un jugador, se las envía solo a esa persona.' },
  { command: '/skin set <name>', description: 'Actualiza tu aspecto en el servidor a tu preferencia.' },
  {
    command: '/tps',
    description: 'Permite evaluar el rendimiento del servidor (ticks por segundo). Su valor máximo es 20, lo cual indica que el servidor está estable: entre más bajo es este valor, menos rendimiento habrá.',
  },
  { command: '/prank set <level>', description: 'Cambia tu nivel de prank. Se refleja en tu perfil de jugador y en los mensajes del chat.' },
];

export const features: readonly Feature[] = [
  {
    id: 'cuenta',
    label: 'Cuenta de Panitacraft y whitelist',
    title: 'Cuenta de Panitacraft & Whitelist',
    summary: 'Vincula Discord y Minecraft: whitelist y cuenta de Panitacraft.',
    text:
      `Gracias a [nuestro sitio web oficial](${URLS.web}), podemos hacer una vinculación directa entre Discord y Minecraft que **permite registrar tu nombre de usuario directamente a la whitelist del servidor `
      + 'y activar una cuenta de Panitacraft** para empezar a interactuar con la comunidad, coleccionar emblemas y publicar contenido en la galería de recuerdos.',
    image: 'perfil.png',
  },
  {
    id: 'client',
    label: 'Panita Client',
    title: 'Panita Client',
    summary: 'El launcher oficial, con el modpack y actualización automática.',
    text:
      'Nuestra más reciente integración al ecosistema, un launcher hecho a la medida que permite descargar el modpack complementario oficial del servidor de manera más cómoda y con actualización automática. '
      + 'Para acceder a éste, necesitas iniciar sesión con tu cuenta de Panitacraft y posteriormente agregar tu cuenta de Minecraft, ya sea Premium o No-Premium. '
      + `Esta aplicación es compatible en sistemas Windows y Linux.\n\n[Descargar Panita Client](${URLS.launcherDownload})`,
  },
  {
    id: 'enriquemod',
    label: 'Enriquemod',
    title: 'Enriquemod',
    summary: 'El mod oficial del servidor, opcional, con interfaces propias.',
    text:
      'Se trata del mod oficial para el servidor, de uso opcional, que permite servir una experiencia personalizada a la temática del servidor e integrar ciertas partes del ecosistema de Panitacraft dentro de la partida. '
      + 'Su mayor fuerte es la presentación de interfaces gráficas de usuario con estilo propio.',
  },
  {
    id: 'login',
    label: 'Inicio de sesión',
    title: 'Inicio de sesión',
    summary: 'Automático con cuenta premium, o con PIN si no lo es.',
    text:
      'En el servidor se manejan dos sistemas de inicio de sesión: el primero detecta si la cuenta es premium y, en caso de serlo, iniciarás sesión automáticamente; '
      + 'en caso contrario, tendrás que iniciar sesión con PIN en una interfaz de paneles.',
    image: 'login.gif',
  },
  {
    id: 'chat',
    label: 'Chat Discord ⇄ Minecraft',
    title: 'Chat Discord ⇄ Minecraft',
    summary: 'El chat de Minecraft y el de Discord conectados, con avisos y capturas.',
    text:
      `Como ya es costumbre, contamos con el canal <#${LIVE_SERVER_CHANNEL_ID}> para poder ver los mensajes del chat de Minecraft en Discord y viceversa. `
      + 'Y no solo eso: en esta ocasión hemos realizado varias mejoras a este sistema, ya que hemos implementado novedades como el envío de notificaciones cuando un jugador comparte coordenadas, '
      + 'cambia su estado AFK o actualiza su nivel de Prank.\n\n'
      + 'Y la mejor parte es la integración del soporte para lectura de imágenes enviadas desde Discord dentro del juego; asimismo, la opción de compartir capturas de pantalla tomadas en el juego enviadas directamente a Discord.',
    image: 'interchat.png',
  },
  {
    id: 'voz',
    label: 'Voicechat in-game',
    title: 'Voicechat In-game',
    summary: 'Chat de voz por proximidad dentro del juego.',
    text:
      'Como parte de nuestro objetivo de fomentar la socialización, este servidor **sí** cuenta con chat de voz por proximidad integrado para quienes utilicen el modpack, '
      + 'lo que permite a los jugadores comunicarse por voz a través del juego.',
  },
  {
    id: 'comandos',
    label: 'Comandos de utilidad',
    title: 'Comandos de utilidad',
    summary: 'Comandos útiles que no trae el juego original.',
    text:
      'Existen una variedad de comandos que no están en la versión original del juego, pero serán de gran ayuda.\n\n'
      + utilityCommands.map(({ command, description }) => `**➔ \`${command}\`**\n${description}`).join('\n\n'),
  },
  {
    id: 'apoyo',
    label: 'Apoyo al servidor',
    title: 'Apoyo al servidor',
    summary: 'Cómo ayudar al servidor y qué recibes a cambio.',
    text:
      'El mejor apoyo que podemos recibir es que todos disfruten de lo que tenemos preparado con mucho cariño para ustedes. Nuestra comunidad es quien nos motiva a seguir trabajando en proyectos como este.\n\n'
      + `Adicionalmente, a quienes quieran aportar un poco más, pueden hacerlo voluntariamente por medio de un aporte económico. Para más información, ejecuta \`!donar\` en cualquier canal, o puedes acceder por medio de este link: ${URLS.paypal}\n\n`
      + 'Algunos de los beneficios, en forma de agradecimiento, por las donaciones incluyen el acceso a rangos y emblemas exclusivos, y demás elementos cosméticos. También incluyen un reconocimiento especial en el sitio web.',
  },
];

// ── Joining ──────────────────────────────────────────────────────────────────────────────────────────────────────

export const join = {
  ip: SERVER.domain,
  version: SERVER.version,
  steps: [
    `**Lee el reglamento** con \`!enriquecraft rules\` y acepta los [Términos de Uso](${URLS.termsOfUse}) y la [Política de Privacidad](${URLS.privacyPolicy}).`,
    '**Activa tu cuenta** con `!activar`: elige si tu cuenta de Minecraft es premium o no e ingresa tu nombre de usuario (IGN) en el formulario privado. Así quedas en la **whitelist** del servidor.',
    `**Entra al servidor** desde Minecraft ${SERVER.version} con la IP \`${SERVER.domain}\`.`,
    `**Recomendado:** descarga [Panita Client](${URLS.launcherDownload}) para tener el modpack oficial (voice chat, texture pack y Enriquemod) siempre actualizado.`,
  ],
} as const;

// ── Only for what `/ask` knows ───────────────────────────────────────────────────────────────────────────────────

/** When the server opens. `/ask` compares it with today's date to say whether it is already open. */
export const opens = { name: 'Enriquecraft 666', date: '2026-11-27', text: '27 de noviembre de 2026' } as const;

/**
 * What is known about Panita Client beyond its feature text. Every line comes from the document of the server or from the
 * activation flow of the bot, so the assistant can answer the questions about it without guessing.
 */
export const panitaClientFacts: readonly string[] = [
  'Panita Client es el launcher oficial de Panitacraft: descarga e instala el modpack complementario del servidor y lo mantiene actualizado de forma automática.',
  `Se descarga en ${URLS.launcherDownload}`,
  'Es compatible con Windows y Linux.',
  'Para usarlo hay que iniciar sesión con la cuenta de Panitacraft (se activa con `!activar`, que es lo mismo que `/register`) y después agregar la cuenta de Minecraft, ya sea premium o no premium. El inicio de sesión se confirma con un código desde Discord.',
  'El modpack oficial incluye el chat de voz por proximidad (Voice Chat), el Texture Pack oficial y Enriquemod, entre otros.',
  'Es recomendado pero no obligatorio: también se puede entrar al servidor con el cliente de Minecraft Vanilla; Panita Client es para quien quiere una experiencia personalizada y mejorada.',
  'Si hay problemas con la instalación o con la cuenta, se abre un ticket y el staff ayuda.',
];
