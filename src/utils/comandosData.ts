export interface ComandoData {
  comando: string;
  descripcion: string;
}

export const comandosList: ComandoData[] = [
  {
    comando: "/punishments",
    descripcion: "Te muestra la lista de tus castigos activos."
  },
  {
    comando: "/rewards claim",
    descripcion: "Si tienes una misión completada que otorga recompensas, puedes reclamarlas una única vez."
  },
  {
    comando: "/c [jugador]",
    descripcion: "Envía las coordenadas de tu posición en el chat o a un jugador específico."
  },
  {
    comando: "/tps",
    descripcion: "Permite evaluar el rendimiento del server (ticks-por-segundo), su valor máximo es 20, lo cual indica que el server está estable. Entre más bajo es este valor, menos rendimiento habrá."
  },
  {
    comando: "/skin",
    descripcion: "Actualiza tu aspecto en el servidor a tu preferencia."
  }
];
