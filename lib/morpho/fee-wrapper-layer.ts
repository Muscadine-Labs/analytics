import { gql } from 'graphql-request';
import {
  getVaultByAddress,
  resolveUnderlyingVaultAddress,
} from '@/lib/config/vaults';
import { BPS_PER_ONE } from '@/lib/constants';
import { morphoGraphQLClient } from '@/lib/morpho/graphql-client';
import {
  isMorphoVaultV2Adapter,
  mergeUnderlyingVaultInfo,
} from '@/lib/morpho/vault-v2-adapter';

/** Public fee-wrapper facts attached to an underlying vault page — not a peer vault. */
export type FeeWrapperLayer = {
  address: string;
  name: string | null;
  /** Wrapper `avgNetApy` in percent — public-facing rate. */
  apy: number | null;
  tvl: number | null;
  totalAssets: string | null;
  liquidityUsd: number | null;
  liquidity: string | null;
  performanceFeePercent: number | null;
  managementFeePercent: number | null;
  adapterAddress: string | null;
  innerVault: {
    address: string;
    name: string | null;
    apy: number | null;
  } | null;
  depositors?: number;
};

type GraphAdapter = {
  __typename?: string | null;
  type?: string | null;
  address?: string | null;
  innerVault?: {
    address?: string | null;
    name?: string | null;
    symbol?: string | null;
    avgNetApy?: number | null;
  } | null;
};

type GraphFeeWrapperVault = {
  address?: string | null;
  name?: string | null;
  performanceFee?: number | null;
  managementFee?: number | null;
  avgNetApy?: number | null;
  totalAssets?: string | number | null;
  totalAssetsUsd?: number | null;
  liquidity?: string | number | null;
  liquidityUsd?: number | null;
  adapters?: { items?: Array<GraphAdapter | null> | null } | null;
};

const FEE_WRAPPER_LAYER_QUERY = gql`
  query FeeWrapperLayer($address: String!, $chainId: Int!) {
    vaultV2ByAddress(address: $address, chainId: $chainId) {
      address
      name
      performanceFee
      managementFee
      avgNetApy
      totalAssets
      totalAssetsUsd
      liquidity
      liquidityUsd
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

export function pickMorphoVaultV2Adapter(
  adapters: Array<GraphAdapter | null> | null | undefined
): GraphAdapter | null {
  return adapters?.find((a) => a && isMorphoVaultV2Adapter(a)) ?? null;
}

function feeToPercent(fee: number | null | undefined): number | null {
  if (fee == null || !Number.isFinite(fee)) return null;
  return (Math.round(fee * BPS_PER_ONE) / BPS_PER_ONE) * 100;
}

export function feeWrapperLayerFromGraph(
  wrapperAddress: string,
  graph: GraphFeeWrapperVault | null | undefined
): FeeWrapperLayer | null {
  const address = graph?.address || wrapperAddress;
  if (!address) return null;

  const cfg = getVaultByAddress(wrapperAddress);
  const adapter = pickMorphoVaultV2Adapter(graph?.adapters?.items);
  const inner = mergeUnderlyingVaultInfo(wrapperAddress, adapter?.innerVault);
  const innerAddress =
    inner?.address || resolveUnderlyingVaultAddress(wrapperAddress, adapter?.innerVault?.address);

  return {
    address,
    name: graph?.name ?? null,
    apy: graph?.avgNetApy != null ? graph.avgNetApy * 100 : null,
    tvl: graph?.totalAssetsUsd ?? null,
    totalAssets: graph?.totalAssets != null ? String(graph.totalAssets) : null,
    liquidityUsd: graph?.liquidityUsd ?? null,
    liquidity: graph?.liquidity != null ? String(graph.liquidity) : null,
    performanceFeePercent: feeToPercent(graph?.performanceFee),
    managementFeePercent: feeToPercent(graph?.managementFee),
    adapterAddress: adapter?.address ?? cfg?.adapterAddress ?? null,
    innerVault: innerAddress
      ? {
          address: innerAddress,
          name: inner?.name ?? adapter?.innerVault?.name ?? null,
          apy:
            inner?.avgNetApy != null
              ? inner.avgNetApy * 100
              : adapter?.innerVault?.avgNetApy != null
                ? adapter.innerVault.avgNetApy * 100
                : null,
        }
      : null,
  };
}

export async function fetchFeeWrapperLayer(
  wrapperAddress: string,
  chainId: number
): Promise<FeeWrapperLayer | null> {
  const data = await morphoGraphQLClient.request<{
    vaultV2ByAddress?: GraphFeeWrapperVault | null;
  }>(FEE_WRAPPER_LAYER_QUERY, { address: wrapperAddress, chainId });

  return feeWrapperLayerFromGraph(wrapperAddress, data.vaultV2ByAddress);
}

export function attachFeeWrappersToUnderlyings<
  T extends {
    address: string;
    kind?: string | null;
    underlyingAddress?: string | null;
    innerVaultAddress?: string | null;
    feeWrapper?: FeeWrapperLayer | null;
  },
>(vaults: T[], wrappers: Map<string, FeeWrapperLayer>): T[] {
  const byAddress = new Map(vaults.map((v) => [v.address.toLowerCase(), v]));

  for (const [wrapperAddress, layer] of wrappers) {
    const inner =
      layer.innerVault?.address ||
      byAddress.get(wrapperAddress.toLowerCase())?.underlyingAddress ||
      getVaultByAddress(wrapperAddress)?.underlyingAddress;
    if (!inner) continue;
    const underlying = byAddress.get(inner.toLowerCase());
    if (!underlying || underlying.kind === 'feeWrapper') continue;
    underlying.feeWrapper = layer;
  }

  return vaults.filter((v) => v.kind !== 'feeWrapper');
}
