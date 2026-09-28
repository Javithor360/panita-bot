export interface VanillaFood {
  name: string;
  hunger: number;
  saturation: number;
  /** Extra effect when eaten, e.g. `Velocidad II x 1m`. */
  effect?: string;
}

export interface CustomFood {
  name: string;
  details: string[];
}

/** Vanilla foods rebalanced in Tezzlar III. */
export const vanillaFoods: VanillaFood[] = [
  { name: "Estofado de Conejo", hunger: 12, saturation: 25, effect: "Resistencia II x 1m" },
  { name: "Sopa de Remolacha", hunger: 12, saturation: 16 },
  { name: "Pastel (Por porción)", hunger: 10, saturation: 10 },
  { name: "Pastel de Calabaza", hunger: 10, saturation: 14.5, effect: "Resistencia al Fuego x 1m" },
  { name: "Patata Asada", hunger: 7, saturation: 9 },
  { name: "Pan", hunger: 7, saturation: 12 },
  { name: "Galleta", hunger: 7, saturation: 9, effect: "Velocidad II x 1m" },
  { name: "Bayas Brillantes", hunger: 7, saturation: 9, effect: "Glowing Verde x 1m" },
  { name: "Bayas Dulces", hunger: 7, saturation: 9, effect: "Salud Instantánea I" },
  { name: "Zanahoria", hunger: 6, saturation: 12 },
  { name: "Remolacha", hunger: 5, saturation: 7 },
  { name: "Algas Secas", hunger: 4, saturation: 4, effect: "Resistencia al Fuego x 30s" },
];

/** New custom foods introduced in Tezzlar III. */
export const customFoods: CustomFood[] = [
  {
    name: "Remolacha Dorada",
    details: [
      "Restaura toda la barra (20 🍗 | 20 Sat.)",
      "*Efectos:* Resistencia IV, Regeneración II, Velocidad II y Absorción IV (por 2m).",
    ],
  },
  {
    name: "Manzana de Manzanium",
    details: [
      "Restaura toda la barra (20 🍗 | 20 Sat.)",
    ],
  },
  {
    name: "Manzana de Cobre",
    details: [
      "Restaura toda la barra (20 🍗 | 20 Sat.)",
      "*Efectos:* Vida Extra III (por 5m).",
    ],
  },
  {
    name: "Zanahoria de Cobre",
    details: [
      "*Efectos:* Visión Nocturna (por 1m).",
    ],
  },
];
