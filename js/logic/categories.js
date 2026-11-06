export const ICONS = ['🚗', '⛽', '🛣️', '🅿️', '🚌', '🚕', '✈️', '🔧', '🍽️', '☕', '🍕', '🛒', '🥖', '🍷', '🩺', '💊', '🦷', '💅', '💇', '🧴', '🎬', '🎉', '🎮', '🎵', '⚽', '🏋️', '🏖️', '🎟️', '🏠', '💡', '💧', '📱', '🌐', '👕', '👟', '🛍️', '🎁', '📚', '🎓', '👶', '🧒', '👦', '👧', '🧸', '🐶', '🐱', '💼', '💶', '💳', '🏦', '📈', '🧾', '❤️', '⭐'];

const cat = (id, name, type, icon, order) => ({ id, name, type, icon, savings: false, order });

export const DEFAULT_CATEGORIES = [
  cat('carro', 'Carro', 'out', '🚗', 0),
  cat('combustivel', 'Combustível', 'out', '⛽', 1),
  cat('restaurantes', 'Restaurantes', 'out', '🍽️', 2),
  cat('supermercado', 'Supermercado', 'out', '🛒', 3),
  cat('saude', 'Saúde', 'out', '🩺', 4),
  cat('beleza', 'Beleza', 'out', '💅', 5),
  cat('lazer', 'Lazer', 'out', '🎬', 6),
  cat('via-verde', 'Via Verde', 'out', '🛣️', 7),
  cat('salario', 'Salário', 'in', '💼', 8),
  cat('outros', 'Outros', 'in', '💶', 9),
];

const norm = s => String(s).trim().toLocaleLowerCase('pt-PT');

export function validateCategory(draft, categories, editingId = null) {
  const name = String(draft.name ?? '').trim();
  if (!name) return 'Escreve um nome.';
  if ([...name].length > 30) return 'O nome pode ter no máximo 30 caracteres.';
  if (!draft.icon) return 'Escolhe um símbolo.';
  const dup = categories.some(c => c.id !== editingId && c.type === draft.type && norm(c.name) === norm(name));
  if (dup) return 'Já existe uma categoria com esse nome.';
  return null;
}

// Profile names follow the same rules (used by the first profile and the categories screen).
export function validateProfileName(name, profiles, editingId = null) {
  const n = String(name ?? '').trim();
  if (!n) return 'Escreve um nome.';
  if ([...n].length > 30) return 'O nome pode ter no máximo 30 caracteres.';
  if (profiles.some(p => p.id !== editingId && norm(p.name) === norm(n))) return 'Já existe um perfil com esse nome.';
  return null;
}

export function deletionPlan(catId, categories, moves) {
  const cat = categories.find(c => c.id === catId);
  const sameType = categories.filter(c => c.type === cat.type);
  if (sameType.length <= 1) {
    return { allowed: false, reason: cat.type === 'in'
      ? 'Não podes eliminar a última categoria de entradas.'
      : 'Não podes eliminar a última categoria de saídas.' };
  }
  return {
    allowed: true,
    moveCount: moves.filter(m => m.categoryId === catId).length,
    targets: sameType.filter(c => c.id !== catId),
  };
}

export const nextOrder = categories => categories.reduce((mx, c) => Math.max(mx, c.order), -1) + 1;

export const sortCategories = (categories, type) =>
  categories.filter(c => c.type === type).sort((a, b) => a.order - b.order);
