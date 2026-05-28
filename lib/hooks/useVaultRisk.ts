import { useMemo } from 'react';
import { useMorphoMarkets } from './useMorphoMarkets';
import type { VaultDetail } from './useProtocolStats';
import type { MorphoMarketMetrics } from '@/lib/morpho/types';

export type VaultRiskSummary = {
  rating: number | null;
  marketsRated: number;
  marketsTotal: number;
};

export function useVaultRisk(vault?: Pick<VaultDetail, 'allocation'>) {
  const morpho = useMorphoMarkets();

  const summary = useMemo<VaultRiskSummary>(() => {
    if (!vault?.allocation || !morpho.data?.markets) {
      return { rating: null, marketsRated: 0, marketsTotal: vault?.allocation?.length ?? 0 };
    }

    const metricsByKey = new Map<string, MorphoMarketMetrics>();
    morpho.data.markets.forEach((m) => {
      const marketKey =
        (m.raw as { marketId?: string }).marketId ?? m.raw?.id;
      if (marketKey) metricsByKey.set(marketKey, m);
      metricsByKey.set(m.id, m);
    });

    let total = 0;
    let count = 0;

    vault.allocation.forEach((alloc) => {
      const key = alloc.marketKey;
      const metrics = key ? metricsByKey.get(key) : undefined;
      const rating = metrics?.rating;
      if (typeof rating === 'number') {
        total += rating;
        count += 1;
      }
    });

    const rating = count > 0 ? Math.round(total / count) : null;
    return { rating, marketsRated: count, marketsTotal: vault.allocation.length };
  }, [vault?.allocation, morpho.data?.markets]);

  return {
    summary,
    isLoading: morpho.isLoading,
    isError: Boolean(morpho.error),
    error: morpho.error,
  };
}
