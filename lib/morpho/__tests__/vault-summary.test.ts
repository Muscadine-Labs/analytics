import {
  calculateVaultSummaryMetrics,
  mergeVaultAllocations,
  supplyAprFractionToPercentagePoints,
  weightedSupplyApy,
  weightedVaultRating,
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

describe('mergeVaultAllocations', () => {
  it('sums supply for a repeated market and drops non-positive amounts', () => {
    expect(
      mergeVaultAllocations([
        allocation('market', 25),
        allocation('market', 75),
        allocation('other', 10),
        allocation('zero', 0),
        allocation('missing', Number.NaN),
      ])
    ).toEqual([allocation('market', 100), allocation('other', 10)]);
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

  it('withholds a metric when any active allocation lacks that reading', () => {
    const result = calculateVaultSummaryMetrics(
      [allocation('known', 50), allocation('missing', 50)],
      [market('known', 0.5, [{ supplyAprPercent: 2 }])]
    );

    expect(result).toEqual({ weightedUtilization: null, weightedRewardApr: null });
  });

  it('keeps utilization above 100 percent', () => {
    const result = calculateVaultSummaryMetrics(
      [allocation('hot', 80), allocation('calm', 20)],
      [market('hot', 1.25, []), market('calm', 0.5, [])]
    );

    expect(result.weightedUtilization).toBe(1.1);
  });

  it('withholds reward APR when one market has an incomplete reward token', () => {
    const result = calculateVaultSummaryMetrics(
      [allocation('broken', 50), allocation('ok', 50)],
      [
        market('broken', 0.5, [{ supplyAprPercent: Number.NaN }]),
        market('ok', 0.5, [{ supplyAprPercent: 4 }]),
      ]
    );

    expect(result).toEqual({ weightedUtilization: 0.5, weightedRewardApr: null });
  });

  it('combines duplicate market allocations before weighting', () => {
    const markets = [
      market('market', 0.2, [{ supplyAprPercent: 4 }]),
      market('other', 0.8, [{ supplyAprPercent: 0 }]),
    ];
    const duplicated = calculateVaultSummaryMetrics(
      [allocation('market', 25), allocation('market', 75), allocation('other', 100)],
      markets
    );
    const combined = calculateVaultSummaryMetrics(
      [allocation('market', 100), allocation('other', 100)],
      markets
    );

    expect(duplicated).toEqual(combined);
    expect(duplicated).toEqual({ weightedUtilization: 0.5, weightedRewardApr: 2 });
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

describe('weightedVaultRating', () => {
  it('weights ratings by supplied USD and ignores markets with no rating', () => {
    const rating = weightedVaultRating(
      [allocation('large', 900), allocation('small', 100), allocation('unrated', 500)],
      [
        { uniqueKey: 'large', rating: 90 },
        { uniqueKey: 'small', rating: 10 },
        { uniqueKey: 'unrated', rating: null },
      ]
    );

    expect(rating).toBe(82);
  });

  it('returns null when no active allocation has a rating', () => {
    expect(weightedVaultRating([allocation('market', 100)], [{ uniqueKey: 'market', rating: null }])).toBeNull();
  });
});

describe('weightedSupplyApy', () => {
  it('weights supply APY by supplied USD', () => {
    expect(
      weightedSupplyApy([
        { supplyUsd: 900, supplyApy: 0.1 },
        { supplyUsd: 100, supplyApy: 0 },
      ])
    ).toBe(0.09);
  });

  it('withholds the APY when a positive allocation has no reading', () => {
    expect(
      weightedSupplyApy([
        { supplyUsd: 50, supplyApy: 0.04 },
        { supplyUsd: 50, supplyApy: null },
      ])
    ).toBeNull();
  });

  it('ignores zero supply', () => {
    expect(weightedSupplyApy([{ supplyUsd: 0, supplyApy: null }, { supplyUsd: 10, supplyApy: 0.02 }])).toBe(0.02);
  });
});
