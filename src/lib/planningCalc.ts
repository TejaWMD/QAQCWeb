export interface PlanningInput {
  productId: string;
  productCode: string;
  productName: string;
  brand?: string;
  batchPrefix?: string;
  pcsPerCarton: number;
  netFillingKgPerCarton: number;
  batchOutputKg: number;
  cookingTimeHours: number;
  currentStockCartons: number;
  reorderLevel: number;
  forecastQty: number;
}

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

export interface PlanningCalculation extends PlanningInput {
  targetStock: number;
  shortageCartons: number;
  requiredKg: number;
  requiredBatches: number;
  totalCookingHours: number;
  priorityScore: number;
  priority: PriorityLevel;
}

export function calculateShortageAndPriority(item: PlanningInput): PlanningCalculation {
  const targetStock = Math.max(Number(item.reorderLevel) || 0, Number(item.forecastQty) || 0);
  const current = Math.max(0, Number(item.currentStockCartons) || 0);
  const shortageCartons = Math.max(0, targetStock - current);

  const fillingKg = Number(item.netFillingKgPerCarton) || 0;
  const requiredKg = Number((shortageCartons * fillingKg).toFixed(2));

  const batchOut = Number(item.batchOutputKg) || 0;
  const requiredBatches = batchOut > 0 && requiredKg > 0 ? Math.ceil(requiredKg / batchOut) : 0;

  const cookPerBatch = Number(item.cookingTimeHours) || 0;
  const totalCookingHours = Number((requiredBatches * cookPerBatch).toFixed(2));

  // Priority scoring (0-100):
  // +40 if below reorder level
  // +30 weighted by shortage ratio
  // +30 weighted by cooking duration (20h = max)
  let score = 0;
  if (current < (Number(item.reorderLevel) || 0)) {
    score += 40;
  }
  if (targetStock > 0) {
    score += Math.min(30, (shortageCartons / targetStock) * 30);
  }
  if (totalCookingHours > 0) {
    score += Math.min(30, (totalCookingHours / 20) * 30);
  }
  const priorityScore = Math.round(score);

  let priority: PriorityLevel = 'low';
  if (priorityScore >= 70) priority = 'critical';
  else if (priorityScore >= 50) priority = 'high';
  else if (priorityScore >= 30) priority = 'medium';

  return {
    ...item,
    targetStock,
    shortageCartons,
    requiredKg,
    requiredBatches,
    totalCookingHours,
    priorityScore,
    priority,
  };
}

export interface SequenceOptimizationResult<T> {
  ordered: T[];
  totalCookingHours: number;
  atRiskIds: string[];
  summary: string;
}

/**
 * Deterministic Constraint-Based Sequence Optimizer ($0 cost, <5ms, 100% reproducible).
 * Rule: Manual/Critical priority first -> longest cooking time first (LPT) so long jobs finish before delivery.
 */
export function optimizeProductionSequence<
  T extends { id: string; priority?: string; run_time_hours?: number; planned_kg?: number; status?: string }
>(orders: T[]): SequenceOptimizationResult<T> {
  const active = orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled');
  const rank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

  const ordered = [...active].sort((a, b) => {
    const rA = rank[(a.priority || 'medium').toLowerCase()] || 2;
    const rB = rank[(b.priority || 'medium').toLowerCase()] || 2;
    if (rA !== rB) return rB - rA;
    return (Number(b.run_time_hours) || 0) - (Number(a.run_time_hours) || 0);
  });

  const totalCookingHours = Number(
    ordered.reduce((sum, o) => sum + (Number(o.run_time_hours) || 0), 0).toFixed(2)
  );
  const atRiskIds = ordered
    .filter((o) => (o.priority || '').toLowerCase() === 'critical' || (Number(o.run_time_hours) || 0) >= 8)
    .map((o) => o.id);

  return {
    ordered,
    totalCookingHours,
    atRiskIds,
    summary: `Sequenced ${ordered.length} active orders (${totalCookingHours} total hrs). Critical jobs prioritized first, then longest cooking time first.`,
  };
}
