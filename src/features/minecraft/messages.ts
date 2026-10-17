/**
 * The texts of the commands of the Minecraft bridge. Spanish, like everything the bot says. What the bot posts about the
 * server (joins, deaths, the topic) is in `config/minecraft-messages.yml`.
 */
export const MC_TEXT = {
  bridgeOff: 'El puente con el servidor de Minecraft está apagado.',
  notConnected: 'El servidor de Minecraft no está conectado en este momento.',
  noAnswer: 'El servidor de Minecraft no respondió a tiempo.',

  playersTitle: (online: number, max: number) => `👥 Jugadores en línea (${online}/${max})`,
  playersNone: 'No hay jugadores conectados.',
  tpsTitle: '📈 Rendimiento del servidor',
  tpsField: 'TPS',
  msptField: 'Tiempo por tick',

  topicDown: '🔴 Servidor sin conexión',
} as const;
