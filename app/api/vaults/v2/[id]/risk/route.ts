import { NextRequest, NextResponse } from 'next/server';
import { gql } from 'graphql-request';
import { getAddress, isAddress } from 'viem';
import { morphoGraphQLClient } from '@/lib/morpho/graphql-client';
import { getVaultByAddress } from '@/lib/config/vaults';
import { handleApiError, AppError } from '@/lib/utils/error-handler';
import { createRateLimitMiddleware, RATE_LIMIT_REQUESTS_PER_MINUTE, MINUTE_MS } from '@/lib/utils/rate-limit';
import { BASE_CHAIN_ID } from '@/lib/constants';
import { fetchV1VaultMarkets, type V1VaultMarketData } from '@/lib/morpho/query-v1-vault-markets';
import {
  computeV1MarketRiskScores,
  isMarketIdle,
  type MarketRiskGrade,
  type MarketRiskScores,
} from '@/lib/morpho/compute-v1-market-risk';
import { getIRMTargetUtilizationWithFallback } from '@/lib/morpho/irm-utils';
import {
  getOracleTimestampData,
  getOracleFeedHintsFromMarket,
  type OracleTimestampData,
} from '@/lib/morpho/oracle-utils';
import type { Address } from 'viem';

type AdapterType = 'MetaMorphoAdapter' | 'MorphoMarketV1Adapter' | 'Unknown';

type GraphAdapter = {
  __typename?: string | null;
  address: string;
  assetsUsd: number | null;
  assets: string | null;
  type: AdapterType;
  factory?: { address?: string | null } | null;
  metaMorpho?: {
    address?: string | null;
    name?: string | null;
    symbol?: string | null;
    state?: { apy?: number | null; netApy?: number | null; weeklyNetApy?: number | null } | null;
  } | null;
  positions?: {
    items: Array<{
      state?: {
        supplyAssets?: string | null;
        supplyAssetsUsd?: number | null;
        borrowAssetsUsd?: number | null;
        collateralAssetsUsd?: number | null;
        liquidityAssetsUsd?: number | null;
        utilization?: number | null;
      } | null;
      market: V1VaultMarketData;
    } | null>;
  } | null;
};

type GraphVaultResponse = {
  vault?: {
    address?: string | null;
    totalAssetsUsd?: number | null;
    avgNetApy?: number | null;
    idleAssets?: string | number | null;
    idleAssetsUsd?: number | null;
    liquidityUsd?: number | null;
    asset?: { symbol?: string; decimals?: number } | null;
    liquidityAdapter?: { address?: string | null } | null;
    adapters?: {
      items?: Array<GraphAdapter | null> | null;
    } | null;
  } | null;
};

export type V2MarketRiskData = {
  market: V1VaultMarketData;
  scores: MarketRiskScores | null;
  allocationUsd: number;
  allocationAssets: string | null;
  oracleTimestampData?: OracleTimestampData | null;
};

export type V2UnderlyingVault = {
  address: string;
  name: string | null;
  symbol: string | null;
};

export type V2AdapterRiskData = {
  adapterAddress: string;
  adapterType: AdapterType;
  adapterLabel: string;
  allocationUsd: number;
  allocationAssets: string | null;
  riskScore: number;
  riskGrade: MarketRiskGrade;
  markets: V2MarketRiskData[];
  isLiquidityAdapter?: boolean;
  underlyingVault?: V2UnderlyingVault | null;
  underlyingVaultAddress?: string | null;
  /** Vault or position net APY (0–1, Morpho API scale). */
  apy?: number | null;
};

export type V2IdleAllocation = {
  assetsUsd: number;
  assets: string | null;
};

export type V2VaultRiskResponse = {
  vaultAddress: string;
  totalAdapterAssetsUsd: number;
  vaultRiskScore: number;
  vaultRiskGrade: MarketRiskGrade;
  vaultAsset: { symbol: string; decimals: number } | null;
  liquidityAdapterAddress: string | null;
  /** Assets held in the vault contract, not deployed to any adapter */
  idle: V2IdleAllocation;
  adapters: V2AdapterRiskData[];
  /** V2 vault net APY (0–1). */
  vaultNetApy?: number | null;
};

const VAULT_V2_RISK_QUERY = gql`
  query VaultV2Risk($address: String!, $chainId: Int!, $adapterLimit: Int!, $positionLimit: Int!) {
    vault: vaultV2ByAddress(address: $address, chainId: $chainId) {
      address
      totalAssetsUsd
      avgNetApy
      idleAssets
      idleAssetsUsd
      liquidityUsd
      asset { symbol decimals }
      liquidityAdapter { address }
      adapters(first: $adapterLimit) {
        items {
          __typename
          address
          assets
          assetsUsd
          type
          ... on MetaMorphoAdapter {
            metaMorpho {
              address
              name
              symbol
              state { apy netApy weeklyNetApy }
            }
          }
          ... on MorphoMarketV1Adapter {
            positions(first: $positionLimit) {
              items {
                state {
                  supplyAssets
                  supplyAssetsUsd
                }
                market {
                  id
                  marketId
                  loanAsset { symbol decimals address }
                  collateralAsset { symbol decimals address }
                  oracleAddress
                  oracle {
                    id
                    address
                    type
                    data {
                      ... on MorphoChainlinkOracleV2Data {
                        baseFeedOne { address }
                        baseFeedTwo { address }
                        quoteFeedOne { address }
                        quoteFeedTwo { address }
                      }
                      ... on MorphoChainlinkOracleData {
                        baseFeedOne { address }
                        baseFeedTwo { address }
                        quoteFeedOne { address }
                        quoteFeedTwo { address }
                      }
                    }
                  }
                  irmAddress
                  lltv
                  realizedBadDebt { usd }
                  state {
                    supplyAssetsUsd
                    borrowAssetsUsd
                    collateralAssetsUsd
                    liquidityAssetsUsd
                    utilization
                    supplyApy
                    borrowApy
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

/** Underlying V1 vault yield for Supply APY column (Morpho state.apy = supply-side vault APY). */
function pickUnderlyingVaultSupplyApy(state?: {
  apy?: number | null;
  netApy?: number | null;
  weeklyNetApy?: number | null;
} | null): number | null {
  if (state?.apy != null && Number.isFinite(state.apy)) return state.apy;
  if (state?.netApy != null && Number.isFinite(state.netApy)) return state.netApy;
  if (state?.weeklyNetApy != null && Number.isFinite(state.weeklyNetApy)) return state.weeklyNetApy;
  return null;
}

function weightedMarketSupplyApy(
  markets: Array<{ allocationUsd?: number; market?: { state?: { supplyApy?: number | null } | null } }>
): number | null {
  const totalAlloc = markets.reduce((s, m) => s + (m.allocationUsd ?? 0), 0);
  if (totalAlloc <= 0) return null;
  const weighted = markets.reduce(
    (s, m) => s + ((m.market?.state?.supplyApy ?? 0) * (m.allocationUsd ?? 0)),
    0
  );
  return weighted / totalAlloc;
}

function getGradeFromScore(score: number): MarketRiskGrade {
  if (score >= 93) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 87) return 'A−';
  if (score >= 84) return 'B+';
  if (score >= 80) return 'B';
  if (score >= 77) return 'B−';
  if (score >= 74) return 'C+';
  if (score >= 70) return 'C';
  if (score >= 65) return 'C−';
  if (score >= 60) return 'D';
  return 'F';
}

function normalizeAdapterMarket(
  market: V1VaultMarketData & { marketId?: string }
): V1VaultMarketData {
  return {
    ...market,
    uniqueKey: market.uniqueKey || market.marketId || market.id,
    marketTotalSupplyUsd:
      market.marketTotalSupplyUsd ?? market.state?.supplyAssetsUsd ?? null,
  };
}

async function buildMarketRisk(
  market: V1VaultMarketData & { marketId?: string },
  supplyUsd: number | null | undefined,
  supplyAssets?: string | null
): Promise<V2MarketRiskData> {
  const normalizedMarket = normalizeAdapterMarket(market);

  const [oracleTimestampData, targetUtilization] = await Promise.all([
    getOracleTimestampData(
      normalizedMarket.oracleAddress
        ? (normalizedMarket.oracleAddress as Address)
        : null,
      getOracleFeedHintsFromMarket(normalizedMarket)
    ),
    getIRMTargetUtilizationWithFallback(
      market.irmAddress ? (market.irmAddress as Address) : null
    ),
  ]);

  const computedScores = isMarketIdle(normalizedMarket)
    ? null
    : await computeV1MarketRiskScores(
      normalizedMarket,
      oracleTimestampData,
      targetUtilization
    );

  const allocationAssets =
    supplyAssets ?? normalizedMarket.vaultSupplyAssets ?? null;

  return {
    market: normalizedMarket,
    scores: computedScores,
    allocationUsd: supplyUsd ?? 0,
    allocationAssets,
    oracleTimestampData,
  };
}

async function computeAdapterRisk(
  adapter: GraphAdapter,
  chainId: number,
  liquidityAdapterAddress: string | null
): Promise<V2AdapterRiskData | null> {
  const allocationUsd = adapter.assetsUsd ?? 0;
  const isLiquidityAdapter =
    liquidityAdapterAddress !== null &&
    adapter.address.toLowerCase() === liquidityAdapterAddress.toLowerCase();

  if (adapter.__typename === 'MetaMorphoAdapter' && adapter.metaMorpho?.address) {
    const { markets } = await fetchV1VaultMarkets(adapter.metaMorpho.address, chainId);
    const marketRisks = await Promise.all(
      markets.map((m) => buildMarketRisk(m, m.vaultSupplyAssetsUsd ?? 0, m.vaultSupplyAssets ?? null))
    );

    const { weightedScore, grade } = computeWeightedRisk(marketRisks);
    const vaultName = adapter.metaMorpho.name ?? adapter.metaMorpho.symbol ?? 'MetaMorpho Vault';
    const apy = pickUnderlyingVaultSupplyApy(adapter.metaMorpho.state);

    return {
      adapterAddress: adapter.address,
      adapterType: 'MetaMorphoAdapter',
      adapterLabel: vaultName,
      allocationUsd,
      allocationAssets: adapter.assets ?? null,
      riskScore: weightedScore,
      riskGrade: grade,
      apy,
      markets: [],
      underlyingVault: {
        address: adapter.metaMorpho.address,
        name: adapter.metaMorpho.name ?? null,
        symbol: adapter.metaMorpho.symbol ?? null,
      },
      underlyingVaultAddress: adapter.metaMorpho.address,
    };
  }

  if (adapter.__typename === 'MorphoMarketV1Adapter') {
    const positions = adapter.positions?.items?.filter(Boolean) ?? [];
    if (positions.length === 0) {
      return {
        adapterAddress: adapter.address,
        adapterType: 'MorphoMarketV1Adapter',
        adapterLabel: 'Morpho Market Adapter',
        allocationUsd,
        allocationAssets: adapter.assets ?? null,
        riskScore: 0,
        riskGrade: 'F',
        markets: [],
        isLiquidityAdapter,
      };
    }

    const marketRisks = await Promise.all(
      positions.map((pos) =>
        buildMarketRisk(
          pos!.market,
          pos!.state?.supplyAssetsUsd ?? 0,
          pos!.state?.supplyAssets ?? null
        )
      )
    );

    const { weightedScore, grade } = computeWeightedRisk(marketRisks);
    const apy = weightedMarketSupplyApy(marketRisks);

    return {
      adapterAddress: adapter.address,
      adapterType: 'MorphoMarketV1Adapter',
      adapterLabel: 'Morpho Market Adapter',
      allocationUsd,
      allocationAssets: adapter.assets ?? null,
      riskScore: weightedScore,
      riskGrade: grade,
      apy,
      markets: marketRisks,
      isLiquidityAdapter,
    };
  }

  return null;
}

function computeWeightedRisk(markets: V2MarketRiskData[]): { weightedScore: number; grade: MarketRiskGrade } {
  let weightedSum = 0;
  let totalWeight = 0;

  markets.forEach((m) => {
    if (m.scores && !isMarketIdle(m.market) && m.allocationUsd > 0) {
      weightedSum += m.scores.marketRiskScore * m.allocationUsd;
      totalWeight += m.allocationUsd;
    }
  });

  const weightedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return {
    weightedScore,
    grade: getGradeFromScore(weightedScore),
  };
}

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

    const data = await morphoGraphQLClient.request<GraphVaultResponse>(
      VAULT_V2_RISK_QUERY,
      {
        address,
        chainId: cfg.chainId ?? BASE_CHAIN_ID,
        adapterLimit: 20,
        positionLimit: 20,
      }
    );

    if (!data.vault) {
      throw new AppError('Vault not found in Morpho API', 404, 'VAULT_NOT_FOUND');
    }

    const adapters = data.vault.adapters?.items?.filter((a): a is GraphAdapter => Boolean(a)) ?? [];
    const liquidityAdapterAddress = data.vault.liquidityAdapter?.address ?? null;

    const adapterRisks = (
      await Promise.all(
        adapters.map((adapter) =>
          computeAdapterRisk(adapter, cfg.chainId, liquidityAdapterAddress)
        )
      )
    ).filter((a): a is V2AdapterRiskData => a !== null);

    const totalAdapterAssetsUsd = adapterRisks.reduce(
      (sum, a) => sum + (a.allocationUsd ?? 0),
      0
    );

    // Calculate weighted risk score in a single reduce pass
    const vaultWeightedSum = adapterRisks.reduce((sum, adapter) => {
      if (adapter.allocationUsd > 0) {
        return sum + adapter.riskScore * adapter.allocationUsd;
      }
      return sum;
    }, 0);

    const vaultRiskScore =
      totalAdapterAssetsUsd > 0 ? vaultWeightedSum / totalAdapterAssetsUsd : 0;

    const vaultAsset = data.vault?.asset
      ? { symbol: data.vault.asset.symbol ?? 'UNKNOWN', decimals: data.vault.asset.decimals ?? 18 }
      : null;

    const idleAssetsUsd = data.vault.idleAssetsUsd ?? 0;
    const idleAssets =
      data.vault.idleAssets != null ? String(data.vault.idleAssets) : null;

    const response: V2VaultRiskResponse = {
      vaultAddress: address,
      totalAdapterAssetsUsd,
      vaultRiskScore,
      vaultRiskGrade: getGradeFromScore(vaultRiskScore),
      vaultAsset,
      liquidityAdapterAddress,
      idle: {
        assetsUsd: idleAssetsUsd,
        assets: idleAssets,
      },
      vaultNetApy: data.vault.avgNetApy ?? null,
      adapters: adapterRisks,
    };

    const responseHeaders = new Headers(rateLimitResult.headers);
    responseHeaders.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');

    return NextResponse.json(response, { headers: responseHeaders });
  } catch (error) {
    const { error: apiError, statusCode } = handleApiError(error);
    return NextResponse.json(apiError, { status: statusCode });
  }
}

