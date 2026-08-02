export interface MiniEventData {
  id: string;
  name: string;
  duration: string;
  description: string;
  effects: string[];
  color: number;
}

export const minieventsData: Record<string, MiniEventData> = {
  uhc_mode: {
    id: 'uhc_mode',
    name: 'Modo UHC',
    duration: '2 horas',
    description: 'El modo Ultra Hardcore se apodera del servidor. Es recomendable andar con extremo cuidado.',
    effects: [
      'No se podrá regenerar vida de forma natural.',
      'Para curarte debes utilizar exclusivamente pociones o manzanas.'
    ],
    color: 0xF0162E // Red
  },
  random_potion: {
    id: 'random_potion',
    name: 'Poción Sorpresa',
    duration: '10 minutos',
    description: 'La magia fluye de forma incontrolable afectando a todos por igual.',
    effects: [
      'Todos los jugadores reciben un efecto de poción al azar.'
    ],
    color: 0x9F5EFF // Purple
  },
  position_swap: {
    id: 'position_swap',
    name: 'Intercambio de Posiciones',
    duration: 'Instantáneo',
    description: 'El espacio-tiempo se ha fracturado por un breve instante.',
    effects: [
      'Las posiciones de todos los jugadores conectados han sido revueltas y reasignadas al azar.'
    ],
    color: 0x00FFFF // Aqua
  },
  special_drop_mob: {
    id: 'special_drop_mob',
    name: 'Fiebre de ítems',
    duration: '30 minutos',
    description: 'Una oportunidad única para farmear objetos valiosos. ¡El encantamiento de Looting incrementa las probabilidades!',
    effects: [
      'Aparición de un drop único al eliminar ciertas entidades.'
    ],
    color: 0x5E62F2 // Blue-ish purple
  },
  blood_moon: {
    id: 'blood_moon',
    name: 'Luna de Sangre',
    duration: '2 horas',
    description: 'La luna se tiñe de carmesí y los monstruos se vuelven letales. No se recomienda permanecer en solitario.',
    effects: [
      'Los mobs hostiles portarán cabezas de calabaza.',
      'Tienen la salud máxima aumentada al triple.',
      'Tienen el daño de ataque aumentado al triple.',
      'Cuentan con efectos de poción orientados al combate.'
    ],
    color: 0x821008 // Dark Red
  },
  acid_rain_global: {
    id: 'acid_rain_global',
    name: 'Lluvia Ácida XL',
    duration: '2 horas',
    description: 'Un fenómeno climatológico altamente peligroso invade el terreno del Overworld. Evita el cielo abierto.',
    effects: [
      'Permanecer bajo la lluvia te restará salud periódicamente.'
    ],
    color: 0x81C784 // Green
  },
  wrong_tool_damage: {
    id: 'wrong_tool_damage',
    name: 'Maldición del Obrero',
    duration: '4 horas',
    description: 'El trabajo duro ahora requiere precisión absoluta. Fíjate bien antes de romper cualquier bloque.',
    effects: [
      'Romper bloques con la herramienta equivocada provocará daño severo al jugador.'
    ],
    color: 0x16A0F0 // Blue
  },
  rush_mode: {
    id: 'rush_mode',
    name: 'Modo Rush',
    duration: '1 a 2 horas',
    description: 'El ritmo del juego se acelera, otorgando ventajas masivas para progresar rápido. El efecto varía según la instancia del evento.',
    effects: [
      'Variante 1: Los jugadores reciben el efecto de Doble Vida durante 2 horas.',
      'Variante 2: Los jugadores reciben el efecto de Sin Hambre durante 1 hora.',
      'Variante 3: Los jugadores reciben el efecto de Velocidad III durante 2 horas.'
    ],
    color: 0xFFC019 // Yellow/Orange
  },
  no_offhand: {
    id: 'no_offhand',
    name: 'Sin Mano Secundaria',
    duration: '1 hora',
    description: 'Una extraña parálisis afecta la coordinación de todos los jugadores.',
    effects: [
      'No se podrá utilizar la mano secundaria.',
      'Los ítems que estuvieran ahí serán devueltos a tu inventario principal.'
    ],
    color: 0xFF5555 // Light Red
  },
  mermaid_mode: {
    id: 'mermaid_mode',
    name: 'Modo Sirena',
    duration: '2 horas',
    description: 'Tus pulmones han mutado repentinamente; el aire puro de la superficie ahora es letal.',
    effects: [
      'Solo podrás respirar estando bajo el agua.',
      'Si sales a la superficie o te quedas en tierra firme, comenzarás a ahogarte.'
    ],
    color: 0x00BFFF
  },
  resize_mode: {
    id: 'resize_mode',
    name: 'Cambio de Tamaño',
    duration: '2 horas',
    description: 'La realidad se distorsiona alterando permanentemente la complexión física de los supervivientes.',
    effects: [
      'Cada jugador adquirirá un tamaño aleatorio de entre 0.75x y 1.25x.'
    ],
    color: 0xFF69B4
  },
  nyctophobia: {
    id: 'nyctophobia',
    name: 'Nictofobia',
    duration: '4 horas',
    description: 'La oscuridad alberga terrores indescriptibles que carcomen tu cordura rápidamente.',
    effects: [
      'Permanecer en completa oscuridad (nivel de luz 0) te causará efectos negativos aleatorios periódicamente.'
    ],
    color: 0x4B0082
  },
  extreme_mode: {
    id: 'extreme_mode',
    name: 'Modo Extremo',
    duration: '1 hora',
    description: 'Un estado de fragilidad absoluta se apodera de todos. Un simple roce podría ser tu final.',
    effects: [
      'Todos los jugadores son reducidos inmediatamente a 1 solo corazón de vida máxima.',
      'Irás recuperando 1 corazón de vida máxima por cada minuto transcurrido.'
    ],
    color: 0x8B0000
  },
  hyperactivity: {
    id: 'hyperactivity',
    name: 'Hiperactividad',
    duration: '10 minutos',
    description: 'Tus niveles de adrenalina han colapsado; detenerte ya no es una opción.',
    effects: [
      'Si te quedas completamente quieto por 30 segundos seguidos, morirás de forma fulminante.'
    ],
    color: 0xFF4500
  },
  job_fair: {
    id: 'job_fair',
    name: 'Feria de Empleo',
    duration: '60 minutos',
    description: 'Incluso los monstruos despiadados andan buscando oportunidades laborales.',
    effects: [
      'Los monstruos tienen una probabilidad de soltar su "Currículum Vitae" al morir.',
      '¡Al recogerlo ocurrirán cosas aleatorias e impredecibles!'
    ],
    color: 0xA651A3
  },
  opposite_hour: {
    id: 'opposite_hour',
    name: 'La Hora Opuesta',
    duration: '4 horas',
    description: 'La lógica alquímica del mundo ha sido invertida temporalmente. ¡Cuidado con lo que bebes!',
    effects: [
      'Varios efectos de pociones ahora aplicarán su contraparte opuesta en lugar del efecto original esperado.'
    ],
    color: 0x8A2BE2
  },
  russian_roulette: {
    id: 'russian_roulette',
    name: 'Ruleta Rusa',
    duration: '60 minutos',
    description: 'Un mercader siniestro ha aparecido en el Refugio para tentar tu suerte con un trato de vida o muerte.',
    effects: [
      'Puedes visitarlo para jugar a la Ruleta Rusa.',
      'Riesgo extremo: 70% de probabilidad de ganar una vida y 30% de perderla instantáneamente.',
      'Solo se permite participar una única vez por evento.',
      'Se anunciarán las coordenadas (X Y Z) de su ubicación temporal al iniciar el evento.'
    ],
    color: 0xFF0000
  }
};
