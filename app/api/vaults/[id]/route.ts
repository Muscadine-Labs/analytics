import { NextRequest, NextResponse } from 'next/server';
import { getVaultByAddress } from '@/lib/config/vaults';
import { BPS_PER_ONE, GRAPHQL_TRANSACTIONS_LIMIT, getScanUrlForChain } from '@/lib/constants';
import { handleApiError, AppError } from '@/lib/utils/error-handler';
import { createRateLimitMiddleware, RATE_LIMIT_REQUESTS_PER_MINUTE, MINUTE_MS } from '@/lib/utils/rate-limit';
import { morphoGraphQLClient } from '@/lib/morpho/graphql-client';
import { collectVaultV2DepositorAddresses } from '@/lib/morpho/v2-positions';
import { gql } from 'graphql-request';
import { getAddress, isAddress } from 'viem';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type V2VaultDetail = {
  address?: string;
  name?: string | null;
  symbol?: string | null;
  listed?: boolean | null;
  metadata?: {
    description?: string | null;
    image?: string | null;
  } | null;
  asset?: { address?: string; symbol?: string; decimals?: number } | null;
  totalAssets?: string | number | null;
  totalAssetsUsd?: number | null;
  performanceFee?: number | null;
  managementFee?: number | null;
  maxApy?: number | null;
  avgNetApyExcludingRewards?: number | null;
  avgNetApy?: number | null;
  curator?: { address?: string | null } | null;
  owner?: { address?: string | null } | null;
  rewards?: Array<{
    asset?: { address?: string; chain?: { id?: number } | null } | null;
    supplyApr?: number | null;
  }>;
};

type TxItem = {
  blockNumber?: number | null;
  txHash?: string | null;
  type?: string | null;
  data?: { sender?: string | null; onBehalf?: string | null; receiver?: string | null } | null;
};

const VAULT_V2_DETAIL_QUERY = gql`
  query VaultV2Detail($address: String!, $chainId: Int!) {
    vaultV2ByAddress(address: $address, chainId: $chainId) {
      address
      name
      symbol
      listed
      metadata {
        description
        image
      }
      asset { address symbol decimals }
      curator { address }
      owner { address }
      totalAssets
      totalAssetsUsd
      totalSupply
      performanceFee
      managementFee
      maxApy
      avgNetApyExcludingRewards
      avgNetApy
      rewards {
        asset { address chain { id } }
        supplyApr
      }
    }
    txs: vaultV2transactions(
      first: ${GRAPHQL_TRANSACTIONS_LIMIT},
      orderBy: Time,
      orderDirection: Desc,
      where: { vaultAddress_in: [$address], chainId_in: [$chainId] }
    ) {
      items {
        blockNumber
        txHash
        type
        data {
          ... on VaultV2DepositData { sender onBehalf }
          ... on VaultV2WithdrawData { sender receiver onBehalf }
        }
      }
    }
  }
`;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;

    let address: string;
    if (isAddress(id)) {
      address = getAddress(id);
    } else {
      const cfg = getVaultByAddress(id);
      if (!cfg) {
        throw new AppError('Vault not found', 404, 'VAULT_NOT_FOUND');
      }
      address = getAddress(cfg.address);
    }

    const cfg = getVaultByAddress(address);
    if (!cfg) {
      throw new AppError('Vault not found in configuration', 404, 'VAULT_NOT_FOUND');
    }

    const data = await morphoGraphQLClient.request<{
      vaultV2ByAddress?: V2VaultDetail | null;
      txs?: { items?: Array<TxItem | null> | null } | null;
    }>(VAULT_V2_DETAIL_QUERY, {
      address,
      chainId: cfg.chainId,
    });

    const mv = data.vaultV2ByAddress;
    if (!mv) {
      throw new AppError('Vault not found in Morpho API', 404, 'VAULT_NOT_FOUND');
    }

    const depositorAddresses = await collectVaultV2DepositorAddresses(address, cfg.chainId);
    const txs = (data.txs?.items ?? []).filter((t): t is TxItem => t !== null);

    const tvlUsd = mv.totalAssetsUsd ?? null;
    const totalAssetsRaw = mv.totalAssets != null ? String(mv.totalAssets) : null;
    const apyPct =
      mv.avgNetApy != null ? mv.avgNetApy * 100 :
      mv.avgNetApyExcludingRewards != null ? mv.avgNetApyExcludingRewards * 100 :
      mv.maxApy != null ? mv.maxApy * 100 : null;
    const apyBasePct =
      mv.avgNetApyExcludingRewards != null ? mv.avgNetApyExcludingRewards * 100 :
      mv.maxApy != null ? mv.maxApy * 100 : null;
    const apyBoostedPct = mv.avgNetApy != null ? mv.avgNetApy * 100 : null;
    const performanceFeeBps =
      mv.performanceFee != null ? Math.round(mv.performanceFee * BPS_PER_ONE) : null;
    const managementFeeBps =
      mv.managementFee != null ? Math.round(mv.managementFee * BPS_PER_ONE) : null;

    const result = {
      address,
      chainId: cfg.chainId,
      scanUrl: `${getScanUrlForChain(cfg.chainId)}/address/${address}`,
      listCategory: cfg.listCategory,
      name: mv.name ?? 'Unknown Vault',
      symbol: mv.symbol ?? mv.asset?.symbol ?? 'UNKNOWN',
      asset: mv.asset?.symbol ?? 'UNKNOWN',
      assetDecimals: mv.asset?.decimals ?? null,
      tvl: tvlUsd,
      totalAssets: totalAssetsRaw,
      apy: apyPct,
      apyBase: apyBasePct,
      apyBoosted: apyBoostedPct,
      feesYtd: null,
      utilization: 0,
      depositors: depositorAddresses.size,
      revenueAllTime: null,
      feesAllTime: null,
      lastHarvest: null,
      status: mv.listed ? 'active' as const : 'paused' as const,
      riskTier: 'medium' as const,
      apyBreakdown: {
        apy: (mv.avgNetApyExcludingRewards ?? mv.maxApy) != null
          ? (mv.avgNetApyExcludingRewards ?? mv.maxApy ?? 0) * 100
          : null,
        netApy: mv.avgNetApy != null ? mv.avgNetApy * 100 : null,
        netApyWithoutRewards: mv.avgNetApyExcludingRewards != null ? mv.avgNetApyExcludingRewards * 100 : null,
        avgApy: mv.avgNetApyExcludingRewards != null ? mv.avgNetApyExcludingRewards * 100 : null,
        avgNetApy: mv.avgNetApy != null ? mv.avgNetApy * 100 : null,
        dailyApy: null,
        dailyNetApy: null,
        weeklyApy: null,
        weeklyNetApy: null,
        monthlyApy: null,
        monthlyNetApy: null,
        underlyingYieldApr: null,
      },
      rewards: (mv.rewards || []).map((r) => ({
        assetAddress: r.asset?.address ?? '',
        chainId: r.asset?.chain?.id ?? null,
        supplyApr: r.supplyApr != null ? r.supplyApr * 100 : null,
        yearlySupplyTokens: null,
      })),
      metadata: mv.metadata || {},
      roles: {
        owner: mv.owner?.address ?? null,
        curator: mv.curator?.address ?? null,
      },
      transactions: txs.map((t) => ({
        blockNumber: t.blockNumber ?? 0,
        hash: t.txHash ?? '',
        type: t.type ?? '',
        userAddress: t.data?.onBehalf ?? t.data?.sender ?? null,
      })),
      parameters: {
        performanceFeeBps,
        performanceFeePercent: performanceFeeBps != null ? performanceFeeBps / 100 : null,
        managementFeeBps,
        managementFeePercent: managementFeeBps != null ? managementFeeBps / 100 : null,
        maxDeposit: null,
        maxWithdrawal: null,
        strategyNotes: '',
      },
    };

    const responseHeaders = new Headers(rateLimitResult.headers);
    responseHeaders.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    return NextResponse.json(result, { headers: responseHeaders });
  } catch (err) {
    const { error, statusCode } = handleApiError(err, 'Failed to fetch vault details');
    return NextResponse.json(error, { status: statusCode });
  }
}
