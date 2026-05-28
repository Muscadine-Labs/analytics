'use client';

import { useMemo } from 'react';
import { Shield, Zap } from 'lucide-react';
import { useVaultV2Risk } from '@/lib/hooks/useVaultV2Risk';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { formatCompactUSD, formatPercentage } from '@/lib/format/number';
import type { MarketRiskGrade } from '@/lib/morpho/compute-v1-market-risk';
import { getGradeColor, getScoreColor } from '@/lib/morpho/market-risk-display';
import { MarketRiskCard } from '@/components/morpho/MarketRiskCard';

interface VaultRiskV2Props {
  vaultAddress: string;
  preloadedData?: import('@/app/api/vaults/v2/[id]/risk/route').V2VaultRiskResponse | null;
}

export function VaultRiskV2({ vaultAddress, preloadedData }: VaultRiskV2Props) {
  const { data: fetchedData, isLoading, error } = useVaultV2Risk(vaultAddress);
  const data = preloadedData ?? fetchedData;
  const isActuallyLoading = !preloadedData && isLoading;

  const totalAdapterAssets = data?.totalAdapterAssetsUsd ?? 0;
  const vaultTotalUsd =
    totalAdapterAssets + (data?.idle?.assetsUsd ?? 0);

  const sortedAdapters = useMemo(() => {
    if (!data?.adapters) return [];
    return [...data.adapters].sort((a, b) => (b.allocationUsd ?? 0) - (a.allocationUsd ?? 0));
  }, [data?.adapters]);

  if (isActuallyLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Risk Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    const isDeploymentProtection =
      error instanceof Error && error.message.includes('Deployment protection');
    const apiUrl = `/api/vaults/v2/${vaultAddress}/risk`;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Risk Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">
            Failed to load risk data: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          {isDeploymentProtection && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-200 mb-2">
                <strong>Preview Deployment Protection:</strong> This preview deployment requires
                authentication.
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                To fix this, open the API route directly in your browser to authenticate:
              </p>
              <a
                href={apiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-amber-900 dark:text-amber-100 underline hover:text-amber-700 dark:hover:text-amber-300 break-all"
              >
                {typeof window !== 'undefined' ? window.location.origin + apiUrl : apiUrl}
              </a>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                After authenticating, refresh this page. Production deployments don&apos;t require
                this step.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!data || sortedAdapters.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Risk Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center py-8 text-slate-500 dark:text-slate-400">
            No adapter risk data found for this vault yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Risk Management
          </CardTitle>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Weighted average across adapters (vault adapters roll up underlying V1 vault risk)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p className={cn('text-xl font-semibold', getScoreColor(data.vaultRiskScore))}>
            {data.vaultRiskScore.toFixed(2)}
          </p>
          <Badge
            variant="outline"
            className={cn('text-xs font-semibold px-2 py-1', getGradeColor(data.vaultRiskGrade))}
          >
            {data.vaultRiskGrade}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-4 bg-slate-50/60 dark:bg-slate-900/50">
            <p className="text-xs text-slate-500 dark:text-slate-400">Total Allocated to Adapters</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {formatCompactUSD(totalAdapterAssets)}
            </p>
          </div>
          <div className="rounded-lg border p-4 bg-slate-50/60 dark:bg-slate-900/50">
            <p className="text-xs text-slate-500 dark:text-slate-400">Adapters Count</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {sortedAdapters.length}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {sortedAdapters.map((adapter) => {
            const adapterWeightPct =
              totalAdapterAssets > 0 ? (adapter.allocationUsd / totalAdapterAssets) * 100 : 0;
            const isVaultAdapter = adapter.adapterType === 'MetaMorphoAdapter';
            const markets = [...adapter.markets].sort(
              (a, b) => (b.allocationUsd ?? 0) - (a.allocationUsd ?? 0)
            );

            return (
              <div key={adapter.adapterAddress} className="space-y-4">
                <div className="rounded-lg border p-4 bg-white dark:bg-slate-950 shadow-sm space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {isVaultAdapter && adapter.underlyingVault?.address ? (
                          <Link
                            href={`/vault/v1/${adapter.underlyingVault.address}`}
                            className="text-base font-semibold text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {adapter.adapterLabel}
                          </Link>
                        ) : (
                          <p className="text-base font-semibold">{adapter.adapterLabel}</p>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {isVaultAdapter ? 'Vault Adapter' : 'Market Adapter'}
                        </Badge>
                        {adapter.isLiquidityAdapter && (
                          <Badge className="flex items-center gap-1 bg-emerald-600 text-white text-xs">
                            <Zap className="h-3 w-3" />
                            Liquidity Adapter
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Allocation: {formatCompactUSD(adapter.allocationUsd)} ·{' '}
                        {formatPercentage(adapterWeightPct, 2)} of vault
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={cn('text-lg font-semibold', getScoreColor(adapter.riskScore))}>
                        {adapter.riskScore.toFixed(2)}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs font-semibold px-2 py-1',
                          getGradeColor(adapter.riskGrade)
                        )}
                      >
                        {adapter.riskGrade}
                      </Badge>
                    </div>
                  </div>

                  {isVaultAdapter && adapter.underlyingVault?.address && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Market-level risk is on the{' '}
                      <Link
                        href={`/vault/v1/${adapter.underlyingVault.address}`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        underlying V1 vault page
                      </Link>
                      .
                    </p>
                  )}
                </div>

                {!isVaultAdapter && markets.length > 0 && (
                  <div className="space-y-6 pl-0 sm:pl-2">
                    {markets.map((m) => (
                      <MarketRiskCard
                        key={m.market.uniqueKey || m.market.id}
                        market={m.market}
                        scores={m.scores}
                        oracleTimestampData={m.oracleTimestampData}
                        supplyUsd={m.allocationUsd}
                        vaultTotalUsd={vaultTotalUsd}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="rounded-lg border border-dashed p-4 bg-slate-50/60 dark:bg-slate-900/50 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold">Idle</p>
              <Badge variant="outline" className="text-xs">
                Idle Adapter
              </Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Allocation: {formatCompactUSD(data.idle?.assetsUsd ?? 0)} · assets not deployed to
              adapters
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
