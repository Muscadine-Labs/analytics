import { NextResponse } from 'next/server';
import { gql } from 'graphql-request';
import { getAddress } from 'viem';
import { getVaultAddressesForProtocolStats } from '@/lib/config/vaults';
import { BASE_CHAIN_ID } from '@/lib/constants';
import { morphoGraphQLClient } from '@/lib/morpho/graphql-client';
import { handleApiError } from '@/lib/utils/error-handler';
import { createRateLimitMiddleware, RATE_LIMIT_REQUESTS_PER_MINUTE, MINUTE_MS } from '@/lib/utils/rate-limit';
import type { MarketsSuppliedResponse, SuppliedMarket } from '@/lib/hooks/useMarkets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADAPTER_LIMIT = 50;
const POSITION_LIMIT = 20;

type MarketState = {
  utilization?: number | null;
  supplyAssetsUsd?: number | null;
  borrowAssetsUsd?: number | null;
  supplyApy?: number | null;
  borrowApy?: number | null;
  rewards?: Array<{ supplyApr?: number | null } | null> | null;
};

type GraphMarket = {
  marketId?: string | null;
  loanAsset?: { symbol?: string | null } | null;
  collateralAsset?: { symbol?: string | null } | null;
  state?: MarketState | null;
};

type GraphPosition = {
  state?: { supplyAssetsUsd?: number | null } | null;
  market?: GraphMarket | null;
};

type GraphAdapter = {
  __typename?: string | null;
  assetsUsd?: number | null;
  positions?: { items?: Array<GraphPosition | null> | null } | null;
};

type GraphVault = {
  address?: string | null;
  adapters?: { items?: Array<GraphAdapter | null> | null } | null;
};

const MARKETS_SUPPLIED_V2_QUERY = gql`
  query MarketsSuppliedV2($address: String!, $chainId: Int!, $adapterLimit: Int!, $positionLimit: Int!) {
    vault: vaultV2ByAddress(address: $address, chainId: $chainId) {
      address
      adapters(first: $adapterLimit) {
        items {
          __typename
          assetsUsd
          ... on MorphoMarketV1Adapter {
            positions(first: $positionLimit) {
              items {
                state { supplyAssetsUsd }
                market {
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
    }
  }
`;

function toSuppliedMarket(market: GraphMarket, marketKey: string): SuppliedMarket {
  const loanSymbol = market.loanAsset?.symbol;
  const collateralSymbol = market.collateralAsset?.symbol;
  return {
    uniqueKey: marketKey,
    loanAsset: loanSymbol ? { symbol: loanSymbol } : undefined,
    collateralAsset: collateralSymbol ? { symbol: collateralSymbol } : undefined,
    state: market.state
      ? {
          utilization: market.state.utilization ?? undefined,
          supplyAssetsUsd: market.state.supplyAssetsUsd ?? undefined,
          borrowAssetsUsd: market.state.borrowAssetsUsd ?? undefined,
          supplyApy: market.state.supplyApy ?? undefined,
          borrowApy: market.state.borrowApy ?? undefined,
          rewards:
            market.state.rewards?.map((r) => ({
              supplyApr: r?.supplyApr ?? undefined,
            })) ?? undefined,
        }
      : undefined,
  };
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
    const vaultResults = await Promise.all(
      getVaultAddressesForProtocolStats().map(async (cfg) => {
        const address = getAddress(cfg.address);
        const data = await morphoGraphQLClient.request<{ vault?: GraphVault | null }>(
          MARKETS_SUPPLIED_V2_QUERY,
          {
            address,
            chainId: cfg.chainId ?? BASE_CHAIN_ID,
            adapterLimit: ADAPTER_LIMIT,
            positionLimit: POSITION_LIMIT,
          }
        );
        return { address, vault: data.vault };
      })
    );

    const marketsByKey = new Map<string, SuppliedMarket>();
    const vaultAllocations: MarketsSuppliedResponse['vaultAllocations'] = [];

    for (const { address, vault } of vaultResults) {
      const allocations: MarketsSuppliedResponse['vaultAllocations'][number]['allocations'] = [];
      let totalSupplyUsd = 0;

      const adapters = vault?.adapters?.items ?? [];
      for (const adapter of adapters) {
        if (!adapter) continue;
        const positions = adapter.positions?.items ?? [];
        for (const pos of positions) {
          const marketKey = pos?.market?.marketId;
          if (!marketKey || !pos.market) continue;

          const supplyUsd = pos.state?.supplyAssetsUsd ?? 0;
          if (supplyUsd > 0) {
            totalSupplyUsd += supplyUsd;
            allocations.push({ marketKey });
          }

          if (!marketsByKey.has(marketKey)) {
            marketsByKey.set(marketKey, toSuppliedMarket(pos.market, marketKey));
          }
        }
      }

      vaultAllocations.push({
        address,
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
