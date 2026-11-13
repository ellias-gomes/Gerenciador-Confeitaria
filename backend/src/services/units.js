/**
 * Conversão de unidades de medida para fichas técnicas de confeitaria.
 */

const UNIT_DEFINITIONS = {
  // Massa
  mg: { group: 'mass', factor: 0.001, label: 'mg' },
  g: { group: 'mass', factor: 1, label: 'g' },
  kg: { group: 'mass', factor: 1000, label: 'kg' },

  // Volume
  ml: { group: 'volume', factor: 1, label: 'ml' },
  l: { group: 'volume', factor: 1000, label: 'L' },

  // Contagem / Embalagens
  un: { group: 'count', factor: 1, label: 'un' },
  dz: { group: 'count', factor: 12, label: 'dz' },
  pct: { group: 'count', factor: 1, label: 'pct' },
  cx: { group: 'count', factor: 1, label: 'cx' },
  lata: { group: 'count', factor: 1, label: 'lata' },
  frasco: { group: 'count', factor: 1, label: 'frasco' },
};

function normalizeUnit(unit) {
  if (!unit || typeof unit !== 'string') return 'un';
  const normalized = unit.trim().toLowerCase();
  if (normalized === 'unidade' || normalized === 'unidades') return 'un';
  if (normalized === 'litro' || normalized === 'litros') return 'l';
  if (normalized === 'quilo' || normalized === 'quilos') return 'kg';
  if (normalized === 'grama' || normalized === 'gramas') return 'g';
  return UNIT_DEFINITIONS[normalized] ? normalized : 'un';
}

function getUnitGroup(unit) {
  const norm = normalizeUnit(unit);
  return UNIT_DEFINITIONS[norm]?.group || 'count';
}

function areUnitsCompatible(unitA, unitB) {
  const normA = normalizeUnit(unitA);
  const normB = normalizeUnit(unitB);
  if (normA === normB) return true;
  const defA = UNIT_DEFINITIONS[normA];
  const defB = UNIT_DEFINITIONS[normB];
  if (!defA || !defB) return false;
  if (defA.group !== defB.group) return false;
  // Em contagem, apenas 'un' e 'dz' convertem entre si automaticamente; pacotes/caixas mantêm 1:1 apenas quando iguais
  if (defA.group === 'count') {
    const countable = new Set(['un', 'dz']);
    return countable.has(normA) && countable.has(normB);
  }
  return true;
}

function convertQuantity(quantity, fromUnit, toUnit) {
  const num = Number(quantity) || 0;
  const normFrom = normalizeUnit(fromUnit);
  const normTo = normalizeUnit(toUnit);
  if (normFrom === normTo) return num;
  if (!areUnitsCompatible(normFrom, normTo)) {
    return num;
  }
  const baseQty = num * UNIT_DEFINITIONS[normFrom].factor;
  return baseQty / UNIT_DEFINITIONS[normTo].factor;
}

function getCompatibleUnits(baseUnit) {
  const norm = normalizeUnit(baseUnit);
  const group = getUnitGroup(norm);
  if (group === 'mass') return ['g', 'kg', 'mg'];
  if (group === 'volume') return ['ml', 'L'];
  if (norm === 'un' || norm === 'dz') return ['un', 'dz'];
  return [UNIT_DEFINITIONS[norm]?.label || norm, 'un'];
}

function computeIngredientUsageCost({ packagePrice, packageSize, purchaseUnit, usedQty, usedUnit }) {
  const safeSize = Number(packageSize) > 0 ? Number(packageSize) : 1;
  const safePrice = Number(packagePrice) || 0;
  const convertedQty = convertQuantity(usedQty, usedUnit || purchaseUnit, purchaseUnit);
  const unitCost = safePrice / safeSize;
  return {
    convertedQty,
    unitCost,
    totalCost: convertedQty * unitCost,
  };
}

module.exports = {
  UNIT_DEFINITIONS,
  normalizeUnit,
  getUnitGroup,
  areUnitsCompatible,
  convertQuantity,
  getCompatibleUnits,
  computeIngredientUsageCost,
};
