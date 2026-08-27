import { GRAPHQL_FIRST_LIMIT } from '@/lib/constants';
import { mergeConfig, type CuratorConfigOverrides } from './config';
import { computeMetricsForMarket } from './compute';
import { fetchMorphoMarkets } from './query';
import type { MorphoMarketMetrics, MorphoMarketRaw } from './types';
import { resolveMarketId } from './market-id';

type RatingOptions = {
  limit?: number;
  marketId?: string;
  configOverride?: CuratorConfigOverrides;
  benchmarkRates?: Record<string, number>;
};

function applyBenchmark(
  market: MorphoMarketRaw,
  benchmarkRates?: Record<string, number>,
  fallback?: number
): number | undefined {
  if (!benchmarkRates) return fallback;
  const symbol = market.loanAsset?.symbol?.toUpperCase();
  if (!symbol) return fallback;
  const rate = benchmarkRates[symbol];
  return typeof rate === 'number' ? rate : fallback;
}

export async function getMorphoMarketRatings(
  options: RatingOptions = {}
): Promise<MorphoMarketMetrics[]> {
  // Default to fetching all markets (up to GRAPHQL_FIRST_LIMIT) to ensure we get ratings for all
  const { limit = GRAPHQL_FIRST_LIMIT, marketId, configOverride, benchmarkRates } = options;
  const config = mergeConfig(configOverride);
  const rawMarkets = await fetchMorphoMarkets(limit, config);

  const filtered = marketId
    ? rawMarkets.filter((market) => resolveMarketId(market as { marketId?: string | null; id?: string | null }) === marketId)
    : rawMarkets;

  const metrics = filtered.map((market) =>
    computeMetricsForMarket(
      market,
      config,
      applyBenchmark(market, benchmarkRates, config.fallbackBenchmarkRate)
    )
  );

  return metrics.sort((a, b) => {
    // Sort null ratings to the end
    if (a.rating === null && b.rating === null) return 0;
    if (a.rating === null) return 1;
    if (b.rating === null) return -1;
    return b.rating - a.rating;
  });
}

