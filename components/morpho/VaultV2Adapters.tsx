'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Zap, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AddressBadge } from '@/components/AddressBadge';
import { useVaultV2Governance } from '@/lib/hooks/useVaultV2Governance';
import { formatUSD, formatNumber } from '@/lib/format/number';
import type { VaultV2GovernanceResponse } from '@/app/api/vaults/v2/[id]/governance/route';

interface VaultV2AdaptersProps {
  vaultAddress: string;
  preloadedData?: VaultV2GovernanceResponse | null;
}

export function VaultV2Adapters({ vaultAddress, preloadedData }: VaultV2AdaptersProps) {
  const { data: fetchedData, isLoading, error } = useVaultV2Governance(vaultAddress);
  const data = preloadedData ?? fetchedData;

  const liquidityAdapterAddress = data?.liquidityAdapter?.address?.toLowerCase();

  const adapters = useMemo(() => {
    if (!data) return [];

    const byAddress = new Map<string, (typeof data.adapters)[number]>();
    for (const adapter of data.adapters ?? []) {
      byAddress.set(adapter.address.toLowerCase(), adapter);
    }

    const liquidity = data.liquidityAdapter;
    if (liquidity?.address && !byAddress.has(liquidity.address.toLowerCase())) {
      byAddress.set(liquidity.address.toLowerCase(), liquidity);
    }

    return [...byAddress.values()].sort((a, b) => (b.assetsUsd ?? 0) - (a.assetsUsd ?? 0));
  }, [data]);

  if (!preloadedData && isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Adapters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Adapters</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600 dark:text-red-400">
            Failed to load adapters: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const idle = data.idle;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adapters</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {adapters.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No adapters configured for this vault.</p>
        ) : (
          adapters.map((adapter) => {
            const isLiquidity = adapter.address.toLowerCase() === liquidityAdapterAddress;
            const isVaultAdapter =
              adapter.type === 'MetaMorpho' || Boolean(adapter.metaMorpho?.address);
            const v1Address = adapter.metaMorpho?.address;

            const title = isVaultAdapter
              ? adapter.metaMorpho?.name ?? adapter.metaMorpho?.symbol ?? 'Vault Adapter'
              : 'Morpho Market Adapter';

            return (
              <div
                key={adapter.address}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isVaultAdapter && v1Address ? (
                        <Link
                          href={`/vault/v1/${v1Address}`}
                          className="text-base font-semibold text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {title}
                        </Link>
                      ) : (
                        <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {title}
                        </p>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {isVaultAdapter ? 'Vault Adapter' : 'Market Adapter'}
                      </Badge>
                      {isLiquidity && (
                        <Badge className="flex items-center gap-1 bg-emerald-600 text-white">
                          <Zap className="h-3 w-3" />
                          Liquidity Adapter
                        </Badge>
                      )}
                    </div>
                    <AddressBadge address={adapter.address} truncate={false} />
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Allocated</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {adapter.assetsUsd !== null && adapter.assetsUsd !== undefined
                        ? formatUSD(adapter.assetsUsd, 2)
                        : 'N/A'}
                    </p>
                    {adapter.assets !== null && adapter.assets !== undefined && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Raw: {formatNumber(adapter.assets)} units
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/30">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-slate-900 dark:text-slate-100">Idle</p>
                <Badge variant="outline" className="flex items-center gap-1 text-xs">
                  <Wallet className="h-3 w-3" />
                  Idle Adapter
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Assets in the vault not deployed to any adapter
              </p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-sm text-slate-500 dark:text-slate-400">Allocated</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {formatUSD(idle.assetsUsd, 2)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
