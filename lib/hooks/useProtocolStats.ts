import { useQuery } from '@tanstack/react-query';

import type { VaultKind, VaultListCategory } from '@/lib/config/vaults';
import type { FeeWrapperLayer } from '@/lib/morpho/fee-wrapper-layer';

export interface ProtocolStats {
  totalDeposited: number;
  totalFeesGenerated: number;
  totalRevenueGenerated: number;
  activeVaults: number;
  users: number;
  tvlTrend: Array<{ date: string; value: number }>;
  tvlByVault?: Array<{
    name: string;
    address: string;
    data: Array<{ date: string; value: number }>;
  }>;
  feesTrendDaily: Array<{ date: string; value: number }>;
  feesTrendCumulative: Array<{ date: string; value: number }>;
  revenueTrendDaily: Array<{ date: string; value: number }>;
  revenueTrendCumulative: Array<{ date: string; value: number }>;
  inflowsTrendDaily: Array<{ date: string; value: number }>;
  inflowsTrendCumulative: Array<{ date: string; value: number }>;
}

export interface VaultWithData {
  id: string;
  name: string | null;
  symbol: string | null;
  asset: string | null;
  assetDecimals?: number | null;
  address: string;
  chainId: number;
  scanUrl: string;
  listCategory?: VaultListCategory;
  kind?: VaultKind;
  underlyingAddress?: string | null;
  performanceFeeBps: number | null;
  status: 'active' | 'paused' | 'deprecated';
  riskTier: 'low' | 'medium' | 'high';
  description?: string;
  tvl: number | null;
  totalAssets?: string | null;
  apy: number | null;
  depositors: number;
  revenueAllTime: number | null;
  feesAllTime: number | null;
  lastHarvest: string | null;
  feeWrapper?: FeeWrapperLayer | null;
}

export interface VaultDetail extends VaultWithData {
  apyBase: number | null;
  apyBoosted: number | null;
  feesYtd: number | null;
  utilization: number;
  apyBreakdown?: {
    apy: number | null;
    netApy: number | null;
    netApyWithoutRewards: number | null;
    avgApy: number | null;
    avgNetApy: number | null;
    dailyApy: number | null;
    dailyNetApy: number | null;
    weeklyApy: number | null;
    weeklyNetApy: number | null;
    monthlyApy: number | null;
    monthlyNetApy: number | null;
    underlyingYieldApr: number | null;
  };
  rewards?: Array<{
    assetAddress: string;
    supplyApr: number;
    yearlySupplyTokens: number;
    chainId?: number | null;
  }>;
  metadata?: {
    description?: string | null;
    image?: string | null;
  };
  roles?: {
    owner?: string | null;
    curator?: string | null;
  };
  transactions?: Array<{
    blockNumber: number;
    hash: string;
    type: string;
    userAddress?: string | null;
  }>;
  parameters: {
    performanceFeeBps: number | null;
    performanceFeePercent?: number | null;
    managementFeeBps?: number | null;
    managementFeePercent?: number | null;
    maxDeposit: number | null;
    maxWithdrawal: number | null;
    strategyNotes: string;
  };
}

export const useProtocolStats = () => {
  return useQuery<ProtocolStats>({
    queryKey: ['protocol-stats'],
    queryFn: async () => {
      const response = await fetch('/api/protocol-stats', {
        credentials: 'omit',
      });
      if (!response.ok) throw new Error('Failed to fetch protocol stats');
      return response.json();
    },
  });
};

export const useVaultList = (filters?: {
  asset?: string;
  status?: string;
  riskTier?: string;
  search?: string;
}) => {
  return useQuery<VaultWithData[]>({
    queryKey: ['vaults', filters],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (filters?.asset) searchParams.set('asset', filters.asset);
      if (filters?.status) searchParams.set('status', filters.status);
      if (filters?.riskTier) searchParams.set('riskTier', filters.riskTier);
      if (filters?.search) searchParams.set('search', filters.search);

      const response = await fetch(`/api/vaults?${searchParams}`, {
        credentials: 'omit',
      });
      if (!response.ok) throw new Error('Failed to fetch vaults');
      return response.json();
    },
  });
};

export const useVault = (id: string) => {
  return useQuery<VaultDetail>({
    queryKey: ['vault', id],
    queryFn: async () => {
      const response = await fetch(`/api/vaults/${id}`, {
        credentials: 'omit',
      });
      if (!response.ok) throw new Error('Failed to fetch vault');
      return response.json();
    },
    enabled: !!id,
  });
};
