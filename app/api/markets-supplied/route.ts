import { NextResponse } from 'next/server';
import { gql } from 'graphql-request';
import { getAddress } from 'viem';
import { vaultAddresses } from '@/lib/config/vaults';
import { BASE_CHAIN_ID, GRAPHQL_FIRST_LIMIT } from '@/lib/constants';
import { morphoGraphQLClient } from '@/lib/morpho/graphql-client';
import { handleApiError } from '@/lib/utils/error-handler';
import { createRateLimitMiddleware, RATE_LIMIT_REQUESTS_PER_MINUTE, MINUTE_MS } from '@/lib/utils/rate-limit';
import type { MarketsSuppliedResponse } from '@/lib/hooks/useMarkets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type VaultAllocationRow = {
  supplyAssetsUsd?: number | null;
  market?: {
    id?: string | null;
    marketId?: string | null;
    loanAsset?: { symbol?: string | null } | null;
    collateralAsset?: { symbol?: string | null } | null;
    state?: {
      utilization?: number | null;
      supplyAssetsUsd?: number | null;
      borrowAssetsUsd?: number | null;
      supplyApy?: number | null;
      borrowApy?: number | null;
      rewards?: Array<{ supplyApr?: number | null } | null> | null;
    } | null;
  } | null;
};

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
    const addresses = vaultAddresses.map((v) => getAddress(v.address));

    const query = gql`
      query MarketsSupplied($addresses: [String!]) {
        vaults(
          first: ${GRAPHQL_FIRST_LIMIT}
          where: { address_in: $addresses, chainId_in: [${BASE_CHAIN_ID}] }
        ) {
          items {
            address
            state {
              totalAssetsUsd
              allocation {
                supplyAssetsUsd
                market {
                  id
                  marketId
                  loanAsset { symbol }
                  collateralAsset { symbol }
                  state {
                    utilization
                    supplyAssetsUsd
                    borrowAssetsUsd
                    supplyApy
                    borrowApy
                    rewards { supplyApr }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const data = await morphoGraphQLClient.request<{
      vaults?: {
        items?: Array<{
          address?: string | null;
          state?: {
            totalAssetsUsd?: number | null;
            allocation?: VaultAllocationRow[] | null;
          } | null;
        } | null> | null;
      } | null;
    }>(query, { addresses });

    const marketsByKey = new Map<string, MarketsSuppliedResponse['markets'][number]>();
    const vaultAllocations: MarketsSuppliedResponse['vaultAllocations'] = [];

    for (const vault of data.vaults?.items ?? []) {
      if (!vault?.address) continue;

      const allocation = vault.state?.allocation ?? [];
      const allocations: MarketsSuppliedResponse['vaultAllocations'][number]['allocations'] = [];
      let totalSupplyUsd = 0;

      for (const row of allocation) {
        const marketKey = row.market?.marketId;
        if (!marketKey) continue;

        const supplyUsd = row.supplyAssetsUsd ?? 0;
        if (supplyUsd > 0) {
          totalSupplyUsd += supplyUsd;
          allocations.push({ marketKey });
        }

        if (!marketsByKey.has(marketKey) && row.market) {
          const loanSymbol = row.market.loanAsset?.symbol;
          const collateralSymbol = row.market.collateralAsset?.symbol;
          marketsByKey.set(marketKey, {
            uniqueKey: marketKey,
            loanAsset: loanSymbol ? { symbol: loanSymbol } : undefined,
            collateralAsset: collateralSymbol ? { symbol: collateralSymbol } : undefined,
            state: row.market.state
              ? {
                  utilization: row.market.state.utilization ?? undefined,
                  supplyAssetsUsd: row.market.state.supplyAssetsUsd ?? undefined,
                  borrowAssetsUsd: row.market.state.borrowAssetsUsd ?? undefined,
                  supplyApy: row.market.state.supplyApy ?? undefined,
                  borrowApy: row.market.state.borrowApy ?? undefined,
                  rewards:
                    row.market.state.rewards?.map((r) => ({
                      supplyApr: r?.supplyApr ?? undefined,
                    })) ?? undefined,
                }
              : undefined,
          });
        }
      }

      vaultAllocations.push({
        address: vault.address,
        totalSupplyUsd,
        allocations,
      });
    }

    const response: MarketsSuppliedResponse = {
      markets: Array.from(marketsByKey.values()),
      vaultAllocations,
    };

    const headers = new Headers(rateLimitResult.headers);
    headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    return NextResponse.json(response, { headers });
  } catch (err) {
    const { error, statusCode } = handleApiError(err, 'Failed to fetch markets supplied data');
    return NextResponse.json(error, { status: statusCode });
  }
}
