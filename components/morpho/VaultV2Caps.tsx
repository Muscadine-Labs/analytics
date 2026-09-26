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

function formatLltv(lltv: string | null | undefined): string | null {
  if (!lltv) return null;
  try {
    const percent = Number(BigInt(lltv)) / 1e16;
    if (!Number.isFinite(percent)) return null;
    return `${percent.toFixed(2)}% LLTV`;
  } catch {
    return null;
  }
}

type TokenFamily = {
  symbol: string;
  token: CapInfo | null;
  markets: CapInfo[];
};

function collateralKey(cap: CapInfo): string {
  return (cap.collateralSymbol ?? cap.label ?? '').trim().toLowerCase();
}

function groupTokenFamilies(collateralCaps: CapInfo[], marketCaps: CapInfo[]): TokenFamily[] {
  const assigned = new Set<CapInfo>();
  const families: TokenFamily[] = collateralCaps.map((token) => {
    const key = collateralKey(token);
    const markets = marketCaps.filter((market) => collateralKey(market) === key && key.length > 0);
    markets.forEach((market) => assigned.add(market));
    return {
      symbol: token.collateralSymbol ?? token.label ?? 'Token',
      token,
      markets,
    };
  });

  const leftovers = new Map<string, CapInfo[]>();
  for (const market of marketCaps) {
    if (assigned.has(market)) continue;
    const key = collateralKey(market) || market.marketKey || market.label || 'other';
    const group = leftovers.get(key) ?? [];
    group.push(market);
    leftovers.set(key, group);
  }
  for (const [key, markets] of leftovers) {
    families.push({
      symbol: markets[0]?.collateralSymbol ?? markets[0]?.label ?? key,
      token: null,
      markets,
    });
  }

  const byLltv = (a: CapInfo, b: CapInfo) => {
    try {
      const left = a.lltv ? BigInt(a.lltv) : null;
      const right = b.lltv ? BigInt(b.lltv) : null;
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      if (left < right) return -1;
      if (left > right) return 1;
      return 0;
    } catch {
      return (a.lltv ?? '').localeCompare(b.lltv ?? '');
    }
  };
  return families
    .map((family) => ({ ...family, markets: [...family.markets].sort(byLltv) }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function MarketPairBadges({
  collateralSymbol,
  loanSymbol,
  label,
  lltv,
}: {
  collateralSymbol?: string | null;
  loanSymbol?: string | null;
  label?: string | null;
  lltv?: string | null;
}) {
  const lltvLabel = formatLltv(lltv);

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
        {lltvLabel ? (
          <span className="text-xs text-slate-500 dark:text-slate-400">{lltvLabel}</span>
        ) : null}
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
                    lltv={cap.lltv}
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

  const { adapterCaps, families, vaultAsset } = useMemo(() => {
    const vaultAsset = data?.vaultAsset ?? null;
    const caps = (data?.caps ?? []).map((c) => enrichCapForDisplay(c, vaultAsset));
    const sortByLabel = (a: CapInfo, b: CapInfo) =>
      (a.label ?? '').localeCompare(b.label ?? '');

    return {
      vaultAsset,
      adapterCaps: caps.filter((c) => c.type === 'Adapter'),
      families: groupTokenFamilies(
        caps.filter((c) => c.type === 'Collateral').sort(sortByLabel),
        caps.filter((c) => c.type === 'MarketV1')
      ),
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
        {adapterCaps.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Adapter</h3>
            <CapsTable caps={adapterCaps} nameColumnLabel="Adapter" vaultAsset={vaultAsset} />
          </section>
        )}

        {families.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Token caps</h3>
            {families.map((family) => (
              <div
                key={family.token ? capRowKey(family.token, 0) : family.symbol}
                className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800"
              >
                <div className="flex flex-col gap-3 bg-slate-50/80 px-4 py-3 dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
                  <Badge variant="outline" className="w-fit text-xs font-medium">
                    {family.symbol}
                  </Badge>
                  {family.token ? (
                    <dl className="grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Cap</dt>
                        <dd className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                          {formatCapAmount(
                            family.token.absoluteCap,
                            family.token.amountDecimals,
                            family.token.amountSymbol,
                            vaultAsset
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Relative</dt>
                        <dd className="tabular-nums">{formatRelativeCap(family.token.relativeCap)}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Allocated</dt>
                        <dd className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                          {formatCapAmount(
                            family.token.allocation,
                            family.token.amountDecimals,
                            family.token.amountSymbol,
                            vaultAsset
                          )}
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400">No token cap</p>
                  )}
                </div>
                {family.markets.length > 0 ? (
                  <div className="border-t border-slate-200 p-3 dark:border-slate-800">
                    <CapsTable
                      caps={family.markets}
                      nameColumnLabel="Market"
                      showMarketPair
                      vaultAsset={vaultAsset}
                    />
                  </div>
                ) : (
                  <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    No markets capped for this token.
                  </p>
                )}
              </div>
            ))}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
