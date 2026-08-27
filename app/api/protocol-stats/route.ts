import { NextResponse } from 'next/server';
import { vaultAddresses } from '@/lib/config/vaults';
import { BASE_CHAIN_ID } from '@/lib/constants';
import { handleApiError } from '@/lib/utils/error-handler';
import { createRateLimitMiddleware, RATE_LIMIT_REQUESTS_PER_MINUTE, MINUTE_MS } from '@/lib/utils/rate-limit';
import { morphoGraphQLClient } from '@/lib/morpho/graphql-client';
import { collectVaultV2DepositorAddresses } from '@/lib/morpho/v2-positions';
import { gql } from 'graphql-request';
import { getAddress } from 'viem';
import { logger } from '@/lib/utils/logger';
import {
  fetchDefiLlamaFees,
  fetchDefiLlamaRevenue,
  fetchDefiLlamaProtocol,
  getDailyFeesChart,
  getCumulativeFeesChart,
  getDailyRevenueChart,
  getCumulativeRevenueChart,
  getDailyInflowsChart,
  getCumulativeInflowsChart,
} from '@/lib/defillama/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAULT_V2_TVL_QUERY = gql`
  query VaultV2TvlHistory($address: String!, $chainId: Int!, $options: TimeseriesOptions) {
    vaultV2ByAddress(address: $address, chainId: $chainId) {
      name
      address
      totalAssetsUsd
      historicalState {
        totalAssetsUsd(options: $options) {
          x
          y
        }
      }
    }
  }
`;

function normalizeTvlPoints(
  raw: Array<{ x?: number; y?: number }>,
  currentTvl: number
): Array<{ date: string; value: number }> {
  const normalizedPoints = raw
    .map((point) => ({
      date: point.x ? new Date(point.x * 1000) : null,
      value: point.y || 0,
    }))
    .filter((p): p is { date: Date; value: number } => p.date !== null)
    .map((point) => {
      const day = new Date(point.date);
      day.setHours(0, 0, 0, 0);
      return { date: day.toISOString(), value: point.value, timestamp: day.getTime() };
    });

  const dayMap = new Map<string, { date: string; value: number; timestamp: number }>();
  for (const point of normalizedPoints) {
    const existing = dayMap.get(point.date);
    if (!existing || point.timestamp > existing.timestamp) {
      dayMap.set(point.date, point);
    }
  }

  let dataPoints = Array.from(dayMap.values()).map(({ date, value }) => ({ date, value }));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = today.toISOString();

  if (dataPoints.length > 0) {
    const latestPoint = dataPoints[dataPoints.length - 1];
    if (latestPoint.date !== todayKey || Math.abs(latestPoint.value - currentTvl) > 0.01) {
      dataPoints = dataPoints.filter((p) => p.date !== todayKey);
      dataPoints.push({ date: todayKey, value: currentTvl });
    }
  } else if (currentTvl > 0) {
    dataPoints.push({ date: todayKey, value: currentTvl });
  }

  return dataPoints;
}

export async function GET(request: Request) {
  const rateLimitMiddleware = createRateLimitMiddleware(
    RATE_LIMIT_REQUESTS_PER_MINUTE,
    MINUTE_MS
  );
  const rateLimitResult = rateLimitMiddleware(request);

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429, headers: rateLimitResult.headers }
    );
  }

  try {
    const june2024Timestamp = Math.floor(new Date('2024-06-01').getTime() / 1000);
    const uniqueUsers = new Set<string>();

    const vaultSeries = await Promise.all(
      vaultAddresses.map(async (cfg) => {
        const address = getAddress(cfg.address);
        const chainId = cfg.chainId ?? BASE_CHAIN_ID;

        const [tvlResult, depositors] = await Promise.all([
          morphoGraphQLClient.request<{
            vaultV2ByAddress?: {
              name?: string;
              totalAssetsUsd?: number;
              historicalState?: { totalAssetsUsd?: Array<{ x?: number; y?: number }> };
            } | null;
          }>(VAULT_V2_TVL_QUERY, {
            address,
            chainId,
            options: {
              startTimestamp: june2024Timestamp,
              endTimestamp: Math.floor(Date.now() / 1000),
              interval: 'DAY',
            },
          }),
          collectVaultV2DepositorAddresses(address, chainId),
        ]);

        for (const user of depositors) {
          uniqueUsers.add(user);
        }

        const vault = tvlResult.vaultV2ByAddress;
        if (!vault) {
          logger.debug('Configured vault not found in Morpho V2 API', { address });
          return null;
        }

        const currentTvl = vault.totalAssetsUsd ?? 0;
        const history = vault.historicalState?.totalAssetsUsd ?? [];
        const data =
          history.length > 0
            ? normalizeTvlPoints(history, currentTvl)
            : currentTvl > 0
              ? [{ date: new Date().toISOString(), value: currentTvl }]
              : [];

        return {
          name: vault.name || `Vault ${address.slice(0, 6)}...`,
          address: address.toLowerCase(),
          data,
          currentTvl,
        };
      })
    );

    const tvlByVault = vaultSeries.filter((v): v is NonNullable<typeof v> => v !== null);
    const totalDeposited = tvlByVault.reduce((sum, v) => sum + v.currentTvl, 0);
    const activeVaults = vaultAddresses.length;

    const tvlByDate = new Map<string, number>();
    for (const vault of tvlByVault) {
      for (const point of vault.data) {
        const date = new Date(point.date);
        date.setHours(0, 0, 0, 0);
        const dateKey = date.toISOString();
        tvlByDate.set(dateKey, (tvlByDate.get(dateKey) || 0) + point.value);
      }
    }

    const tvlTrend = Array.from(tvlByDate.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let totalFeesGenerated = 0;
    let totalRevenueGenerated = 0;
    let feesTrendDaily: Array<{ date: string; value: number }> = [];
    let feesTrendCumulative: Array<{ date: string; value: number }> = [];
    let revenueTrendDaily: Array<{ date: string; value: number }> = [];
    let revenueTrendCumulative: Array<{ date: string; value: number }> = [];
    let inflowsTrendDaily: Array<{ date: string; value: number }> = [];
    let inflowsTrendCumulative: Array<{ date: string; value: number }> = [];

    try {
      const [feesData, revenueData, protocolData] = await Promise.all([
        fetchDefiLlamaFees(),
        fetchDefiLlamaRevenue(),
        fetchDefiLlamaProtocol(),
      ]);

      if (feesData) {
        feesTrendDaily = getDailyFeesChart(feesData);
        feesTrendCumulative = getCumulativeFeesChart(feesData);
        if (feesData.totalAllTime) {
          totalFeesGenerated = feesData.totalAllTime;
        }
      }

      if (revenueData) {
        revenueTrendDaily = getDailyRevenueChart(revenueData);
        revenueTrendCumulative = getCumulativeRevenueChart(revenueData);
        if (revenueData.totalAllTime) {
          totalRevenueGenerated = revenueData.totalAllTime;
        }
      }

      if (protocolData) {
        inflowsTrendDaily = getDailyInflowsChart(protocolData, feesData);
        inflowsTrendCumulative = getCumulativeInflowsChart(protocolData, feesData);
      }
    } catch (error) {
      logger.error('Failed to fetch DefiLlama data', error as Error);
    }

    const stats = {
      totalDeposited,
      totalFeesGenerated,
      totalRevenueGenerated,
      activeVaults,
      users: uniqueUsers.size,
      tvlTrend,
      tvlByVault: tvlByVault.map((v) => ({
        name: v.name,
        address: v.address,
        data: v.data,
      })),
      feesTrendDaily,
      feesTrendCumulative,
      revenueTrendDaily,
      revenueTrendCumulative,
      inflowsTrendDaily,
      inflowsTrendCumulative,
    };

    const responseHeaders = new Headers(rateLimitResult.headers);
    responseHeaders.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    return NextResponse.json(stats, { headers: responseHeaders });
  } catch (err) {
    const { error, statusCode } = handleApiError(err, 'Failed to fetch protocol stats');
    return NextResponse.json(error, { status: statusCode });
  }
}
