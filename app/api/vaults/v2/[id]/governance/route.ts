import { NextRequest, NextResponse } from 'next/server';
import { gql } from 'graphql-request';
import { getAddress, isAddress } from 'viem';
import { morphoGraphQLClient } from '@/lib/morpho/graphql-client';
import { getVaultByAddress } from '@/lib/config/vaults';
import { handleApiError, AppError } from '@/lib/utils/error-handler';
import { createRateLimitMiddleware, RATE_LIMIT_REQUESTS_PER_MINUTE, MINUTE_MS } from '@/lib/utils/rate-limit';
import { BASE_CHAIN_ID } from '@/lib/constants';
import {
  enrichTimelocksWithAbdication,
  isHiddenTimelock,
} from '@/lib/morpho/vault-v2-timelocks';
import { isMorphoVaultV2Adapter, mergeUnderlyingVaultInfo } from '@/lib/morpho/vault-v2-adapter';

type GraphAdapter = {
  __typename?: 'MetaMorphoAdapter' | 'MorphoMarketV1Adapter' | 'MorphoVaultV2Adapter' | string | null;
  address?: string | null;
  type?: string | null;
  assets?: number | string | null;
  assetsUsd?: number | null;
  factory?: { address?: string | null } | null;
  innerVault?: { address?: string | null; name?: string | null; symbol?: string | null } | null;
  metaMorpho?: { address?: string | null; name?: string | null; symbol?: string | null } | null;
};

type GraphCap = {
  type?: string | null;
  absoluteCap?: string | number | null;
  relativeCap?: string | number | null;
  allocation?: string | number | null;
  data?: (
    | { __typename?: 'AdapterCapData'; adapterAddress?: string | null }
    | {
        __typename?: 'MarketV1CapData';
        adapterAddress?: string | null;
        market?: {
          marketId?: string | null;
          loanAsset?: { symbol?: string | null; decimals?: number | null } | null;
          collateralAsset?: { symbol?: string | null; decimals?: number | null } | null;
        } | null;
      }
    | {
        __typename?: 'CollateralCapData';
        collateralAddress?: string | null;
        collateralToken?: { symbol?: string | null; decimals?: number | null; address?: string | null } | null;
      }
    | { __typename?: string | null }
    | null
  ) | null;
};

type VaultAssetRef = { symbol?: string | null; decimals?: number | null } | null | undefined;

type GraphVaultGovernanceResponse = {
  vault?: {
    address?: string | null;
    idleAssets?: string | number | null;
    idleAssetsUsd?: number | null;
    owner?: { address?: string | null } | null;
    curator?: { address?: string | null } | null;
    allocators?: Array<{ allocator?: { address?: string | null } | null } | null> | null;
    sentinels?: Array<{ sentinel?: { address?: string | null } | null } | null> | null;
    liquidityAdapter?: GraphAdapter | null;
    liquidityData?: {
      __typename?: string | null;
      market?: {
        marketId?: string | null;
        loanAsset?: { symbol?: string | null; decimals?: number | null } | null;
        collateralAsset?: { symbol?: string | null; decimals?: number | null } | null;
      } | null;
    } | null;
    adapters?: { items?: Array<GraphAdapter | null> | null } | null;
    caps?: { items?: Array<GraphCap | null> | null } | null;
    timelocks?: Array<{ selector?: string | null; functionName?: string | null; duration?: number | string | null } | null> | null;
    asset?: VaultAssetRef;
  } | null;
};

export type VaultV2IdleAllocation = {
  assetsUsd: number;
  assets: string | null;
};

export type VaultV2GovernanceResponse = {
  vaultAddress: string;
  owner: string | null;
  curator: string | null;
  allocators: string[];
  sentinels: string[];
  liquidityAdapter: AdapterInfo | null;
  /** Designated liquidity routing market (from vault liquidityData). */
  liquidityMarket: GovernanceLiquidityMarket | null;
  idle: VaultV2IdleAllocation;
  adapters: AdapterInfo[];
  caps: CapInfo[];
  timelocks: TimelockInfo[];
  vaultAsset: { symbol: string; decimals: number } | null;
};

export type GovernanceLiquidityMarket = {
  marketId: string;
  label: string;
  collateralSymbol: string | null;
  loanSymbol: string | null;
};

export type AdapterInfo = {
  address: string;
  type: string;
  assets: number | null;
  assetsUsd: number | null;
  factoryAddress: string | null;
  metaMorpho?: { address: string | null; name: string | null; symbol: string | null } | null;
  underlying?: { address: string | null; name: string | null; symbol: string | null } | null;
};

export type CapInfo = {
  type: string;
  absoluteCap: string;
  relativeCap: string;
  allocation: string;
  adapterAddress?: string | null;
  marketKey?: string | null;
  collateralAddress?: string | null;
  /** e.g. cbDOGE/USDC or cbBTC */
  label?: string | null;
  loanSymbol?: string | null;
  collateralSymbol?: string | null;
  amountSymbol?: string | null;
  amountDecimals?: number | null;
};

export type TimelockInfo = {
  selector: string;
  functionName: string;
  durationSeconds: number;
  abdicated: boolean;
};

const ADAPTER_LIMIT = 50;

const VAULT_V2_GOVERNANCE_QUERY = gql`
  query VaultV2Governance($address: String!, $chainId: Int!, $adapterLimit: Int!) {
    vault: vaultV2ByAddress(address: $address, chainId: $chainId) {
      address
      asset { symbol decimals }
      idleAssets
      idleAssetsUsd
      owner { address }
      curator { address }
      allocators { allocator { address } }
      sentinels { sentinel { address } }
      liquidityAdapter {
        __typename
        address
        type
        assets
        assetsUsd
        ... on MetaMorphoAdapter {
          metaMorpho { address name symbol }
        }
        ... on MorphoVaultV2Adapter {
          innerVault { address name symbol }
        }
      }
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
          type
          assets
          assetsUsd
          ... on MetaMorphoAdapter {
            metaMorpho { address name symbol }
          }
          ... on MorphoVaultV2Adapter {
            innerVault { address name symbol }
          }
        }
      }
      caps(first: $adapterLimit) {
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
                loanAsset { symbol decimals }
                collateralAsset { symbol decimals }
              }
            }
            ... on CollateralCapData {
              collateralAddress
              collateralToken { symbol decimals address }
            }
          }
        }
      }
      timelocks {
        selector
        functionName
        duration
      }
    }
  }
`;

function mapAdapter(
  graph: GraphAdapter | null | undefined,
  wrapperVaultAddress?: string
): AdapterInfo | null {
  if (!graph?.address) return null;

  const underlyingMerged =
    wrapperVaultAddress && isMorphoVaultV2Adapter(graph)
      ? mergeUnderlyingVaultInfo(wrapperVaultAddress, graph.innerVault)
      : null;

  return {
    address: graph.address,
    type: graph.type ?? 'Unknown',
    assets:
      graph.assets === null || graph.assets === undefined
        ? null
        : typeof graph.assets === 'string'
        ? Number(graph.assets)
        : graph.assets,
    assetsUsd: graph.assetsUsd ?? null,
    factoryAddress: graph.factory?.address ?? null,
    metaMorpho: graph.__typename === 'MetaMorphoAdapter'
      ? {
          address: graph.metaMorpho?.address ?? null,
          name: graph.metaMorpho?.name ?? null,
          symbol: graph.metaMorpho?.symbol ?? null,
        }
      : null,
    underlying: isMorphoVaultV2Adapter(graph)
      ? {
          address: underlyingMerged?.address ?? graph.innerVault?.address ?? null,
          name: underlyingMerged?.name ?? graph.innerVault?.name ?? null,
          symbol: underlyingMerged?.symbol ?? graph.innerVault?.symbol ?? null,
        }
      : null,
  };
}

function marketPairLabel(
  collateralSymbol?: string | null,
  loanSymbol?: string | null
): string | null {
  if (collateralSymbol && loanSymbol) return `${collateralSymbol}/${loanSymbol}`;
  return collateralSymbol ?? loanSymbol ?? null;
}

type GraphLiquidityData = NonNullable<GraphVaultGovernanceResponse['vault']>['liquidityData'];

function parseLiquidityMarket(
  liquidityData: GraphLiquidityData | null | undefined
): GovernanceLiquidityMarket | null {
  if (!liquidityData) return null;
  const market =
    liquidityData.__typename === 'MarketV1LiquidityData' ? liquidityData.market : null;
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

function enrichAdapterCapLabels(
  caps: CapInfo[],
  adapters: AdapterInfo[],
  liquidityAdapter: AdapterInfo | null,
  liquidityMarket: GovernanceLiquidityMarket | null
): CapInfo[] {
  const liquidityAddress = liquidityAdapter?.address?.toLowerCase() ?? null;

  return caps.map((cap) => {
    if (cap.type !== 'Adapter' || !cap.adapterAddress) return cap;

    const addr = cap.adapterAddress.toLowerCase();
    if (liquidityAddress && addr === liquidityAddress && liquidityMarket?.label) {
      return { ...cap, label: liquidityMarket.label };
    }

    const adapter =
      adapters.find((a) => a.address.toLowerCase() === addr) ??
      (liquidityAddress === addr ? liquidityAdapter : null);

    if (adapter?.metaMorpho?.name) {
      return { ...cap, label: adapter.metaMorpho.name };
    }
    if (adapter?.metaMorpho?.symbol) {
      return { ...cap, label: adapter.metaMorpho.symbol };
    }
    if (adapter?.underlying?.name) {
      return { ...cap, label: adapter.underlying.name };
    }
    if (adapter?.underlying?.symbol) {
      return { ...cap, label: adapter.underlying.symbol };
    }
    if (adapter?.type === 'MorphoMarketV1Adapter') {
      return {
        ...cap,
        label: liquidityMarket?.label ?? 'Morpho Market Adapter',
      };
    }

    return cap;
  });
}

function mapCap(
  graph: GraphCap | null | undefined,
  vaultAsset: VaultAssetRef
): CapInfo | null {
  if (!graph) return null;

  const base: CapInfo = {
    type: graph.type ?? 'Unknown',
    absoluteCap:
      graph.absoluteCap === null || graph.absoluteCap === undefined
        ? '0'
        : typeof graph.absoluteCap === 'string'
        ? graph.absoluteCap
        : graph.absoluteCap.toString(),
    relativeCap:
      graph.relativeCap === null || graph.relativeCap === undefined
        ? '0'
        : typeof graph.relativeCap === 'string'
        ? graph.relativeCap
        : graph.relativeCap.toString(),
    allocation:
      graph.allocation === null || graph.allocation === undefined
        ? '0'
        : typeof graph.allocation === 'string'
        ? graph.allocation
        : graph.allocation.toString(),
  };

  const data = graph.data;
  const capType = graph.type;

  const isAdapterCap =
    capType === 'Adapter' || data?.__typename === 'AdapterCapData';
  const isMarketCap =
    capType === 'MarketV1' || data?.__typename === 'MarketV1CapData';
  const isCollateralCap =
    capType === 'Collateral' || data?.__typename === 'CollateralCapData';

  if (isAdapterCap) {
    const adapterData = data as { adapterAddress?: string | null } | null | undefined;
    const symbol = vaultAsset?.symbol ?? null;
    const decimals = vaultAsset?.decimals ?? null;
    return {
      ...base,
      adapterAddress: adapterData?.adapterAddress ?? null,
      label: symbol ? `${symbol} Adapter` : 'Adapter',
      amountSymbol: symbol,
      amountDecimals: decimals,
    };
  }

  if (isMarketCap) {
    const marketData = data as {
      adapterAddress?: string | null;
      market?: {
        marketId?: string | null;
        loanAsset?: { symbol?: string | null; decimals?: number | null } | null;
        collateralAsset?: { symbol?: string | null; decimals?: number | null } | null;
      } | null;
    } | null | undefined;
    const loan = marketData?.market?.loanAsset;
    const collateral = marketData?.market?.collateralAsset;
    const loanSymbol = loan?.symbol ?? null;
    const collateralSymbol = collateral?.symbol ?? null;
    const label =
      marketPairLabel(collateralSymbol, loanSymbol) ??
      marketData?.market?.marketId ??
      null;

    return {
      ...base,
      adapterAddress: marketData?.adapterAddress ?? null,
      marketKey: marketData?.market?.marketId ?? null,
      label,
      loanSymbol,
      collateralSymbol,
      amountSymbol: loanSymbol ?? vaultAsset?.symbol ?? null,
      amountDecimals: loan?.decimals ?? vaultAsset?.decimals ?? null,
    };
  }

  if (isCollateralCap) {
    const collateralData = data as {
      collateralAddress?: string | null;
      collateralToken?: { symbol?: string | null; decimals?: number | null; address?: string | null } | null;
    } | null | undefined;
    const token = collateralData?.collateralToken;
    return {
      ...base,
      collateralAddress: collateralData?.collateralAddress ?? token?.address ?? null,
      label: token?.symbol ?? null,
      collateralSymbol: token?.symbol ?? null,
      amountSymbol: token?.symbol ?? null,
      amountDecimals: token?.decimals ?? null,
    };
  }

  return base;
}

function mapTimelock(entry: { selector?: string | null; functionName?: string | null; duration?: number | string | null } | null | undefined): Omit<TimelockInfo, 'abdicated'> | null {
  if (!entry?.selector || !entry.functionName) return null;

  return {
    selector: entry.selector,
    functionName: entry.functionName,
    durationSeconds:
      entry.duration === null || entry.duration === undefined
        ? 0
        : typeof entry.duration === 'string'
        ? Number(entry.duration)
        : entry.duration,
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
    const chainId = cfg.chainId ?? BASE_CHAIN_ID;

    const data = await morphoGraphQLClient.request<GraphVaultGovernanceResponse>(
      VAULT_V2_GOVERNANCE_QUERY,
      {
        address,
        chainId,
        adapterLimit: ADAPTER_LIMIT,
      }
    );

    if (!data.vault) {
      throw new AppError('Vault not found in Morpho API', 404, 'VAULT_NOT_FOUND');
    }

    const adapters =
      data.vault.adapters?.items
        ?.map((a) => mapAdapter(a, address))
        .filter((a): a is AdapterInfo => a !== null) ?? [];

    const liquidityAdapter = mapAdapter(data.vault.liquidityAdapter, address);
    const liquidityMarket = parseLiquidityMarket(data.vault.liquidityData ?? null);

    const vaultAsset = data.vault.asset
      ? {
          symbol: data.vault.asset.symbol ?? 'UNKNOWN',
          decimals: data.vault.asset.decimals ?? 18,
        }
      : null;

    const caps = enrichAdapterCapLabels(
      data.vault.caps?.items
        ?.map((c) => mapCap(c, data.vault?.asset))
        .filter((c): c is CapInfo => c !== null) ?? [],
      adapters,
      liquidityAdapter,
      liquidityMarket
    );

    const rawTimelocks =
      data.vault.timelocks
        ?.map(mapTimelock)
        .filter((t): t is Omit<TimelockInfo, 'abdicated'> => t !== null)
        .filter((t) => !isHiddenTimelock(t)) ?? [];

    const timelocks = await enrichTimelocksWithAbdication(
      address as `0x${string}`,
      rawTimelocks
    );

    const response: VaultV2GovernanceResponse = {
      vaultAddress: address,
      owner: data.vault.owner?.address ?? null,
      curator: data.vault.curator?.address ?? null,
      allocators:
        data.vault.allocators
          ?.map((a) => a?.allocator?.address)
          .filter((addr): addr is string => Boolean(addr)) ?? [],
      sentinels:
        data.vault.sentinels
          ?.map((s) => s?.sentinel?.address)
          .filter((addr): addr is string => Boolean(addr)) ?? [],
      liquidityAdapter,
      liquidityMarket,
      idle: {
        assetsUsd: data.vault.idleAssetsUsd ?? 0,
        assets:
          data.vault.idleAssets != null ? String(data.vault.idleAssets) : null,
      },
      adapters,
      caps,
      timelocks,
      vaultAsset,
    };

    const responseHeaders = new Headers(rateLimitResult.headers);
    responseHeaders.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');

    return NextResponse.json(response, { headers: responseHeaders });
  } catch (error) {
    const { error: apiError, statusCode } = handleApiError(error, 'Failed to fetch v2 governance data');
    return NextResponse.json(apiError, { status: statusCode });
  }
}

