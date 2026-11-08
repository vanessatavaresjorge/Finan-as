// The three groups of the 50/30/20 rule and the automatic group for categories without one.
export const GROUPS = ['necessidade', 'desejo', 'poupanca'];
export const GROUP_LABELS = { necessidade: 'Necessidade', desejo: 'Desejo', poupanca: 'Poupança' };
export const TARGETS = { necessidade: 50, desejo: 30, poupanca: 20 };

const WISHES = ['restaurantes', 'beleza', 'lazer'];

export function groupOf(category) {
  if (GROUPS.includes(category.group)) return category.group;
  if (category.savings === true) return 'poupanca';
  if (WISHES.includes(category.id)) return 'desejo';
  return 'necessidade';
}

export function withGroup(category) {
  if (category.type === 'in') return { ...category, savings: false };
  const group = groupOf(category);
  return { ...category, group, savings: group === 'poupanca' };
}
