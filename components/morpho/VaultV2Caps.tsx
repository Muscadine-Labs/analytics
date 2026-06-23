'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useVaultV2Governance } from '@/lib/hooks/useVaultV2Governance';
import { formatTokenAmount } from '@/lib/format/number';
import type { CapInfo, VaultV2GovernanceResponse } from '@/app/api/vaults/v2/[id]/governance/route';

interface VaultV2CapsProps {
  vaultAddress: string;
  preloadedData?: VaultV2GovernanceResponse | null;
}

function formatRelativeCap(relativeCap: string): string {
  try {
    const scaled = BigInt(relativeCap);
    const percent = Number(scaled) / 1e16;
    return `${percent.toFixed(2)}%`;
  } catch {
    return relativeCap;
  }
}

function formatCapAmount(
  value: string,
  decimals: number | null | undefined,
  symbol: string | null | undefined,
  vaultAsset?: { symbol: string; decimals: number } | null
): string {
  const resolvedDecimals =
    decimals ??
    (vaultAsset?.decimals != null ? vaultAsset.decimals : null);
  const resolvedSymbol = symbol ?? vaultAsset?.symbol ?? null;

  if (resolvedDecimals == null) return value;
  try {
    const amount = formatTokenAmount(BigInt(value), resolvedDecimals, 2);
    return resolvedSymbol ? `${amount} ${resolvedSymbol}` : amount;
  } catch {
    return value;
  }
}

function enrichCapForDisplay(
  cap: CapInfo,
  vaultAsset: { symbol: string; decimals: number } | null
): CapInfo {
  const label =
    cap.label ??
    (cap.collateralSymbol && cap.loanSymbol
      ? `${cap.collateralSymbol}/${cap.loanSymbol}`
      : cap.collateralSymbol ?? cap.loanSymbol ?? null);

  let amountDecimals = cap.amountDecimals;
  let amountSymbol = cap.amountSymbol;

  if (cap.type === 'MarketV1' || cap.type === 'Adapter') {
    amountDecimals = amountDecimals ?? vaultAsset?.decimals ?? null;
    amountSymbol = amountSymbol ?? vaultAsset?.symbol ?? null;
  }

  return {
    ...cap,
    label,
    loanSymbol: cap.loanSymbol ?? null,
    collateralSymbol: cap.collateralSymbol ?? null,
    amountDecimals,
    amountSymbol,
  };
}

function capRowKey(cap: CapInfo, idx: number): string {
  if (cap.marketKey) return `market:${cap.marketKey}`;
  if (cap.collateralAddress) {
    return `collateral:${cap.collateralAddress}:${cap.absoluteCap}:${cap.relativeCap}`;
  }
  if (cap.adapterAddress) return `adapter:${cap.adapterAddress}:${cap.absoluteCap}`;
  return `${cap.type}:${cap.label ?? 'cap'}:${cap.absoluteCap}:${idx}`;
}

function MarketPairBadges({
  collateralSymbol,
  loanSymbol,
  label,
}: {
  collateralSymbol?: string | null;
  loanSymbol?: string | null;
  label?: string | null;
}) {
  if (collateralSymbol && loanSymbol) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant="outline" className="text-xs font-medium">
          {collateralSymbol}
        </Badge>
        <span className="text-xs text-slate-400">/</span>
        <Badge variant="secondary" className="text-xs font-medium">
          {loanSymbol}
        </Badge>
      </div>
    );
  }

  if (label) {
    return (
      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</span>
    );
  }

  return (
    <Badge variant="outline" className="text-xs font-medium">
      —
    </Badge>
  );
}

function CapsTable({
  caps,
  nameColumnLabel,
  showMarketPair,
  vaultAsset,
}: {
  caps: CapInfo[];
  nameColumnLabel: string;
  showMarketPair?: boolean;
  vaultAsset?: { symbol: string; decimals: number } | null;
}) {
  if (caps.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800">
      <Table>
        <TableHeader>
          <TableRow className="text-xs uppercase tracking-wide">
            <TableHead className="min-w-[140px]">{nameColumnLabel}</TableHead>
            <TableHead className="min-w-[120px]">Absolute Cap</TableHead>
            <TableHead className="min-w-[100px]">Relative Cap</TableHead>
            <TableHead className="min-w-[120px]">Allocation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {caps.map((cap, idx) => (
            <TableRow key={capRowKey(cap, idx)}>
              <TableCell>
                {showMarketPair ? (
                  <MarketPairBadges
                    collateralSymbol={cap.collateralSymbol}
                    loanSymbol={cap.loanSymbol}
                    label={cap.label}
                  />
                ) : (
                  <Badge variant="outline" className="text-xs font-medium">
                    {cap.label ?? cap.collateralSymbol ?? '—'}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="font-medium tabular-nums">
                {formatCapAmount(cap.absoluteCap, cap.amountDecimals, cap.amountSymbol, vaultAsset)}
              </TableCell>
              <TableCell className="tabular-nums">{formatRelativeCap(cap.relativeCap)}</TableCell>
              <TableCell className="font-medium tabular-nums">
                {formatCapAmount(cap.allocation, cap.amountDecimals, cap.amountSymbol, vaultAsset)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function VaultV2Caps({ vaultAddress, preloadedData }: VaultV2CapsProps) {
  const { data: fetchedData, isLoading, error } = useVaultV2Governance(vaultAddress);
  const data = fetchedData ?? preloadedData;

  const { marketCaps, collateralCaps, adapterCaps, vaultAsset } = useMemo(() => {
    const vaultAsset = data?.vaultAsset ?? null;
    const caps = (data?.caps ?? []).map((c) => enrichCapForDisplay(c, vaultAsset));
    const sortByLabel = (a: CapInfo, b: CapInfo) =>
      (a.label ?? '').localeCompare(b.label ?? '');

    return {
      vaultAsset,
      marketCaps: caps.filter((c) => c.type === 'MarketV1').sort(sortByLabel),
      collateralCaps: caps.filter((c) => c.type === 'Collateral').sort(sortByLabel),
      adapterCaps: caps.filter((c) => c.type === 'Adapter'),
    };
  }, [data?.caps, data?.vaultAsset]);

  if (!preloadedData && isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Caps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Caps</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600 dark:text-red-400">
            Failed to load caps: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (data.caps.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Caps</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 dark:text-slate-400">No caps configured.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Caps</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {marketCaps.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Markets</h3>
            <CapsTable caps={marketCaps} nameColumnLabel="Market" showMarketPair vaultAsset={vaultAsset} />
          </section>
        )}

        {collateralCaps.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Collateral</h3>
            <div className="flex flex-wrap gap-2">
              {collateralCaps.map((cap, idx) => (
                <div
                  key={capRowKey(cap, idx)}
                  className="min-w-[200px] flex-1 rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/40"
                >
                  <Badge variant="outline" className="mb-2 text-xs font-medium">
                    {cap.label ?? cap.collateralSymbol ?? '—'}
                  </Badge>
                  <dl className="space-y-1 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500 dark:text-slate-400">Cap</dt>
                      <dd className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                        {formatCapAmount(cap.absoluteCap, cap.amountDecimals, cap.amountSymbol, vaultAsset)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500 dark:text-slate-400">Relative</dt>
                      <dd className="tabular-nums">{formatRelativeCap(cap.relativeCap)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500 dark:text-slate-400">Allocated</dt>
                      <dd className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                        {formatCapAmount(cap.allocation, cap.amountDecimals, cap.amountSymbol, vaultAsset)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </section>
        )}

        {adapterCaps.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Adapter</h3>
            <CapsTable caps={adapterCaps} nameColumnLabel="Target" vaultAsset={vaultAsset} />
          </section>
        )}
      </CardContent>
    </Card>
  );
}
