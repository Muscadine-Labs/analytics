'use client';

import { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useVaultV2Risk } from '@/lib/hooks/useVaultV2Risk';
import { formatCompactUSD, formatPercentage, formatLtv, formatTokenAmount } from '@/lib/format/number';
import { shouldShowMarketEntry } from '@/lib/morpho/format-risk';
import type { V2VaultRiskResponse } from '@/app/api/vaults/v2/[id]/risk/route';

interface VaultV2AllocationsProps {
  vaultAddress: string;
  preloadedRisk?: V2VaultRiskResponse | null;
}

/** formatPercentage expects value in 0–100 (e.g. 4 for 4%). APY/util from Morpho are 0–1, so pass v*100. */
function formatOrDash(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? formatPercentage(value, 2) : '—';
}

/** APY and utilization from Morpho state are 0–1; convert to 0–100 for formatPercentage. */
function scalePercent(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value * 100;
}

function formatAllocatedToken(
  allocationAssets: string | null,
  allocatedUsd: number,
  decimals: number,
  symbol: string | null
): string {
  if (allocationAssets != null) {
    const amount = `${formatTokenAmount(BigInt(allocationAssets), decimals, 2)} ${symbol ?? ''}`.trim();
    return amount;
  }
  if (allocatedUsd === 0) {
    return `${formatTokenAmount(0n, decimals, 2)} ${symbol ?? ''}`.trim();
  }
  return '—';
}

type AdapterRow = {
  isAdapterRow: true;
  market: string;
  isIdle: boolean;
  isLiquidityAdapter: boolean;
  isVaultAdapter: boolean;
  isIdleVaultAssets: boolean;
  allocated: number;
  pct: number;
  supplyApy: number | null;
  liquidity: number | null;
  allocationAssets: string | null;
  allocationTokenDecimals: number;
  allocationTokenSymbol: string | null;
};
type MarketRow = {
  isAdapterRow?: false;
  rowKey: string;
  market: string;
  lltv: string | number | null;
  allocationAssets: string | null;
  allocationTokenDecimals: number;
  allocationTokenSymbol: string | null;
  utilization: number | null;
  liquidity: number | null;
  borrowApy: number | null;
  supplyApy: number | null;
  allocated: number;
  pct: number;
  isLiquidityMarket?: boolean;
};
type TableRow = AdapterRow | MarketRow;

function isAdapterRow(r: TableRow): r is AdapterRow {
  return 'isAdapterRow' in r && r.isAdapterRow === true;
}

function marketIdKey(
  market: { uniqueKey?: string | null; marketId?: string | null; id?: string | null } | null | undefined
): string | null {
  if (!market) return null;
  const key = market.uniqueKey ?? market.marketId ?? market.id;
  return key ? key.toLowerCase() : null;
}

function pushMarketRows(
  rows: TableRow[],
  markets: NonNullable<V2VaultRiskResponse['adapters']>[number]['markets'],
  totalUsd: number,
  adapterLabel: string,
  liquidityMarketId: string | null
): void {
  const sortedMarkets = (markets ?? [])
    .slice()
    .sort((a, b) => (b.allocationUsd ?? 0) - (a.allocationUsd ?? 0));

  for (const m of sortedMarkets) {
    if (
      !shouldShowMarketEntry(
        m.allocationUsd,
        m.allocationAssets,
        m.absoluteCap,
        m.relativeCap
      )
    ) {
      continue;
    }

    const col = m.market?.collateralAsset?.symbol;
    const loan = m.market?.loanAsset?.symbol;
    const marketLabel =
      col && loan ? `${col}/${loan}` : loan || col || adapterLabel || 'Market';
    const rowMarketId = marketIdKey(m.market);
    const isLiquidityMarket =
      liquidityMarketId != null &&
      rowMarketId != null &&
      rowMarketId === liquidityMarketId;

    rows.push({
      rowKey: rowMarketId ?? `${marketLabel}-${rows.length}`,
      market: marketLabel,
      lltv: m.market?.lltv ?? null,
      allocationAssets: m.allocationAssets ?? null,
      allocationTokenDecimals: m.market?.loanAsset?.decimals ?? 18,
      allocationTokenSymbol: m.market?.loanAsset?.symbol ?? null,
      utilization: m.market?.state?.utilization ?? null,
      liquidity: m.market?.state?.liquidityAssetsUsd ?? null,
      borrowApy: m.market?.state?.borrowApy ?? null,
      supplyApy: m.market?.state?.supplyApy ?? null,
      allocated: m.allocationUsd ?? 0,
      pct: totalUsd > 0 ? ((m.allocationUsd ?? 0) / totalUsd) * 100 : 0,
      isLiquidityMarket,
    });
  }
}

export function VaultV2Allocations({ vaultAddress, preloadedRisk }: VaultV2AllocationsProps) {
  const { data: fetchedRisk, isLoading, error } = useVaultV2Risk(vaultAddress);
  const risk = preloadedRisk ?? fetchedRisk;

  const { rows, total } = useMemo(() => {
    if (!risk?.adapters) return { rows: [] as TableRow[], total: 0 };

    const totalUsd = risk.totalAdapterAssetsUsd ?? 0;
    const vaultAsset = risk.vaultAsset ?? null;
    const liquidityMarketId = risk.liquidityMarket?.marketId?.toLowerCase() ?? null;
    const adapterList = (risk.adapters ?? [])
      .filter((a) => a.adapterType !== 'MetaMorphoAdapter')
      .slice()
      .sort((a, b) => (b.allocationUsd ?? 0) - (a.allocationUsd ?? 0));

    const rows: TableRow[] = [];

    for (const adapter of adapterList) {
      pushMarketRows(
        rows,
        adapter.markets ?? [],
        totalUsd,
        adapter.adapterLabel,
        liquidityMarketId
      );
    }

    const idleUsd = risk.idle?.assetsUsd ?? 0;
    if (idleUsd > 0) {
      rows.push({
        isAdapterRow: true,
        market: 'Idle',
        isIdle: true,
        isLiquidityAdapter: false,
        isVaultAdapter: false,
        isIdleVaultAssets: true,
        allocated: idleUsd,
        pct: totalUsd > 0 ? (idleUsd / totalUsd) * 100 : 0,
        supplyApy: null,
        liquidity: null,
        allocationAssets: risk.idle?.assets ?? null,
        allocationTokenDecimals: vaultAsset?.decimals ?? 18,
        allocationTokenSymbol: vaultAsset?.symbol ?? null,
      });
    }

    return { rows, total: totalUsd };
  }, [risk]);

  if (!preloadedRisk && isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Allocations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !risk) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Allocations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600 dark:text-red-400">
            Failed to load allocations: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Allocations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 dark:text-slate-400">No allocations yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Allocations</CardTitle>
          <CardDescription>
            Total allocated: {formatCompactUSD(total)}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Market</TableHead>
                <TableHead className="text-right">Utilization</TableHead>
                <TableHead className="text-right">Liquidity</TableHead>
                <TableHead className="text-right">Borrow APY</TableHead>
                <TableHead className="text-right">Supply APY</TableHead>
                <TableHead className="text-right">Allocated</TableHead>
                <TableHead className="text-right">% Allocated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) =>
                isAdapterRow(r) ? (
                  <TableRow key={`adapter-${r.market}-${i}`} className="bg-muted/50">
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{r.market}</span>
                          {r.isVaultAdapter && (
                            <Badge variant="outline" className="text-xs">
                              Vault Adapter
                            </Badge>
                          )}
                          {r.isLiquidityAdapter && (
                            <Badge className="flex items-center gap-1 bg-emerald-600 text-white text-xs">
                              <Zap className="h-3 w-3" />
                              Liquidity Adapter
                            </Badge>
                          )}
                          {r.isIdleVaultAssets && (
                            <Badge variant="outline" className="text-xs">
                              Idle Adapter
                            </Badge>
                          )}
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {r.isIdleVaultAssets
                            ? 'Not deployed to adapters'
                            : r.isVaultAdapter
                              ? 'Vault adapter'
                              : r.isLiquidityAdapter
                                ? 'Liquidity adapter'
                                : 'Adapter'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">
                      {r.liquidity != null && Number.isFinite(r.liquidity)
                        ? formatCompactUSD(r.liquidity)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">
                      {formatOrDash(scalePercent(r.supplyApy))}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span>
                          {formatAllocatedToken(
                            r.allocationAssets,
                            r.allocated,
                            r.allocationTokenDecimals,
                            r.allocationTokenSymbol
                          )}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {formatCompactUSD(r.allocated)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{`${r.pct.toFixed(2)}%`}</TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={r.rowKey}>
                    <TableCell className="pl-8">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{r.market}</span>
                          {r.isLiquidityMarket && (
                            <Badge className="flex items-center gap-1 bg-emerald-600 text-white text-xs">
                              <Zap className="h-3 w-3" />
                              Liquidity
                            </Badge>
                          )}
                          {!r.isLiquidityMarket && formatLtv(r.lltv) === '—' && (
                            <Badge variant="outline" className="text-xs">
                              Idle
                            </Badge>
                          )}
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {formatLtv(r.lltv) === '—' ? 'Idle' : `LTV ${formatLtv(r.lltv)}`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatOrDash(scalePercent(r.utilization))}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.liquidity != null && Number.isFinite(r.liquidity)
                        ? formatCompactUSD(r.liquidity)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatOrDash(scalePercent(r.borrowApy))}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatOrDash(scalePercent(r.supplyApy))}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span>
                          {formatAllocatedToken(
                            r.allocationAssets,
                            r.allocated,
                            r.allocationTokenDecimals,
                            r.allocationTokenSymbol
                          )}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {formatCompactUSD(r.allocated)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{`${r.pct.toFixed(2)}%`}</TableCell>
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

