/**
 * The texts of the Minecraft bridge. Spanish, like everything the bot says.
 */
export const MC_TEXT = {
  join: (name: string) => `**${name}** se unió al servidor`,
  firstJoin: (name: string) => `¡**${name}** se unió al servidor por primera vez!`,
  leave: (name: string) => `**${name}** salió del servidor`,
  death: (text: string) => `💀 ${text}`,
  advancement: (text: string) => `🏆 ${text}`,
  broadcast: (text: string) => `📢 ${text}`,
  started: '🟢 El servidor está en línea',
  stopping: '🔴 El servidor se está apagando',

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
