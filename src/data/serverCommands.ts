export interface ServerCommand {
  command: string;
  description: string;
}

export const serverCommands: ServerCommand[] = [
  {
    command: "/punishments",
    description: "Te muestra la lista de tus castigos activos."
  },
  {
    command: "/rewards claim",
    description: "Si tienes una misión completada que otorga recompensas, puedes reclamarlas una única vez."
  },
  {
    command: "/c [jugador]",
    description: "Envía las coordenadas de tu posición en el chat o a un jugador específico."
  },
  {
    command: "/tps",
    description: "Permite evaluar el rendimiento del server (ticks-por-segundo), su valor máximo es 20, lo cual indica que el server está estable. Entre más bajo es este valor, menos rendimiento habrá."
  },
  {
    command: "/skin",
    description: "Actualiza tu aspecto en el servidor a tu preferencia."
  }
];
