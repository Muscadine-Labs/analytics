import { NextResponse } from 'next/server';
import { gql } from 'graphql-request';
import { getAddress } from 'viem';
import { getVaultAddressesForProtocolStats } from '@/lib/config/vaults';
import { BASE_CHAIN_ID } from '@/lib/constants';
import { morphoGraphQLClient } from '@/lib/morpho/graphql-client';
import { mergeVaultAllocations, supplyAprFractionToPercentagePoints } from '@/lib/morpho/vault-summary';
import { handleApiError } from '@/lib/utils/error-handler';
import { createRateLimitMiddleware, RATE_LIMIT_REQUESTS_PER_MINUTE, MINUTE_MS } from '@/lib/utils/rate-limit';
import type { MarketsSuppliedResponse, SuppliedMarket } from '@/lib/hooks/useMarkets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADAPTER_LIMIT = 50;
const POSITION_PAGE_SIZE = 100;
const MAX_POSITION_PAGES = 20;

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
  address?: string | null;
  assetsUsd?: number | null;
  positions?: { items?: Array<GraphPosition | null> | null } | null;
};

type GraphVault = {
  address?: string | null;
  adapters?: { items?: Array<GraphAdapter | null> | null } | null;
};

const MARKETS_SUPPLIED_V2_QUERY = gql`
  query MarketsSuppliedV2(
    $address: String!
    $chainId: Int!
    $adapterLimit: Int!
    $positionLimit: Int!
    $positionSkip: Int!
  ) {
    vault: vaultV2ByAddress(address: $address, chainId: $chainId) {
      address
      adapters(first: $adapterLimit) {
        items {
          __typename
          address
          assetsUsd
          ... on MorphoMarketV1Adapter {
            positions(first: $positionLimit, skip: $positionSkip) {
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
              supplyAprPercent: supplyAprFractionToPercentagePoints(r?.supplyApr),
            })) ?? undefined,
        }
      : undefined,
  };
}

function adapterPositionCounts(vault: GraphVault | null | undefined): number[] {
  return (vault?.adapters?.items ?? []).map((adapter) => adapter?.positions?.items?.length ?? 0);
}

function appendAdapterPositions(target: GraphVault, page: GraphVault | null | undefined) {
  const existing = target.adapters?.items ?? [];
  for (const adapter of page?.adapters?.items ?? []) {
    if (!adapter?.address) continue;
    const match = existing.find(
      (item) => item?.address?.toLowerCase() === adapter.address?.toLowerCase()
    );
    const incoming = adapter.positions?.items ?? [];
    if (!match || incoming.length === 0) continue;
    match.positions = { items: [...(match.positions?.items ?? []), ...incoming] };
  }
}

async function fetchSuppliedVault(address: string, chainId: number): Promise<GraphVault | null> {
  const requestPage = (positionSkip: number) =>
    morphoGraphQLClient.request<{ vault?: GraphVault | null }>(MARKETS_SUPPLIED_V2_QUERY, {
      address,
      chainId,
      adapterLimit: ADAPTER_LIMIT,
      positionLimit: POSITION_PAGE_SIZE,
      positionSkip,
    });

  const first = await requestPage(0);
  const vault = first.vault ?? null;
  if (!vault) return null;

  let latestCounts = adapterPositionCounts(vault);
  for (let page = 1; page < MAX_POSITION_PAGES; page++) {
    if (!latestCounts.some((count) => count >= POSITION_PAGE_SIZE)) break;
    const next = await requestPage(page * POSITION_PAGE_SIZE);
    latestCounts = adapterPositionCounts(next.vault);
    appendAdapterPositions(vault, next.vault);
  }

  return vault;
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
        const vault = await fetchSuppliedVault(address, cfg.chainId ?? BASE_CHAIN_ID);
        return { address, vault };
      })
    );

    const marketsByKey = new Map<string, SuppliedMarket>();
    const vaultAllocations: MarketsSuppliedResponse['vaultAllocations'] = [];

    for (const { address, vault } of vaultResults) {
      const rawAllocations: MarketsSuppliedResponse['vaultAllocations'][number]['allocations'] = [];

      const adapters = vault?.adapters?.items ?? [];
      for (const adapter of adapters) {
        if (!adapter) continue;
        const positions = adapter.positions?.items ?? [];
        for (const pos of positions) {
          const marketKey = pos?.market?.marketId;
          if (!marketKey || !pos.market) continue;

          const supplyUsd = pos.state?.supplyAssetsUsd ?? 0;
          if (supplyUsd > 0) {
            rawAllocations.push({ marketKey, supplyUsd });
          }

          if (!marketsByKey.has(marketKey)) {
            marketsByKey.set(marketKey, toSuppliedMarket(pos.market, marketKey));
          }
        }
      }

      const allocations = mergeVaultAllocations(rawAllocations);
      const totalSupplyUsd = allocations.reduce((sum, allocation) => sum + allocation.supplyUsd, 0);

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
