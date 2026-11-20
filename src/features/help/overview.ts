export interface CategoryEntry {
  category: string;
  names: string[];
}

/** Commands grouped by category: the known categories first (in their order), then any other one. */
export const groupByCategory = (commands: ReadonlyArray<{ name: string; category: string }>, order: readonly string[]): CategoryEntry[] => {
  const groups = new Map<string, string[]>();
  for (const { name, category } of commands) {
    const names = groups.get(category) ?? [];
    names.push(name);
    groups.set(category, names);
  }

  const known = order.filter(category => groups.has(category));
  const others = [...groups.keys()].filter(category => !order.includes(category));
  return [...known, ...others].map(category => ({ category, names: groups.get(category)! }));
};

/** The heading of a category in the list, with how many commands it has: `📁 General [7]`. */
export const categoryTitle = ({ category, names }: CategoryEntry) => `📁 ${category} [${names.length}]`;
