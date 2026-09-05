'use client';

import type { ReactNode } from 'react';
import { AddressBadge } from '@/components/AddressBadge';
import { Card, CardContent } from '@/components/ui/card';
import { getScanUrlForChain } from '@/lib/constants';
import {
  formatCompactUSD,
  formatNumber,
  formatPercentage,
  formatTokenAmount,
} from '@/lib/format/number';
import type { FeeWrapperLayer } from '@/lib/morpho/fee-wrapper-layer';

export type OverviewStatAmounts = {
  tvl: number | null;
  tvlUnderlying: string | null;
  liquidityUsd: number | null;
  liquidityUnderlying: string | null;
  apy: number | null;
  depositors: number | null;
  depositorHint: string;
  performanceFeePercent: number | null;
  managementFeePercent: number | null;
};

function tokenSubtitle(
  raw: string | null | undefined,
  decimals: number | null | undefined,
  symbol: string
): string | null {
  if (raw == null || decimals == null) return null;
  try {
    return `${formatTokenAmount(BigInt(raw), decimals, 2)} ${symbol}`;
  } catch {
    return null;
  }
}

export function VaultOverviewPair({
  underlying,
  wrapper,
  chainId,
  underlyingVaultName,
  assetSymbol,
  assetDecimals,
}: {
  underlying: OverviewStatAmounts;
  wrapper: FeeWrapperLayer;
  chainId: number;
  underlyingVaultName: string;
  assetSymbol: string;
  assetDecimals: number | null;
}) {
  const scanBase = getScanUrlForChain(chainId);
  const strategyLabel =
    wrapper.innerVault?.name?.trim() || underlyingVaultName.trim() || 'this vault';

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <OverviewCard title="Underlying">
        <CompactStats
          stats={underlying}
          assetSymbol={assetSymbol}
          assetDecimals={assetDecimals}
        />
      </OverviewCard>

      <OverviewCard
        title="Retail wrapper"
        subtitle={
          <AddressBadge
            address={wrapper.address}
            scanUrl={`${scanBase}/address/${wrapper.address}`}
            truncate
          />
        }
      >
        <CompactStats
          stats={{
            tvl: wrapper.tvl ?? null,
            tvlUnderlying: wrapper.totalAssets ?? null,
            liquidityUsd: wrapper.liquidityUsd ?? null,
            liquidityUnderlying: wrapper.liquidity ?? null,
            apy: wrapper.apy ?? null,
            depositors: wrapper.depositors ?? null,
            depositorHint: 'Public depositors',
            performanceFeePercent: wrapper.performanceFeePercent,
            managementFeePercent: wrapper.managementFeePercent,
          }}
          assetSymbol={assetSymbol}
          assetDecimals={assetDecimals}
        />
        <p className="mt-3 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
          Immutable parameters — deposits allocate only to the underlying Muscadine strategy vault{' '}
          <span className="font-medium text-foreground">{strategyLabel}</span>.
        </p>
      </OverviewCard>
    </div>
  );
}

function OverviewCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="px-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function CompactStats({
  stats,
  assetSymbol,
  assetDecimals,
}: {
  stats: OverviewStatAmounts;
  assetSymbol: string;
  assetDecimals: number | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      <Stat
        label="TVL"
        value={formatCompactUSD(stats.tvl)}
        hint={tokenSubtitle(stats.tvlUnderlying, assetDecimals, assetSymbol)}
      />
      <Stat
        label="Liquidity"
        value={formatCompactUSD(stats.liquidityUsd)}
        hint={tokenSubtitle(stats.liquidityUnderlying, assetDecimals, assetSymbol)}
      />
      <Stat label="APY" value={formatPercentage(stats.apy, 2)} />
      <Stat
        label="Depositors"
        value={stats.depositors != null ? formatNumber(stats.depositors) : '—'}
        hint={stats.depositorHint}
      />
      <Stat label="Performance fee" value={formatPercentage(stats.performanceFeePercent, 2)} />
      <Stat label="Management fee" value={formatPercentage(stats.managementFeePercent, 2)} />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-base font-semibold tabular-nums leading-tight text-foreground">{value}</p>
      {hint ? <p className="text-[11px] leading-tight text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
