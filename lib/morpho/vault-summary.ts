export type VaultSummaryAllocation = {
  marketKey: string;
  supplyUsd: number;
};

export type VaultSummaryMarket = {
  uniqueKey: string;
  state?: {
    utilization?: number;
    rewards?: Array<{
      supplyAprPercent?: number;
    }>;
  };
};

export type VaultSummaryMetrics = {
  /** Utilization as a non-negative fraction. Values above 1 are kept. */
  weightedUtilization: number | null;
  /** Reward APR in percentage points, matching formatPercentage's input. */
  weightedRewardApr: number | null;
};

/** Convert Morpho GraphQL's fractional APR (for example 0.05) to percentage points (5). */
export function supplyAprFractionToPercentagePoints(
  supplyApr: number | null | undefined
): number | undefined {
  if (supplyApr == null || !Number.isFinite(supplyApr)) return undefined;
  return supplyApr * 100;
}

/**
 * Combine allocations that share a market. Supply is summed once per market so the
 * same market is not weighted twice when more than one adapter reports it.
 */
export function mergeVaultAllocations(
  allocations: ReadonlyArray<VaultSummaryAllocation>
): VaultSummaryAllocation[] {
  const supplyByMarket = new Map<string, number>();

  for (const { marketKey, supplyUsd } of allocations) {
    if (!marketKey || !Number.isFinite(supplyUsd) || supplyUsd <= 0) continue;
    supplyByMarket.set(marketKey, (supplyByMarket.get(marketKey) ?? 0) + supplyUsd);
  }

  return Array.from(supplyByMarket, ([marketKey, supplyUsd]) => ({ marketKey, supplyUsd }));
}

function marketRewardAprPercent(market: VaultSummaryMarket | undefined): number | null {
  const rewards = market?.state?.rewards;
  if (rewards == null) return null;

  let marketRewardApr = 0;
  for (const reward of rewards) {
    const supplyAprPercent = reward.supplyAprPercent;
    if (typeof supplyAprPercent !== 'number' || !Number.isFinite(supplyAprPercent)) return null;
    marketRewardApr += supplyAprPercent;
  }
  return marketRewardApr;
}

/**
 * Calculate vault-level market metrics using each market's supplied USD as its weight.
 * Allocations for the same market are combined first.
 * An empty rewards list is zero reward APR and stays in the weight.
 * A metric is withheld when any active allocation lacks a valid reading for it,
 * so a partial slice is not shown as the vault figure. The two metrics are
 * independent. Utilization may be above 1.
 */
export function calculateVaultSummaryMetrics(
  allocations: ReadonlyArray<VaultSummaryAllocation>,
  markets: ReadonlyArray<VaultSummaryMarket>
): VaultSummaryMetrics {
  const marketsByKey = new Map(markets.map((market) => [market.uniqueKey, market]));
  const activeAllocations = mergeVaultAllocations(allocations);

  if (activeAllocations.length === 0) {
    return { weightedUtilization: null, weightedRewardApr: null };
  }

  let totalWeight = 0;
  let utilizationWeight = 0;
  let rewardAprWeight = 0;
  let hasCompleteUtilization = true;
  let hasCompleteRewardApr = true;

  for (const allocation of activeAllocations) {
    const market = marketsByKey.get(allocation.marketKey);
    const utilization = market?.state?.utilization;
    const hasValidUtilization =
      typeof utilization === 'number' && Number.isFinite(utilization) && utilization >= 0;

    if (hasValidUtilization) {
      utilizationWeight += allocation.supplyUsd * utilization;
    } else {
      hasCompleteUtilization = false;
    }

    const rewardApr = marketRewardAprPercent(market);
    if (rewardApr != null) {
      rewardAprWeight += allocation.supplyUsd * rewardApr;
    } else {
      hasCompleteRewardApr = false;
    }

    totalWeight += allocation.supplyUsd;
  }

  return {
    weightedUtilization: hasCompleteUtilization ? utilizationWeight / totalWeight : null,
    weightedRewardApr: hasCompleteRewardApr ? rewardAprWeight / totalWeight : null,
  };
}

/**
 * Supply-weighted average of market ratings. Markets without a rating are left
 * out of both the numerator and the denominator. Returns null when no active
 * allocation has a rating.
 */
export function weightedVaultRating(
  allocations: ReadonlyArray<VaultSummaryAllocation>,
  markets: ReadonlyArray<{ uniqueKey: string; rating?: number | null }>
): number | null {
  const marketsByKey = new Map(markets.map((market) => [market.uniqueKey, market]));
  let weighted = 0;
  let weight = 0;

  for (const allocation of mergeVaultAllocations(allocations)) {
    const rating = marketsByKey.get(allocation.marketKey)?.rating;
    if (typeof rating !== 'number' || !Number.isFinite(rating)) continue;
    weighted += allocation.supplyUsd * rating;
    weight += allocation.supplyUsd;
  }

  return weight > 0 ? weighted / weight : null;
}

/**
 * Supply-weighted Morpho supply APY as a fraction.
 * A missing APY on any positive allocation withholds the result instead of
 * counting that supply as 0%.
 */
export function weightedSupplyApy(
  positions: ReadonlyArray<{ supplyUsd: number; supplyApy?: number | null }>
): number | null {
  const active = positions.filter(
    (position) => Number.isFinite(position.supplyUsd) && position.supplyUsd > 0
  );
  if (active.length === 0) return null;

  let weighted = 0;
  let weight = 0;
  for (const position of active) {
    const supplyApy = position.supplyApy;
    if (typeof supplyApy !== 'number' || !Number.isFinite(supplyApy)) return null;
    weighted += position.supplyUsd * supplyApy;
    weight += position.supplyUsd;
  }

  return weight > 0 ? weighted / weight : null;
}
