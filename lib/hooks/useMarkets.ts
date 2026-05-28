import { useQuery } from '@tanstack/react-query';

export interface SuppliedMarket {
  uniqueKey: string;
  collateralAsset?: {
    symbol?: string;
  };
  loanAsset?: {
    symbol?: string;
  };
  state?: {
    utilization?: number;
    supplyAssetsUsd?: number;
    borrowAssetsUsd?: number;
    supplyApy?: number;
    borrowApy?: number;
    rewards?: Array<{
      supplyApr?: number;
    }>;
  };
}

export interface VaultAllocation {
  address: string;
  totalSupplyUsd: number;
  allocations: Array<{
    marketKey: string;
  }>;
}

export interface MarketsSuppliedResponse {
  markets: SuppliedMarket[];
  vaultAllocations: VaultAllocation[];
}

async function fetchMarketsSupplied(): Promise<MarketsSuppliedResponse> {
  const response = await fetch('/api/markets-supplied', {
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : 'Failed to fetch markets supplied data';
    throw new Error(message);
  }
  return response.json();
}

export function useMarketsSupplied() {
  return useQuery<MarketsSuppliedResponse>({
    queryKey: ['markets-supplied'],
    queryFn: fetchMarketsSupplied,
  });
}

