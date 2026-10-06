import {
  calculateVaultSummaryMetrics,
  supplyAprFractionToPercentagePoints,
  type VaultSummaryMarket,
} from '../vault-summary';

const allocation = (marketKey: string, supplyUsd: number) => ({ marketKey, supplyUsd });

const market = (
  uniqueKey: string,
  utilization: number | undefined,
  rewards: Array<{ supplyAprPercent?: number }> | undefined
): VaultSummaryMarket => ({
  uniqueKey,
  state: {
    utilization,
    rewards,
  },
});

describe('supplyAprFractionToPercentagePoints', () => {
  it('converts fractional APR to percentage points', () => {
    expect(supplyAprFractionToPercentagePoints(0.05)).toBe(5);
  });

  it('keeps zero APR and marks missing or invalid APR as unavailable', () => {
    expect(supplyAprFractionToPercentagePoints(0)).toBe(0);
    expect(supplyAprFractionToPercentagePoints(null)).toBeUndefined();
    expect(supplyAprFractionToPercentagePoints(Number.NaN)).toBeUndefined();
  });
});

describe('calculateVaultSummaryMetrics', () => {
  it('weights utilization and reward APR by each allocation amount', () => {
    const result = calculateVaultSummaryMetrics(
      [allocation('large', 900), allocation('small', 100)],
      [
        market('large', 0.9, [{ supplyAprPercent: 5 }]),
        market('small', 0.1, [{ supplyAprPercent: 1 }]),
      ]
    );

    expect(result).toEqual({
      weightedUtilization: 0.82,
      weightedRewardApr: 4.6,
    });
  });

  it('treats an empty rewards list as zero reward APR and includes it in the weight', () => {
    const result = calculateVaultSummaryMetrics(
      [allocation('none', 50), allocation('incentivized', 50)],
      [market('none', 0.5, []), market('incentivized', 0.5, [{ supplyAprPercent: 4 }])]
    );

    expect(result.weightedRewardApr).toBe(2);
  });

  it('sums reward token APRs within each market before weighting', () => {
    const result = calculateVaultSummaryMetrics(
      [allocation('market', 100)],
      [market('market', 0.5, [{ supplyAprPercent: 2 }, { supplyAprPercent: 3 }])]
    );

    expect(result.weightedRewardApr).toBe(5);
  });

  it('returns null for a metric when an active allocation has incomplete data', () => {
    const result = calculateVaultSummaryMetrics(
      [allocation('known', 50), allocation('missing', 50)],
      [market('known', 0.5, [{ supplyAprPercent: 2 }])]
    );

    expect(result).toEqual({ weightedUtilization: null, weightedRewardApr: null });
  });

  it('keeps utilization available when only reward APR data is incomplete', () => {
    const result = calculateVaultSummaryMetrics(
      [allocation('market', 100)],
      [market('market', 0.75, undefined)]
    );

    expect(result).toEqual({ weightedUtilization: 0.75, weightedRewardApr: null });
  });

  it('keeps reward APR available when only utilization data is incomplete', () => {
    const result = calculateVaultSummaryMetrics(
      [allocation('market', 100)],
      [market('market', undefined, [{ supplyAprPercent: 3 }])]
    );

    expect(result).toEqual({ weightedUtilization: null, weightedRewardApr: 3 });
  });

  it('returns unavailable metrics when there are no positive allocations', () => {
    const result = calculateVaultSummaryMetrics(
      [allocation('zero', 0), allocation('negative', -5)],
      [market('zero', 0.5, [])]
    );

    expect(result).toEqual({ weightedUtilization: null, weightedRewardApr: null });
  });
});
