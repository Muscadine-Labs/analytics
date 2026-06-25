import { NextResponse } from 'next/server';
import { vaultAddresses } from '@/lib/config/vaults';
import { BASE_CHAIN_ID, BPS_PER_ONE, getScanUrlForChain, GRAPHQL_FIRST_LIMIT } from '@/lib/constants';
import { handleApiError } from '@/lib/utils/error-handler';
import { createRateLimitMiddleware, RATE_LIMIT_REQUESTS_PER_MINUTE, MINUTE_MS } from '@/lib/utils/rate-limit';
import { morphoGraphQLClient } from '@/lib/morpho/graphql-client';
import { gql } from 'graphql-request';
import { getAddress } from 'viem';
import { logger } from '@/lib/utils/logger';

// Ensure Node.js runtime for API routes (required for external API calls)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Rate limiting
  const rateLimitMiddleware = createRateLimitMiddleware(
    RATE_LIMIT_REQUESTS_PER_MINUTE,
    MINUTE_MS
  );
  const rateLimitResult = rateLimitMiddleware(request);
  
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { 
        status: 429,
        headers: rateLimitResult.headers,
      }
    );
  }

  try {
    const addresses = vaultAddresses.map(v => getAddress(v.address));
    const configuredAddressSet = new Set(addresses.map((a) => a.toLowerCase()));

    const v2VaultPromises = addresses.map(async (address) => {
      try {
        const v2Query = gql`
          query FetchV2Vault($address: String!, $chainId: Int!) {
            vaultV2ByAddress(address: $address, chainId: $chainId) {
              address
              name
              symbol
              listed
              asset { address symbol decimals }
              performanceFee
              totalAssetsUsd
              avgNetApyExcludingRewards
              avgNetApy
              positions(first: ${GRAPHQL_FIRST_LIMIT}) {
                items { user { address } }
              }
            }
          }
        `;
        const result = await morphoGraphQLClient.request<{ vaultV2ByAddress?: { address: string; name: string; symbol?: string; listed?: boolean; asset?: { address?: string; symbol?: string; decimals?: number }; performanceFee?: number; totalAssetsUsd?: number; avgNetApyExcludingRewards?: number; avgNetApy?: number; positions?: { items?: Array<{ user?: { address?: string } | null } | null> | null } | null } | null }>(v2Query, { address, chainId: BASE_CHAIN_ID });
        
        const vaultData = result?.vaultV2ByAddress;
        
        if (vaultData && vaultData.address) {
          logger.debug('V2 vault found', {
            address: vaultData.address,
            name: vaultData.name,
            totalAssetsUsd: vaultData.totalAssetsUsd,
            avgNetApyExcludingRewards: vaultData.avgNetApyExcludingRewards,
          });
          return vaultData;
        }
        return null;
      } catch (error) {
        logger.debug('V2 vault query failed', {
          address,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    });

    const v2Results = await Promise.all(v2VaultPromises);
    const v2Vaults = v2Results.filter((v): v is NonNullable<typeof v> => v !== null);
    logger.debug('V2 vaults fetched', {
      found: v2Vaults.length,
      queried: v2Results.length,
    });

    const depositorsByVault: Record<string, Set<string>> = {};

    for (const v2Vault of v2Vaults) {
      if (!v2Vault.address) continue;
      const addr = v2Vault.address.toLowerCase();
      if (!depositorsByVault[addr]) {
        depositorsByVault[addr] = new Set<string>();
      }
      const positions = v2Vault.positions?.items || [];
      for (const pos of positions) {
        if (pos?.user?.address) {
          depositorsByVault[addr].add(pos.user.address.toLowerCase());
        }
      }
    }
    
    const depositorCounts: Record<string, number> = {};
    for (const [addr, users] of Object.entries(depositorsByVault)) {
      depositorCounts[addr] = users.size;
    }

    const addressToChainId = Object.fromEntries(
      vaultAddresses.map((v) => [v.address.toLowerCase(), v.chainId])
    );

    const getChainId = (addr: string) =>
      addressToChainId[addr.toLowerCase()] ?? BASE_CHAIN_ID;

    const merged = v2Vaults.map((v) => {
      const chainId = getChainId(v.address);
      return {
        id: v.address,
        address: v.address,
        name: v.name ?? 'Unknown Vault',
        symbol: v.symbol ?? v.asset?.symbol ?? 'UNKNOWN',
        asset: v.asset?.symbol ?? 'UNKNOWN',
        chainId,
        scanUrl: `${getScanUrlForChain(chainId)}/address/${v.address}`,
        performanceFeeBps:
          v.performanceFee != null ? Math.round(v.performanceFee * BPS_PER_ONE) : null,
        status: v.listed ? 'active' as const : 'paused' as const,
        riskTier: 'medium' as const,
        createdAt: new Date().toISOString(),
        tvl: v.totalAssetsUsd ?? null,
        apy: v.avgNetApy != null ? v.avgNetApy * 100 :
             v.avgNetApyExcludingRewards != null ? v.avgNetApyExcludingRewards * 100 : null,
        depositors: depositorCounts[v.address.toLowerCase()] ?? 0,
        revenueAllTime: null,
        feesAllTime: null,
        lastHarvest: null,
      };
    }).filter(v => configuredAddressSet.has(v.address.toLowerCase()));

    const responseHeaders = new Headers(rateLimitResult.headers);
    responseHeaders.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    return NextResponse.json(merged, { headers: responseHeaders });
  } catch (err) {
    const { error, statusCode } = handleApiError(err, 'Failed to fetch vaults');
    return NextResponse.json(error, { status: statusCode });
  }
}
