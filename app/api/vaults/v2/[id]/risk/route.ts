import { NextRequest, NextResponse } from 'next/server';
import { gql } from 'graphql-request';
import { getAddress, isAddress } from 'viem';
import { morphoGraphQLClient } from '@/lib/morpho/graphql-client';
import { getVaultByAddress } from '@/lib/config/vaults';
import { handleApiError, AppError } from '@/lib/utils/error-handler';
import { createRateLimitMiddleware, RATE_LIMIT_REQUESTS_PER_MINUTE, MINUTE_MS } from '@/lib/utils/rate-limit';
import { BASE_CHAIN_ID } from '@/lib/constants';
import { fetchV1VaultMarkets, type V1VaultMarketData } from '@/lib/morpho/query-v1-vault-markets';
import { parseRawTokenAmount } from '@/lib/format/number';
import { resolveMarketId } from '@/lib/morpho/market-id';
import {
  isMorphoVaultV2Adapter,
  mergeUnderlyingVaultInfo,
  underlyingVaultLabel,
  UNDERLYING_VAULT_FALLBACK,
} from '@/lib/morpho/vault-v2-adapter';
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

type AdapterType = 'MetaMorphoAdapter' | 'MorphoMarketV1Adapter' | 'MorphoVaultV2Adapter' | 'Unknown';

type GraphAdapter = {
  __typename?: string | null;
  address: string;
  assetsUsd: number | null;
  assets: string | null;
  type: AdapterType;
  factory?: { address?: string | null } | null;
  innerVault?: {
    address?: string | null;
    name?: string | null;
    symbol?: string | null;
    avgNetApy?: number | null;
    liquidity?: string | number | null;
    liquidityUsd?: number | null;
  } | null;
  metaMorpho?: {
    address?: string | null;
    name?: string | null;
    symbol?: string | null;
    state?: { avgNetApyExcludingRewards?: number | null; netApy?: number | null; weeklyNetApy?: number | null } | null;
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
    liquidity?: string | number | null;
    liquidityUsd?: number | null;
    forceDeallocatableLiquidity?: string | number | null;
    forceDeallocatableLiquidityUsd?: number | null;
    asset?: { symbol?: string; decimals?: number } | null;
    liquidityAdapter?: { address?: string | null } | null;
    liquidityData?: {
      __typename?: string | null;
      market?: {
        marketId?: string | null;
        loanAsset?: { symbol?: string | null; decimals?: number | null } | null;
        collateralAsset?: { symbol?: string | null; decimals?: number | null } | null;
      } | null;
    } | null;
    caps?: {
      items?: Array<{
        type?: string | null;
        absoluteCap?: string | number | null;
        relativeCap?: string | number | null;
        allocation?: string | number | null;
        data?: {
          __typename?: string | null;
          adapterAddress?: string | null;
          market?: {
            id?: string | null;
            marketId?: string | null;
            loanAsset?: { symbol?: string | null; decimals?: number | null; address?: string | null } | null;
            collateralAsset?: { symbol?: string | null; decimals?: number | null; address?: string | null } | null;
            oracle?: { address?: string | null } | null;
            irmAddress?: string | null;
            lltv?: string | number | null;
            state?: {
              supplyAssetsUsd?: number | null;
              borrowAssetsUsd?: number | null;
              collateralAssetsUsd?: number | null;
              liquidityAssetsUsd?: number | null;
              utilization?: number | null;
              supplyApy?: number | null;
              borrowApy?: number | null;
            } | null;
          } | null;
        } | null;
      } | null> | null;
    } | null;
    adapters?: {
      items?: Array<GraphAdapter | null> | null;
    } | null;
  } | null;
};

export type V2LiquidityMarket = {
  marketId: string;
  label: string;
  collateralSymbol: string | null;
  loanSymbol: string | null;
};

export type V2MarketRiskData = {
  market: V1VaultMarketData;
  scores: MarketRiskScores | null;
  allocationUsd: number;
  allocationAssets: string | number | null;
  oracleTimestampData?: OracleTimestampData | null;
  /** Market absolute cap from vault caps (raw token amount). */
  absoluteCap?: string | null;
  /** Market relative cap from vault caps (1e18 = 100%). */
  relativeCap?: string | null;
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
  allocationAssets: string | number | null;
  riskScore: number;
  riskGrade: MarketRiskGrade;
  markets: V2MarketRiskData[];
  isLiquidityAdapter?: boolean;
  underlyingVault?: V2UnderlyingVault | null;
  underlyingVaultAddress?: string | null;
  /** Vault or position net APY (0–1, Morpho API scale). */
  apy?: number | null;
  /** Adapter absolute cap from vault caps (raw token amount). */
  absoluteCap?: string | null;
  /** Adapter relative cap from vault caps (1e18 = 100%). */
  relativeCap?: string | null;
};

export type V2IdleAllocation = {
  assetsUsd: number;
  assets: string | null;
};

export type V2LiquidityBreakdown = {
  idleUsd: number;
  liquidityAdapterUsd: number;
  forceDeallocatableUsd: number;
  totalUsd: number;
  /** Total withdrawable liquidity in vault asset smallest units. */
  totalAssets: string | null;
};

export type V2VaultRiskResponse = {
  vaultAddress: string;
  totalAdapterAssetsUsd: number;
  vaultRiskScore: number;
  vaultRiskGrade: MarketRiskGrade;
  vaultAsset: { symbol: string; decimals: number } | null;
  liquidityAdapterAddress: string | null;
  /** Designated liquidity routing market (from vault liquidityData). */
  liquidityMarket: V2LiquidityMarket | null;
  /** Assets held in the vault contract, not deployed to any adapter */
  idle: V2IdleAllocation;
  /** Withdrawable liquidity (idle + liquidity adapter + force deallocation). */
  liquidityUsd: number | null;
  liquidityBreakdown: V2LiquidityBreakdown | null;
  adapters: V2AdapterRiskData[];
  /** V2 vault net APY (0–1). */
  vaultNetApy?: number | null;
};

const ADAPTER_LIMIT = 50;
const CAP_LIMIT = 50;
const POSITION_LIMIT = 20;

const VAULT_V2_RISK_QUERY = gql`
  query VaultV2Risk($address: String!, $chainId: Int!, $adapterLimit: Int!, $positionLimit: Int!) {
    vault: vaultV2ByAddress(address: $address, chainId: $chainId) {
      address
      totalAssetsUsd
      avgNetApy
      idleAssets
      idleAssetsUsd
      liquidity
      liquidityUsd
      forceDeallocatableLiquidity
      forceDeallocatableLiquidityUsd
      asset { symbol decimals }
      liquidityAdapter { address }
      liquidityData {
        __typename
        ... on MarketV1LiquidityData {
          market {
            marketId
            loanAsset { symbol decimals }
            collateralAsset { symbol decimals }
          }
        }
      }
      adapters(first: $adapterLimit) {
        items {
          __typename
          address
          assets
          assetsUsd
          type
          ... on MorphoVaultV2Adapter {
            innerVault {
              address
              name
              symbol
              avgNetApy
              liquidity
              liquidityUsd
            }
          }
          ... on MetaMorphoAdapter {
            metaMorpho {
              address
              name
              symbol
              state {
                avgNetApyExcludingRewards
                netApy
                weeklyNetApy: avgNetApy(lookback: SEVEN_DAYS)
              }
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
                  marketId
                  chain { id }
                  loanAsset { symbol decimals address }
                  collateralAsset { symbol decimals address }
                  oracle {
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

const VAULT_V2_CAP_MARKETS_QUERY = gql`
  query VaultV2CapMarkets($address: String!, $chainId: Int!, $capLimit: Int!) {
    vault: vaultV2ByAddress(address: $address, chainId: $chainId) {
      caps(first: $capLimit) {
        items {
          type
          absoluteCap
          relativeCap
          allocation
          data {
            __typename
            ... on AdapterCapData {
              adapterAddress
            }
            ... on MarketV1CapData {
              adapterAddress
              market {
                marketId
                chain { id }
                loanAsset { symbol decimals address }
                collateralAsset { symbol decimals address }
                oracle {
                  address
                }
                irmAddress
                lltv
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
`;

/** Underlying V1 vault yield for Supply APY column (Morpho state.apy = supply-side vault APY). */
function pickUnderlyingVaultSupplyApy(state?: {
  avgNetApyExcludingRewards?: number | null;
  netApy?: number | null;
  weeklyNetApy?: number | null;
} | null): number | null {
  if (state?.avgNetApyExcludingRewards != null && Number.isFinite(state.avgNetApyExcludingRewards)) {
    return state.avgNetApyExcludingRewards;
  }
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
  market: V1VaultMarketData & {
    marketId?: string;
    oracle?: { address?: string | null } | null;
  }
): V1VaultMarketData {
  const oracleAddress = market.oracleAddress ?? market.oracle?.address ?? null;
  const marketKey = resolveMarketId(market);
  return {
    ...market,
    oracleAddress,
    uniqueKey: market.uniqueKey || marketKey,
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
    adapterAssetsString(supplyAssets) ??
    adapterAssetsString(normalizedMarket.vaultSupplyAssets);

  return {
    market: normalizedMarket,
    scores: computedScores,
    allocationUsd: supplyUsd ?? 0,
    allocationAssets,
    oracleTimestampData,
  };
}

function marketPairLabel(
  collateralSymbol?: string | null,
  loanSymbol?: string | null
): string | null {
  if (collateralSymbol && loanSymbol) return `${collateralSymbol}/${loanSymbol}`;
  return collateralSymbol ?? loanSymbol ?? null;
}

type GraphLiquidityData = NonNullable<GraphVaultResponse['vault']>['liquidityData'];

function parseLiquidityMarket(
  liquidityData: GraphLiquidityData | null | undefined
): V2LiquidityMarket | null {
  if (!liquidityData) return null;
  const market = liquidityData?.__typename === 'MarketV1LiquidityData'
    ? liquidityData.market
    : null;
  if (!market?.marketId) return null;

  const collateralSymbol = market.collateralAsset?.symbol ?? null;
  const loanSymbol = market.loanAsset?.symbol ?? null;

  return {
    marketId: market.marketId,
    label: marketPairLabel(collateralSymbol, loanSymbol) ?? market.marketId,
    collateralSymbol,
    loanSymbol,
  };
}

type GraphCapItem = NonNullable<
  NonNullable<NonNullable<GraphVaultResponse['vault']>['caps']>['items']
>[number];

type GraphCapMarket = NonNullable<
  NonNullable<NonNullable<GraphCapItem>['data']>['market']
> & {
  oracle?: { address?: string | null } | null;
};

function capMarketToV1Data(capMarket: GraphCapMarket | null | undefined): (V1VaultMarketData & { marketId?: string }) | null {
  if (!capMarket?.marketId) return null;

  const loan = capMarket.loanAsset;
  const collateral = capMarket.collateralAsset;
  if (!loan?.symbol || !collateral?.symbol) return null;

  const marketId = capMarket.marketId;

  return {
    id: marketId,
    uniqueKey: marketId,
    marketId,
    loanAsset: {
      symbol: loan.symbol,
      decimals: loan.decimals ?? 18,
      address: loan.address ?? '',
    },
    collateralAsset: {
      symbol: collateral.symbol,
      decimals: collateral.decimals ?? 18,
      address: collateral.address ?? '',
    },
    oracleAddress: capMarket.oracle?.address ?? null,
    oracle: null,
    irmAddress: capMarket.irmAddress ?? null,
    lltv: capMarket.lltv != null ? String(capMarket.lltv) : null,
    realizedBadDebt: null,
    state: capMarket.state
      ? {
          supplyAssetsUsd: capMarket.state.supplyAssetsUsd ?? null,
          borrowAssetsUsd: capMarket.state.borrowAssetsUsd ?? null,
          collateralAssetsUsd: capMarket.state.collateralAssetsUsd ?? null,
          liquidityAssetsUsd: capMarket.state.liquidityAssetsUsd ?? null,
          utilization: capMarket.state.utilization ?? null,
          supplyApy: capMarket.state.supplyApy ?? null,
          borrowApy: capMarket.state.borrowApy ?? null,
        }
      : null,
    vaultSupplyAssets: null,
    vaultSupplyAssetsUsd: null,
    vaultTotalAssetsUsd: null,
    marketTotalSupplyUsd: capMarket.state?.supplyAssetsUsd ?? null,
  };
}

function capAmountString(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '0';
  return typeof value === 'string' ? value : value.toString();
}

function capFieldsFromGraphCap(cap: NonNullable<GraphCapItem>): {
  absoluteCap: string;
  relativeCap: string;
} {
  return {
    absoluteCap: capAmountString(cap.absoluteCap),
    relativeCap: capAmountString(cap.relativeCap),
  };
}

function isMarketCapForAdapter(cap: GraphCapItem | null | undefined, adapterAddress: string): boolean {
  if (!cap) return false;
  const isMarketCap =
    cap.type === 'MarketV1' || cap.data?.__typename === 'MarketV1CapData';
  if (!isMarketCap) return false;

  const adapter = cap.data?.adapterAddress;
  return adapter?.toLowerCase() === adapterAddress.toLowerCase();
}

function marketRiskKey(market: V1VaultMarketData & { marketId?: string }): string {
  return (market.uniqueKey || resolveMarketId(market)).toLowerCase();
}

function findAdapterCap(
  adapterAddress: string,
  capItems: GraphCapItem[] | null | undefined
): { absoluteCap: string; relativeCap: string } | null {
  for (const cap of capItems ?? []) {
    if (!cap) continue;
    const isAdapterCap =
      cap.type === 'Adapter' || cap.data?.__typename === 'AdapterCapData';
    if (!isAdapterCap) continue;

    const capAdapterAddress = cap.data?.adapterAddress;
    if (capAdapterAddress?.toLowerCase() !== adapterAddress.toLowerCase()) continue;

    return capFieldsFromGraphCap(cap);
  }
  return null;
}

function adapterAssetsString(
  assets: string | number | null | undefined
): string | null {
  if (assets === null || assets === undefined) return null;
  const raw = parseRawTokenAmount(assets);
  if (raw == null) return null;
  return raw.toString();
}

async function mergeCapMarketsForAdapter(
  adapterAddress: string,
  existingMarkets: V2MarketRiskData[],
  capItems: GraphCapItem[] | null | undefined
): Promise<V2MarketRiskData[]> {
  const items = capItems ?? [];
  const byKey = new Map<string, V2MarketRiskData>();

  for (const entry of existingMarkets) {
    byKey.set(marketRiskKey(entry.market), entry);
  }

  for (const cap of items) {
    if (!cap || !isMarketCapForAdapter(cap, adapterAddress)) continue;

    const marketData = capMarketToV1Data(
      (cap.data as { market?: GraphCapMarket | null } | null | undefined)?.market
    );
    if (!marketData) continue;

    const key = marketRiskKey(marketData);
    const capFields = capFieldsFromGraphCap(cap);
    const existing = byKey.get(key);

    if (existing) {
      byKey.set(key, { ...existing, ...capFields });
      continue;
    }

    const allocation = adapterAssetsString(cap.allocation);

    byKey.set(
      key,
      {
        ...(await buildMarketRisk(
          marketData,
          0,
          allocation
        )),
        ...capFields,
      }
    );
  }

  return Array.from(byKey.values());
}

async function computeAdapterRisk(
  adapter: GraphAdapter,
  chainId: number,
  liquidityAdapterAddress: string | null,
  liquidityMarket: V2LiquidityMarket | null,
  capItems: GraphCapItem[] | null | undefined,
  wrapperVaultAddress: string
): Promise<V2AdapterRiskData | null> {
  const allocationUsd = adapter.assetsUsd ?? 0;
  const allocationAssets = adapterAssetsString(adapter.assets);
  const adapterCap = findAdapterCap(adapter.address, capItems);
  const adapterCapFields = {
    absoluteCap: adapterCap?.absoluteCap ?? null,
    relativeCap: adapterCap?.relativeCap ?? null,
  };
  const isLiquidityAdapter =
    liquidityAdapterAddress !== null &&
    adapter.address.toLowerCase() === liquidityAdapterAddress.toLowerCase();

  if (isMorphoVaultV2Adapter(adapter)) {
    const underlying = mergeUnderlyingVaultInfo(wrapperVaultAddress, adapter.innerVault);
    const apy =
      underlying?.avgNetApy != null && Number.isFinite(underlying.avgNetApy)
        ? underlying.avgNetApy
        : null;

    return {
      adapterAddress: adapter.address,
      adapterType: 'MorphoVaultV2Adapter',
      adapterLabel: underlyingVaultLabel(underlying, UNDERLYING_VAULT_FALLBACK),
      allocationUsd,
      allocationAssets,
      riskScore: 0,
      riskGrade: 'F',
      apy,
      markets: [],
      isLiquidityAdapter,
      underlyingVault: underlying
        ? {
            address: underlying.address,
            name: underlying.name,
            symbol: underlying.symbol,
          }
        : null,
      underlyingVaultAddress: underlying?.address ?? null,
      ...adapterCapFields,
    };
  }

  if (adapter.__typename === 'MetaMorphoAdapter' && adapter.metaMorpho?.address) {
    const { markets } = await fetchV1VaultMarkets(adapter.metaMorpho.address, chainId);
    const v2Allocated = allocationUsd > 0;
    const marketRisks = await Promise.all(
      markets.map((m) =>
        buildMarketRisk(
          m,
          v2Allocated ? (m.vaultSupplyAssetsUsd ?? 0) : 0,
          v2Allocated ? (m.vaultSupplyAssets ?? null) : null
        )
      )
    );

    const { weightedScore, grade } = computeWeightedRisk(marketRisks);
    const vaultName = adapter.metaMorpho.name ?? adapter.metaMorpho.symbol ?? 'MetaMorpho Vault';
    const apy = pickUnderlyingVaultSupplyApy(adapter.metaMorpho.state);

    return {
      adapterAddress: adapter.address,
      adapterType: 'MetaMorphoAdapter',
      adapterLabel: vaultName,
      allocationUsd,
      allocationAssets,
      riskScore: weightedScore,
      riskGrade: grade,
      apy,
      markets: marketRisks,
      underlyingVault: {
        address: adapter.metaMorpho.address,
        name: adapter.metaMorpho.name ?? null,
        symbol: adapter.metaMorpho.symbol ?? null,
      },
      underlyingVaultAddress: adapter.metaMorpho.address,
      ...adapterCapFields,
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
        allocationAssets,
        riskScore: 0,
        riskGrade: 'F',
        markets: [],
        isLiquidityAdapter,
        ...adapterCapFields,
      };
    }

    const marketRisks = await mergeCapMarketsForAdapter(
      adapter.address,
      await Promise.all(
        positions.map((pos) =>
          buildMarketRisk(
            pos!.market,
            pos!.state?.supplyAssetsUsd ?? 0,
            pos!.state?.supplyAssets ?? null
          )
        )
      ),
      capItems
    );

    const { weightedScore, grade } = computeWeightedRisk(marketRisks);
    const apy = weightedMarketSupplyApy(marketRisks);
    const adapterLabel =
      isLiquidityAdapter && liquidityMarket?.label
        ? liquidityMarket.label
        : 'Morpho Market Adapter';

    return {
      adapterAddress: adapter.address,
      adapterType: 'MorphoMarketV1Adapter',
      adapterLabel,
      allocationUsd,
      allocationAssets,
      riskScore: weightedScore,
      riskGrade: grade,
      apy,
      markets: marketRisks,
      isLiquidityAdapter,
      ...adapterCapFields,
    };
  }

  return null;
}

function sumTokenAmounts(
  a: string | number | null | undefined,
  b: string | number | null | undefined
): string | null {
  const left = parseRawTokenAmount(a);
  const right = parseRawTokenAmount(b);
  if (left == null && right == null) return null;
  return String((left ?? 0n) + (right ?? 0n));
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

    const [data, capData] = await Promise.all([
      morphoGraphQLClient.request<GraphVaultResponse>(VAULT_V2_RISK_QUERY, {
        address,
        chainId: cfg.chainId ?? BASE_CHAIN_ID,
        adapterLimit: ADAPTER_LIMIT,
        positionLimit: POSITION_LIMIT,
      }),
      morphoGraphQLClient.request<Pick<GraphVaultResponse, 'vault'>>(VAULT_V2_CAP_MARKETS_QUERY, {
        address,
        chainId: cfg.chainId ?? BASE_CHAIN_ID,
        capLimit: CAP_LIMIT,
      }),
    ]);

    if (!data.vault) {
      throw new AppError('Vault not found in Morpho API', 404, 'VAULT_NOT_FOUND');
    }

    const capItems = capData.vault?.caps?.items ?? [];
    const liquidityMarket = parseLiquidityMarket(data.vault.liquidityData ?? null);

    const adapters = data.vault.adapters?.items?.filter((a): a is GraphAdapter => Boolean(a)) ?? [];
    const liquidityAdapterAddress = data.vault.liquidityAdapter?.address ?? null;

    const adapterRisks = (
      await Promise.all(
        adapters.map((adapter) =>
          computeAdapterRisk(
            adapter,
            cfg.chainId,
            liquidityAdapterAddress,
            liquidityMarket,
            capItems,
            address
          )
        )
      )
    ).filter((a): a is V2AdapterRiskData => a !== null);

    const totalAdapterAssetsUsd = adapterRisks.reduce(
      (sum, a) => sum + (a.allocationUsd ?? 0),
      0
    );

    const scoredAllocationUsd = adapterRisks.reduce((sum, adapter) => {
      if (adapter.allocationUsd > 0 && adapter.markets.length > 0) {
        return sum + adapter.allocationUsd;
      }
      return sum;
    }, 0);

    const vaultWeightedSum = adapterRisks.reduce((sum, adapter) => {
      if (adapter.allocationUsd > 0 && adapter.markets.length > 0) {
        return sum + adapter.riskScore * adapter.allocationUsd;
      }
      return sum;
    }, 0);

    const vaultRiskScore =
      scoredAllocationUsd > 0 ? vaultWeightedSum / scoredAllocationUsd : 0;

    const vaultAsset = data.vault?.asset
      ? { symbol: data.vault.asset.symbol ?? 'UNKNOWN', decimals: data.vault.asset.decimals ?? 18 }
      : null;

    const idleAssetsUsd = data.vault.idleAssetsUsd ?? 0;
    const idleAssets = adapterAssetsString(data.vault.idleAssets);

    const baseLiquidityUsd = data.vault.liquidityUsd;
    const forceDeallocatableLiquidityUsd = data.vault.forceDeallocatableLiquidityUsd;
    const liquidityUsd =
      baseLiquidityUsd == null && forceDeallocatableLiquidityUsd == null
        ? null
        : (baseLiquidityUsd ?? 0) + (forceDeallocatableLiquidityUsd ?? 0);

    const baseLiquidity = data.vault.liquidity;
    const forceDeallocatableLiquidity = data.vault.forceDeallocatableLiquidity;
    const totalLiquidityAssets =
      baseLiquidity == null && forceDeallocatableLiquidity == null
        ? null
        : sumTokenAmounts(baseLiquidity, forceDeallocatableLiquidity);

    const liquidityBreakdown: V2LiquidityBreakdown | null =
      liquidityUsd == null
        ? null
        : {
            idleUsd: idleAssetsUsd,
            liquidityAdapterUsd: Math.max(0, (baseLiquidityUsd ?? 0) - idleAssetsUsd),
            forceDeallocatableUsd: forceDeallocatableLiquidityUsd ?? 0,
            totalUsd: liquidityUsd,
            totalAssets: totalLiquidityAssets,
          };

    const response: V2VaultRiskResponse = {
      vaultAddress: address,
      totalAdapterAssetsUsd,
      vaultRiskScore,
      vaultRiskGrade: getGradeFromScore(vaultRiskScore),
      vaultAsset,
      liquidityAdapterAddress,
      liquidityMarket,
      idle: {
        assetsUsd: idleAssetsUsd,
        assets: idleAssets,
      },
      liquidityUsd,
      liquidityBreakdown,
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

