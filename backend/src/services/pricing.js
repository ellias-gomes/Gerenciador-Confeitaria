const { computeIngredientUsageCost } = require('./units');

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function round4(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}

/**
 * Calcula métricas de custo, precificação e lucro para uma receita/ficha técnica.
 */
function calculateRecipeMetrics(recipe, items, settings) {
  const indirectPct = recipe.indirect_cost_pct !== null && recipe.indirect_cost_pct !== undefined
    ? Number(recipe.indirect_cost_pct)
    : Number(settings.default_indirect_cost_pct ?? 10);

  const laborHourRate = Number(settings.labor_hour_rate ?? 20);
  const cardFeePct = Number(settings.card_fee_pct ?? 0);
  const targetMarginPct = recipe.target_margin_pct !== null && recipe.target_margin_pct !== undefined
    ? Number(recipe.target_margin_pct)
    : Number(settings.default_profit_margin_pct ?? 40);

  let ingredientsCost = 0;
  let packagingCost = 0;

  const calculatedItems = items.map((item) => {
    const { convertedQty, unitCost, totalCost } = computeIngredientUsageCost({
      packagePrice: item.current_price,
      packageSize: item.package_size,
      purchaseUnit: item.purchase_unit,
      usedQty: item.quantity,
      usedUnit: item.unit,
    });

    if (item.kind === 'embalagem') {
      packagingCost += totalCost;
    } else {
      ingredientsCost += totalCost;
    }

    return {
      ...item,
      converted_qty: round4(convertedQty),
      unit_cost: round4(unitCost),
      item_cost: round2(totalCost),
    };
  });

  const directCost = ingredientsCost + packagingCost;
  const indirectCost = directCost * (indirectPct / 100);
  const prepHours = (Number(recipe.prep_time_minutes) || 0) / 60;
  const laborCost = prepHours * laborHourRate;
  const extraCost = Number(recipe.extra_cost) || 0;

  const totalCost = directCost + indirectCost + laborCost + extraCost;
  const yieldQty = Math.max(1, Number(recipe.yield_quantity) || 1);
  const unitCost = totalCost / yieldQty;

  const pricingMode = recipe.pricing_mode === 'markup' ? 'markup' : 'margin';
  const markupFactor = Number(recipe.markup_factor) > 0 ? Number(recipe.markup_factor) : 2.2;

  let suggestedPrice = 0;
  if (pricingMode === 'markup') {
    suggestedPrice = totalCost * markupFactor;
  } else {
    const deduction = (targetMarginPct + cardFeePct) / 100;
    const denominator = Math.max(0.1, 1 - deduction);
    suggestedPrice = totalCost / denominator;
  }

  const manualPrice = Number(recipe.sale_price) || 0;
  const effectivePrice = manualPrice > 0 ? manualPrice : suggestedPrice;
  const effectiveUnitPrice = effectivePrice / yieldQty;
  const suggestedUnitPrice = suggestedPrice / yieldQty;

  const cardFeeValue = effectivePrice * (cardFeePct / 100);
  const netProfit = effectivePrice - totalCost - cardFeeValue;
  const actualMarginPct = effectivePrice > 0 ? (netProfit / effectivePrice) * 100 : 0;
  const cmvPct = effectivePrice > 0 ? (directCost / effectivePrice) * 100 : 0;

  return {
    items: calculatedItems,
    metrics: {
      ingredients_cost: round2(ingredientsCost),
      packaging_cost: round2(packagingCost),
      direct_cost: round2(directCost),
      indirect_cost: round2(indirectCost),
      indirect_cost_pct: round2(indirectPct),
      labor_cost: round2(laborCost),
      labor_hour_rate: round2(laborHourRate),
      extra_cost: round2(extraCost),
      total_cost: round2(totalCost),
      unit_cost: round2(unitCost),
      suggested_price: round2(suggestedPrice),
      suggested_unit_price: round2(suggestedUnitPrice),
      effective_price: round2(effectivePrice),
      effective_unit_price: round2(effectiveUnitPrice),
      estimated_profit: round2(netProfit),
      actual_margin_pct: round2(actualMarginPct),
      target_margin_pct: round2(targetMarginPct),
      cmv_pct: round2(cmvPct),
      card_fee_pct: round2(cardFeePct),
    },
  };
}

/**
 * Analisa histórico de preços de um insumo para detectar tendências e variações.
 */
function analyzeIngredientTrend(historyRows, ingredient) {
  const sorted = [...historyRows].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );

  const currentPrice = Number(ingredient.current_price) || 0;
  const packageSize = Number(ingredient.package_size) > 0 ? Number(ingredient.package_size) : 1;
  const currentUnitPrice = currentPrice / packageSize;

  if (sorted.length === 0) {
    return {
      records_count: 0,
      current_price: round2(currentPrice),
      current_unit_price: round4(currentUnitPrice),
      min_price: round2(currentPrice),
      max_price: round2(currentPrice),
      avg_price: round2(currentPrice),
      previous_price: round2(currentPrice),
      variation_last_pct: 0,
      variation_overall_pct: 0,
      trend: 'estavel',
      history: [],
    };
  }

  const prices = sorted.map((r) => Number(r.price) || 0);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = prices.reduce((acc, p) => acc + p, 0) / prices.length;

  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length >= 2 ? sorted[sorted.length - 2] : latest;

  const firstUnitPrice = (Number(first.price) || 0) / Math.max(0.0001, Number(first.package_size) || packageSize);
  const prevUnitPrice = (Number(previous.price) || 0) / Math.max(0.0001, Number(previous.package_size) || packageSize);
  const latestUnitPrice = (Number(latest.price) || 0) / Math.max(0.0001, Number(latest.package_size) || packageSize);

  const variationLastPct = prevUnitPrice > 0
    ? ((latestUnitPrice - prevUnitPrice) / prevUnitPrice) * 100
    : 0;

  const variationOverallPct = firstUnitPrice > 0
    ? ((latestUnitPrice - firstUnitPrice) / firstUnitPrice) * 100
    : 0;

  // Tendência considerando comparação contra média recente e variação recente
  let trend = 'estavel';
  const comparePct = sorted.length >= 3
    ? ((latestUnitPrice - (avgPrice / packageSize)) / Math.max(0.0001, avgPrice / packageSize)) * 100
    : variationLastPct;

  if (variationLastPct >= 2 || comparePct >= 3) {
    trend = 'subindo';
  } else if (variationLastPct <= -2 || comparePct <= -3) {
    trend = 'caindo';
  }

  return {
    records_count: sorted.length,
    current_price: round2(currentPrice),
    current_unit_price: round4(currentUnitPrice),
    min_price: round2(minPrice),
    max_price: round2(maxPrice),
    avg_price: round2(avgPrice),
    previous_price: round2(previous.price),
    variation_last_pct: round2(variationLastPct),
    variation_overall_pct: round2(variationOverallPct),
    trend,
    history: sorted.map((row) => ({
      ...row,
      unit_price: round4((Number(row.price) || 0) / Math.max(0.0001, Number(row.package_size) || packageSize)),
    })),
  };
}

module.exports = {
  round2,
  round4,
  calculateRecipeMetrics,
  analyzeIngredientTrend,
};
