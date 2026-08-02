export interface RecipeData {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  color: number;
}

export const recipesData: Record<string, RecipeData> = {
  copper_carrot: {
    id: 'copper_carrot',
    title: 'Zanahoria de Cobre',
    description: '>>> Un alimento modificado mediante la metalurgia para otorgar ventajas visuales nocturnas.\n\n**Efectos:**\n⠀\\- Otorga Visión Nocturna por 1 minuto al ser consumida.\n⠀\\- Restaura algo de hambre y saturación.',
    imageUrl: 'https://media.discordapp.net/attachments/1408520442960023592/1522303093767933993/image.png?ex=6a6f87bc&is=6a6e363c&hm=8dd3376f8203392251c6d3a54b684825b9cac511f6fb86be8e302e079d55dace&=&format=webp&quality=lossless',
    color: 0xd35400
  },
  totems: {
    id: 'totems',
    title: 'Tótems de Mobs',
    description: '>>> Tótems especiales con temática de mobs. Tienen distintos efectos pasivos al ponerlos en tu mano secundaria:\n\n**◈ Ajolote:** Regeneración\n**◈ Pez:** Gracia Delfín (Dolphin\'s Grace)\n**◈ Sulfuro:** Visión Nocturna\n**◈ Renacuajo:** Impulso de Salto (Jump Boost)\n**◈ Happy Ghast:** Fuerza\n**◈ Gólem de Cobre:** Resistencia\n**◈ Abeja:** Tus ataques inyectan Veneno a los objetivos\n**◈ Gallina:** Velocidad\n**◈ Sniffer:** Prisa (Haste)\n**◈ Tortuga:** Debilidad',
    imageUrl: 'https://media.discordapp.net/attachments/1408520442960023592/1523772114715410472/image.png?ex=6a6f99de&is=6a6e485e&hm=9745ba02e64186045aef0abafb009fc021402647bdea53fd973cbcaab4f4d293&=&format=webp&quality=lossless',
    color: 0x2ecc71
  },
  rebalance: {
    id: 'rebalance',
    title: 'Crafteos Rebalanceados',
    description: '>>> Los crafteos de ciertos ítems fundamentales se han vuelto más complicados para adaptarse a la dificultad:\n\n**◈ Manzanas de oro:** Requieren bloques de oro y bloques de oro crudo.\n**◈ Faro (Beacon):** Requiere bloques de diamante.\n**◈ Netherite Upgrade:** Requieren bloques de diamante al duplicar.\n**◈ Zanahoria Dorada:** Requiere lingotes de oro.\n**◈ Sopa de Hongos:** Requiere un bloque de hongos.\n**◈ Maza (Mace):** Requiere bloque de netherite.\n**◈ Estofado de Conejo:** Requiere un bloque de sandía.\n**◈ Canalizador (Conduit):** Requiere oro.\n**◈ Madera:** Todos los crafteos que dan tablones de madera ahora dan menos madera.',
    imageUrl: 'https://media.discordapp.net/attachments/1408520442960023592/1524141805376110662/image.png?ex=6a6fa0ab&is=6a6e4f2b&hm=ec4e0a75bc3a25f5246e739b417262b719355da810d5a5f856513b539e82bbc5&=&format=webp&quality=lossless',
    color: 0xc0392b
  },
  midgame_items: {
    id: 'midgame_items',
    title: 'Ítems Especiales (Midgame)',
    description: '>>> Se han agregado nuevas recetas especiales para herramientas e ítems de utilidad:\n\n**🍎 Manzana de Manzanium**\nProporciona mucha más saturación que una manzana normal. Crafteada con 8 manzanas normales.\n\n**🗡️ Lanzas Cargadas**\nMejora la movilidad del usuario para proporcionar más daño. Crafteada con lanza de netherite y Eco Shard.\n\n**📯 Cuernos Mejorados**\nCuerno de cabra mejorado con amatista para aumentar el radio de su efecto aturdidor y su eficacia contra phantoms.\n\n**🎒 Bundle Infinito**\nCapacidad de cargar una cantidad infinita de objetos, aunque funcionará como un basurero (los objetos se pierden). Crafteado con un bundle, obsidiana y un ojo de ender.',
    imageUrl: 'https://media.discordapp.net/attachments/1408520442960023592/1524843724868419676/imagen.png?ex=6a6f8b62&is=6a6e39e2&hm=ef6347a4503a61e06c84d3ee77d73e0a0390ba826dbb9597b1f0118efdaab836&=&format=webp&quality=lossless',
    color: 0x3498db
  },
  superdiamond_armor: {
    id: 'superdiamond_armor',
    title: 'Armadura de Superdiamante',
    description: '>>> Información y receta de crafteo de la legendaria armadura de Superdiamante, el nuevo nivel de protección absoluto en el mundo de Tezzlar.',
    imageUrl: 'https://media.discordapp.net/attachments/1408520442960023592/1528469035589570590/image.png?ex=6a6f8cb7&is=6a6e3b37&hm=22da09572ed698417e4f38bc64ba6b6d77ccaf1e3e7ec437da48a48734504489&=&format=webp&quality=lossless',
    color: 0x00ffff
  },
  endgame_items: {
    id: 'endgame_items',
    title: 'Ítems Legendarios (Endgame)',
    description: '>>> Crafteos de los ítems más poderosos y raros del servidor:\n\n**◈ Botellas de EXP:** Usa 4 de un nivel para craftear el siguiente nivel.\n**◈ Remolacha Dorada:** Da mucha regeneración al comerla.\n**◈ Manzana de Cobre:** Da mediana regeneración al comerla.\n**◈ Antídoto:** Da inmunidad temporal a la contaminación ambiental.\n**◈ Incienso:** Elimina 12 horas de duración al Death Train.\n**◈ Evocarrecuerdos:** Desbanea a un usuario muerto.\n**◈ Lingote Puro & Lingote Superdiamante:** Ingredientes para crafteos.\n**◈ Reliquia de las Almas:** Mantiene tu inventario al morir.\n**◈ Corazón / Descorazón Tezzlar:** Añaden o restan un corazón máximo.\n**◈ 1UP:** Suma una vida extra al contador.\n**◈ Sombrilla:** Protege de los efectos de la lluvia (Death Train/Ácida).\n**◈ Botas de Pluma:** Inmunidad a caídas a cambio de debilidad física.\n**◈ Corazón del Mar:** Nueva receta para hacerlo accesible.\n**◈ Catalizador Raro:** Ingrediente mágico avanzado.',
    imageUrl: 'https://media.discordapp.net/attachments/1408520442960023592/1529195910846873741/image.png?ex=6a6f8eac&is=6a6e3d2c&hm=05e892d2c308f91bc576ca30087fe2793a15ef6fe43dc1a3c2ee87d042bbfe6d&=&format=webp&quality=lossless',
    color: 0xf1c40f
  },
  superdiamond_lvl2: {
    id: 'superdiamond_lvl2',
    title: 'Superdiamante Nivel 2',
    description: '>>> La cúspide de la herrería. Mejoras de Nivel 2 para la armadura y equipamiento de Superdiamante, proporcionando resistencia y poder inigualable.',
    imageUrl: 'https://media.discordapp.net/attachments/1408520442960023592/1531133947164229662/image.png?ex=6a70041c&is=6a6eb29c&hm=9322dd42e3b71d001f204278401d13029300a2217d7af665361fa6ed3ce3f791&=&format=webp&quality=lossless',
    color: 0x9b59b6
  }
};
