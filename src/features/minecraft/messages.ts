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
  playerInfoTitle: (name: string) => `Información de ${name}`,
  playerInfoUnknown: (name: string) => `El servidor no conoce a un jugador llamado **${name}**.`,
  playerInfoInvalid: 'Ese no es un nombre de Minecraft válido (3-16 caracteres: letras, números y `_`).',
  playtime: 'Tiempo jugado',
  playtimeNone: 'Sin registro',
  statusLabel: 'Status',
  online: 'Online',
  offline: 'Offline',
  tpsTitle: '📈 Rendimiento del servidor',
  tpsField: 'TPS',
  msptField: 'Tiempo por tick',
} as const;
