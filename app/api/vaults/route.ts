import { NextResponse } from 'next/server';
import { vaultAddresses, withFeeWrapperLabel } from '@/lib/config/vaults';
import { BPS_PER_ONE, getScanUrlForChain } from '@/lib/constants';
import { handleApiError } from '@/lib/utils/error-handler';
import { createRateLimitMiddleware, RATE_LIMIT_REQUESTS_PER_MINUTE, MINUTE_MS } from '@/lib/utils/rate-limit';
import { morphoGraphQLClient } from '@/lib/morpho/graphql-client';
import { collectVaultV2DepositorAddresses } from '@/lib/morpho/v2-positions';
import {
  attachFeeWrappersToUnderlyings,
  feeWrapperLayerFromGraph,
  type FeeWrapperLayer,
} from '@/lib/morpho/fee-wrapper-layer';
import { gql } from 'graphql-request';
import { getAddress } from 'viem';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAULT_V2_LIST_QUERY = gql`
  query FetchV2Vault($address: String!, $chainId: Int!) {
    vaultV2ByAddress(address: $address, chainId: $chainId) {
      address
      name
      symbol
      listed
      asset { address symbol decimals }
      performanceFee
      managementFee
      totalAssetsUsd
      avgNetApyExcludingRewards
      avgNetApy
      adapters(first: 10) {
        items {
          __typename
          address
          type
          ... on MorphoVaultV2Adapter {
            innerVault {
              address
              name
              symbol
              avgNetApy
            }
          }
        }
      }
    }
  }
`;

type ListVaultRow = {
  id: string;
  address: string;
  name: string;
  symbol: string;
  asset: string;
  chainId: number;
  scanUrl: string;
  listCategory: (typeof vaultAddresses)[number]['listCategory'];
  kind: 'strategy' | 'feeWrapper';
  underlyingAddress: string | null;
  performanceFeeBps: number | null;
  status: 'active' | 'paused';
  riskTier: 'medium';
  tvl: number | null;
  apy: number | null;
  depositors: number;
  revenueAllTime: null;
  feesAllTime: null;
  lastHarvest: null;
  feeWrapper?: FeeWrapperLayer | null;
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
    const configuredAddressSet = new Set(vaultAddresses.map((v) => v.address.toLowerCase()));

    const results = await Promise.all(
      vaultAddresses.map(async (cfg) => {
        const address = getAddress(cfg.address);
        try {
          const [result, depositors] = await Promise.all([
            morphoGraphQLClient.request<{
              vaultV2ByAddress?: {
                address: string;
                name: string;
                symbol?: string;
                listed?: boolean;
                asset?: { address?: string; symbol?: string; decimals?: number };
                performanceFee?: number;
                managementFee?: number;
                totalAssetsUsd?: number;
                avgNetApyExcludingRewards?: number;
                avgNetApy?: number;
                adapters?: {
                  items?: Array<{
                    __typename?: string | null;
                    address?: string | null;
                    type?: string | null;
                    innerVault?: {
                      address?: string | null;
                      name?: string | null;
                      symbol?: string | null;
                      avgNetApy?: number | null;
                    } | null;
                  } | null> | null;
                } | null;
              } | null;
            }>(VAULT_V2_LIST_QUERY, { address, chainId: cfg.chainId }),
            collectVaultV2DepositorAddresses(address, cfg.chainId),
          ]);

          const vaultData = result.vaultV2ByAddress;
          if (!vaultData?.address) {
            return null;
          }

          const kind = cfg.kind ?? 'strategy';
          const feeWrapper =
            kind === 'feeWrapper'
              ? feeWrapperLayerFromGraph(vaultData.address, vaultData)
              : null;
          if (feeWrapper) {
            feeWrapper.depositors = depositors.size;
          }

          const row: ListVaultRow = {
            id: vaultData.address,
            address: vaultData.address,
            name: withFeeWrapperLabel(vaultData.name ?? 'Unknown Vault', vaultData.address),
            symbol: vaultData.symbol ?? vaultData.asset?.symbol ?? 'UNKNOWN',
            asset: vaultData.asset?.symbol ?? 'UNKNOWN',
            chainId: cfg.chainId,
            scanUrl: `${getScanUrlForChain(cfg.chainId)}/address/${vaultData.address}`,
            listCategory: cfg.listCategory,
            kind,
            underlyingAddress: cfg.underlyingAddress ?? feeWrapper?.innerVault?.address ?? null,
            performanceFeeBps:
              vaultData.performanceFee != null
                ? Math.round(vaultData.performanceFee * BPS_PER_ONE)
                : null,
            status: kind === 'feeWrapper' || vaultData.listed ? ('active' as const) : ('paused' as const),
            riskTier: 'medium' as const,
            tvl: vaultData.totalAssetsUsd ?? null,
            apy:
              vaultData.avgNetApy != null
                ? vaultData.avgNetApy * 100
                : vaultData.avgNetApyExcludingRewards != null
                  ? vaultData.avgNetApyExcludingRewards * 100
                  : null,
            depositors: depositors.size,
            revenueAllTime: null,
            feesAllTime: null,
            lastHarvest: null,
            feeWrapper,
          };
          return row;
        } catch (error) {
          logger.debug('V2 vault query failed', {
            address,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      })
    );

    const fetched = results.filter((v): v is NonNullable<typeof v> => v !== null);
    const wrapperLayers = new Map<string, FeeWrapperLayer>();
    for (const row of fetched) {
      if (row.kind === 'feeWrapper' && row.feeWrapper) {
        wrapperLayers.set(row.address.toLowerCase(), row.feeWrapper);
      }
    }

    const merged = attachFeeWrappersToUnderlyings(fetched, wrapperLayers).filter((v) =>
      configuredAddressSet.has(v.address.toLowerCase())
    );

    const responseHeaders = new Headers(rateLimitResult.headers);
    responseHeaders.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    return NextResponse.json(merged, { headers: responseHeaders });
  } catch (err) {
    const { error, statusCode } = handleApiError(err, 'Failed to fetch vaults');
    return NextResponse.json(error, { status: statusCode });
  }
}
