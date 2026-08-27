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

function formatOrDash(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? formatPercentage(value, 2) : '—';
}

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
    try {
      return `${formatTokenAmount(BigInt(allocationAssets.split('.')[0] || '0'), decimals, 2)} ${symbol ?? ''}`.trim();
    } catch {
      /* fall through */
    }
  }
  if (allocatedUsd === 0) {
    return `${formatTokenAmount(0n, decimals, 2)} ${symbol ?? ''}`.trim();
  }
  return '—';
}

type IdleRow = {
  kind: 'idle';
  allocated: number;
  pct: number;
  allocationAssets: string | null;
  decimals: number;
  symbol: string | null;
};

type VaultAdapterRow = {
  kind: 'vault';
  market: string;
  allocated: number;
  pct: number;
  supplyApy: number | null;
  allocationAssets: string | null;
  decimals: number;
  symbol: string | null;
  isLiquidityAdapter: boolean;
};

type MarketRow = {
  kind: 'market';
  rowKey: string;
  market: string;
  lltv: string | number | null;
  allocationAssets: string | null;
  decimals: number;
  symbol: string | null;
  utilization: number | null;
  liquidity: number | null;
  borrowApy: number | null;
  supplyApy: number | null;
  allocated: number;
  pct: number;
  isLiquidityMarket?: boolean;
};

type TableRow = IdleRow | VaultAdapterRow | MarketRow;

function marketIdKey(
  market: { uniqueKey?: string | null; marketId?: string | null; id?: string | null } | null | undefined
): string | null {
  if (!market) return null;
  const key = market.uniqueKey ?? market.marketId ?? market.id;
  return key ? key.toLowerCase() : null;
}

function AllocatedCell({
  allocationAssets,
  allocated,
  decimals,
  symbol,
}: {
  allocationAssets: string | null;
  allocated: number;
  decimals: number;
  symbol: string | null;
}) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span>
        {formatAllocatedToken(allocationAssets, allocated, decimals, symbol)}
      </span>
      <span className="text-muted-foreground text-xs">
        {formatCompactUSD(allocated)}
      </span>
    </div>
  );
}

function SectionHeader({ title, colSpan }: { title: string; colSpan: number }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={colSpan}
        className="bg-muted/30 py-2 text-xs font-medium text-muted-foreground"
      >
        {title}
      </TableCell>
    </TableRow>
  );
}

export function VaultV2Allocations({ vaultAddress, preloadedRisk }: VaultV2AllocationsProps) {
  const { data: fetchedRisk, isLoading, error } = useVaultV2Risk(vaultAddress);
  const risk = preloadedRisk ?? fetchedRisk;

  const { idleRow, vaultRows, marketRows, total } = useMemo(() => {
    if (!risk) {
      return {
        idleRow: null as IdleRow | null,
        vaultRows: [] as VaultAdapterRow[],
        marketRows: [] as MarketRow[],
        total: 0,
      };
    }

    const idleUsd = risk.idle?.assetsUsd ?? 0;
    const totalUsd = (risk.totalAdapterAssetsUsd ?? 0) + idleUsd;
    const vaultAsset = risk.vaultAsset ?? null;
    const decimals = vaultAsset?.decimals ?? 18;
    const symbol = vaultAsset?.symbol ?? null;
    const liquidityMarketId = risk.liquidityMarket?.marketId?.toLowerCase() ?? null;

    const idleRow: IdleRow = {
      kind: 'idle',
      allocated: idleUsd,
      pct: totalUsd > 0 ? (idleUsd / totalUsd) * 100 : 0,
      allocationAssets: risk.idle?.assets ?? '0',
      decimals,
      symbol,
    };

    const vaultRows: VaultAdapterRow[] = [];
    const marketRows: MarketRow[] = [];
    const adapterList = (risk.adapters ?? [])
      .slice()
      .sort((a, b) => (b.allocationUsd ?? 0) - (a.allocationUsd ?? 0));

    for (const adapter of adapterList) {
      if (adapter.adapterType === 'MetaMorphoAdapter') {
        vaultRows.push({
          kind: 'vault',
          market: adapter.underlyingVault?.name ?? adapter.adapterLabel,
          allocated: adapter.allocationUsd ?? 0,
          pct: totalUsd > 0 ? ((adapter.allocationUsd ?? 0) / totalUsd) * 100 : 0,
          supplyApy: adapter.apy ?? null,
          allocationAssets: adapter.allocationAssets ?? null,
          decimals,
          symbol,
          isLiquidityAdapter: Boolean(adapter.isLiquidityAdapter),
        });
      }

      const markets = [...(adapter.markets ?? [])].sort(
        (a, b) => (b.allocationUsd ?? 0) - (a.allocationUsd ?? 0)
      );

      for (const m of markets) {
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
          col && loan ? `${col} / ${loan}` : loan || col || adapter.adapterLabel || 'Market';
        const rowMarketId = marketIdKey(m.market);
        const isLiquidityMarket =
          liquidityMarketId != null &&
          rowMarketId != null &&
          rowMarketId === liquidityMarketId;

        marketRows.push({
          kind: 'market',
          rowKey: rowMarketId ?? `${marketLabel}-${marketRows.length}`,
          market: marketLabel,
          lltv: m.market?.lltv ?? null,
          allocationAssets: m.allocationAssets ?? null,
          decimals: m.market?.loanAsset?.decimals ?? decimals,
          symbol: m.market?.loanAsset?.symbol ?? symbol,
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

    return { idleRow, vaultRows, marketRows, total: totalUsd };
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

  if (error || !risk || !idleRow) {
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

  const colSpan = 7;

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
                <TableHead>Allocation</TableHead>
                <TableHead className="text-right">Utilization</TableHead>
                <TableHead className="text-right">Liquidity</TableHead>
                <TableHead className="text-right">Borrow APY</TableHead>
                <TableHead className="text-right">Supply APY</TableHead>
                <TableHead className="text-right">Allocated</TableHead>
                <TableHead className="text-right">% Alloc.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SectionHeader title="Idle" colSpan={colSpan} />
              <TableRow className="bg-muted/30">
                <TableCell>
                  <span className="font-medium">Idle</span>
                </TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">
                  <AllocatedCell
                    allocationAssets={idleRow.allocationAssets}
                    allocated={idleRow.allocated}
                    decimals={idleRow.decimals}
                    symbol={idleRow.symbol}
                  />
                </TableCell>
                <TableCell className="text-right">{`${idleRow.pct.toFixed(2)}%`}</TableCell>
              </TableRow>

              {vaultRows.length > 0 && (
                <>
                  <SectionHeader title="Vault Adapter" colSpan={colSpan} />
                  {vaultRows.map((r) => (
                    <TableRow key={`vault-${r.market}`}>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{r.market}</span>
                          <Badge variant="outline" className="text-xs">
                            Vault Adapter
                          </Badge>
                          {r.isLiquidityAdapter && (
                            <Badge className="flex items-center gap-1 bg-emerald-600 text-white text-xs">
                              <Zap className="h-3 w-3" />
                              Liquidity
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="text-right">
                        {formatOrDash(scalePercent(r.supplyApy))}
                      </TableCell>
                      <TableCell className="text-right">
                        <AllocatedCell
                          allocationAssets={r.allocationAssets}
                          allocated={r.allocated}
                          decimals={r.decimals}
                          symbol={r.symbol}
                        />
                      </TableCell>
                      <TableCell className="text-right">{`${r.pct.toFixed(2)}%`}</TableCell>
                    </TableRow>
                  ))}
                </>
              )}

              {marketRows.length > 0 && (
                <>
                  <SectionHeader title="Morpho Blue Market" colSpan={colSpan} />
                  {marketRows.map((r) => (
                    <TableRow key={r.rowKey}>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{r.market}</span>
                          {r.isLiquidityMarket && (
                            <Badge className="flex items-center gap-1 bg-emerald-600 text-white text-xs">
                              <Zap className="h-3 w-3" />
                              Liquidity
                            </Badge>
                          )}
                          {formatLtv(r.lltv) !== '—' && (
                            <Badge variant="outline" className="text-xs">
                              LTV {formatLtv(r.lltv)}
                            </Badge>
                          )}
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
                        <AllocatedCell
                          allocationAssets={r.allocationAssets}
                          allocated={r.allocated}
                          decimals={r.decimals}
                          symbol={r.symbol}
                        />
                      </TableCell>
                      <TableCell className="text-right">{`${r.pct.toFixed(2)}%`}</TableCell>
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
