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
  /** Utilization as a fraction between 0 and 1. */
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
 * Calculate vault-level market metrics using each position's supplied USD as its weight.
 * A metric is unavailable when any active allocation lacks that metric, rather than
 * silently treating missing data as zero or presenting a partial value as complete.
 */
export function calculateVaultSummaryMetrics(
  allocations: ReadonlyArray<VaultSummaryAllocation>,
  markets: ReadonlyArray<VaultSummaryMarket>
): VaultSummaryMetrics {
  const marketsByKey = new Map(markets.map((market) => [market.uniqueKey, market]));
  const activeAllocations = allocations.filter(
    ({ supplyUsd }) => Number.isFinite(supplyUsd) && supplyUsd > 0
  );

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
      typeof utilization === 'number' &&
      Number.isFinite(utilization) &&
      utilization >= 0 &&
      utilization <= 1;

    if (hasValidUtilization) {
      utilizationWeight += allocation.supplyUsd * utilization;
    } else {
      hasCompleteUtilization = false;
    }

    const rewards = market?.state?.rewards;
    if (rewards == null) {
      hasCompleteRewardApr = false;
    } else {
      let marketRewardApr = 0;
      let hasCompleteMarketRewardApr = true;
      for (const reward of rewards) {
        const supplyAprPercent = reward.supplyAprPercent;
        if (typeof supplyAprPercent !== 'number' || !Number.isFinite(supplyAprPercent)) {
          hasCompleteMarketRewardApr = false;
          break;
        }
        marketRewardApr += supplyAprPercent;
      }
      if (hasCompleteMarketRewardApr) {
        rewardAprWeight += allocation.supplyUsd * marketRewardApr;
      } else {
        hasCompleteRewardApr = false;
      }
    }

    totalWeight += allocation.supplyUsd;
  }

  return {
    weightedUtilization: hasCompleteUtilization ? utilizationWeight / totalWeight : null,
    weightedRewardApr: hasCompleteRewardApr ? rewardAprWeight / totalWeight : null,
  };
}
