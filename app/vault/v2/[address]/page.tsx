'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Shield } from 'lucide-react';
import { getScanUrlForChain, getScanNameForChain } from '@/lib/constants';
import { useVaultV2Complete } from '@/lib/hooks/useVaultV2Complete';
import {
  getVaultByAddress,
  getVaultListCategory,
  getVaultPageHref,
  isFeeWrapperVault,
} from '@/lib/config/vaults';
import { AppShell } from '@/components/layout/AppShell';
import { KpiCard } from '@/components/KpiCard';
import { VaultOverviewPair } from '@/components/morpho/FeeWrapperPanel';
import { VaultRiskV2 } from '@/components/morpho/VaultRiskV2';
import { VaultV2Roles } from '@/components/morpho/VaultV2Roles';
import { VaultV2Adapters } from '@/components/morpho/VaultV2Adapters';
import { VaultV2Allocations } from '@/components/morpho/VaultV2Allocations';
import { VaultV2Caps } from '@/components/morpho/VaultV2Caps';
import { VaultV2Timelocks } from '@/components/morpho/VaultV2Timelocks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTokenAmount, formatCompactUSD } from '@/lib/format/number';

export default function V2VaultPage() {
  const params = useParams();
  const router = useRouter();
  const address = params.address as string;
  const requestedCfg = getVaultByAddress(address);
  const canonicalHref =
    requestedCfg && isFeeWrapperVault(requestedCfg) ? getVaultPageHref(address) : null;
  const shouldRedirect =
    canonicalHref != null &&
    canonicalHref.toLowerCase() !== `/vault/v2/${address}`.toLowerCase();

  useEffect(() => {
    if (shouldRedirect && canonicalHref) {
      router.replace(canonicalHref);
    }
  }, [canonicalHref, router, shouldRedirect]);

  const { vault, risk, governance, vaultIsLoading, isError, error } = useVaultV2Complete(
    shouldRedirect ? null : address
  );

  if (shouldRedirect || vaultIsLoading) {
    return (
      <AppShell title="Loading vault..." description="Fetching vault data">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {[...Array(6)].map((_, idx) => (
              <Skeleton key={idx} className="h-24 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell title="Error loading vault" description={error instanceof Error ? error.message : 'Failed to load vault data'}>
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-red-600 dark:text-red-400">
              {error instanceof Error ? error.message : 'Failed to load vault data'}
            </p>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/">Back to overview</Link>
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  if (!vault) {
    return (
      <AppShell title="Vault not found" description="The vault you're looking for doesn't exist.">
        <Card>
          <CardHeader>
            <CardTitle>Missing vault</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-400">Check the address or pick a vault from the sidebar.</p>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/">Back to overview</Link>
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const category = getVaultListCategory(vault.address, vault.name);
  const vaultBadge =
    category === 'prime'
      ? 'V2 Prime'
      : category === 'vineyard'
        ? 'V2 Vineyard'
        : category === 'frontier'
          ? 'V2 Frontier'
          : 'V2';
  const feeWrapper = vault.feeWrapper ?? null;

  const morphoUiUrl = vault.address 
    ? `https://app.morpho.org/base/vault/${vault.address.toLowerCase()}`
    : '#';
  
  // Safe defaults for missing data
  const vaultName = vault.name ?? 'Unknown Vault';
  const vaultSymbol = vault.symbol ?? 'UNKNOWN';
  const vaultAsset = vault.asset ?? 'UNKNOWN';

  const tvlSubtitle = (() => {
    if (vault.totalAssets && vault.assetDecimals != null) {
      try {
        const amount = formatTokenAmount(BigInt(vault.totalAssets), vault.assetDecimals, 2);
        const symbol = vault.asset ?? vault.symbol;
        return symbol ? `${amount} ${symbol}` : amount;
      } catch {
        // ignore invalid totalAssets
      }
    }
    return 'Total Value Locked';
  })();

  const liquiditySubtitle = (() => {
    const totalAssets = risk?.liquidityBreakdown?.totalAssets;
    const decimals = risk?.vaultAsset?.decimals ?? vault.assetDecimals;
    if (totalAssets && decimals != null) {
      try {
        const amount = formatTokenAmount(BigInt(totalAssets), decimals, 2);
        const symbol = risk?.vaultAsset?.symbol ?? vault.asset ?? vault.symbol;
        return symbol ? `${amount} ${symbol}` : amount;
      } catch {
        // ignore invalid totalAssets
      }
    }
    return 'Withdrawable vault liquidity';
  })();

  const liquidityBreakdownTooltip = risk?.liquidityBreakdown ? (
    <ul className="space-y-2">
      <li className="flex items-start justify-between gap-4">
        <span className="text-muted-foreground shrink-0">Idle</span>
        <span className="font-medium text-right">{formatCompactUSD(risk.liquidityBreakdown.idleUsd)}</span>
      </li>
      <li className="flex items-start justify-between gap-4">
        <span className="text-muted-foreground shrink-0">Liquidity adapter</span>
        <span className="font-medium text-right">{formatCompactUSD(risk.liquidityBreakdown.liquidityAdapterUsd)}</span>
      </li>
      <li className="flex items-start justify-between gap-4">
        <span className="text-muted-foreground shrink-0">Force deallocation</span>
        <span className="font-medium text-right">{formatCompactUSD(risk.liquidityBreakdown.forceDeallocatableUsd)}</span>
      </li>
      <li className="flex items-start justify-between gap-4 border-t border-slate-200 pt-2 dark:border-slate-600">
        <span className="font-medium shrink-0">Total liquidity</span>
        <span className="font-semibold text-right">{formatCompactUSD(risk.liquidityBreakdown.totalUsd)}</span>
      </li>
    </ul>
  ) : undefined;

  const performanceFee =
    feeWrapper?.performanceFeePercent ??
    vault.parameters?.performanceFeePercent ??
    (vault.parameters?.performanceFeeBps != null
      ? vault.parameters.performanceFeeBps / 100
      : null);
  const managementFee =
    feeWrapper?.managementFeePercent ??
    vault.parameters?.managementFeePercent ??
    (vault.parameters?.managementFeeBps != null
      ? vault.parameters.managementFeeBps / 100
      : null);

  return (
    <AppShell
      title="Vault Details"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default" className="flex items-center gap-1 bg-blue-600 text-xs sm:text-sm">
            <Shield className="h-3 w-3" /> {vaultBadge}
          </Badge>
          <Button variant="outline" size="sm" asChild className="text-xs sm:text-sm">
            <a href={vault.address ? `${getScanUrlForChain(vault.chainId)}/address/${vault.address}` : '#'} target="_blank" rel="noreferrer">
              <span className="hidden sm:inline">View on {getScanNameForChain(vault.chainId)}</span>
              <span className="sm:hidden">{getScanNameForChain(vault.chainId)}</span>
            </a>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <Tabs defaultValue="overview" className="space-y-4">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide sm:overflow-visible">
            <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 sm:w-full justify-start gap-1">
              <TabsTrigger value="overview" className="sm:flex-1 flex-shrink-0 min-w-fit">Overview</TabsTrigger>
              <TabsTrigger value="risk" className="sm:flex-1 flex-shrink-0 min-w-fit">
                <span className="hidden sm:inline">Risk Management</span>
                <span className="sm:hidden">Risk</span>
              </TabsTrigger>
              <TabsTrigger value="roles" className="sm:flex-1 flex-shrink-0 min-w-fit">Roles</TabsTrigger>
              <TabsTrigger value="adapters" className="sm:flex-1 flex-shrink-0 min-w-fit">Adapters</TabsTrigger>
              <TabsTrigger value="allocations" className="sm:flex-1 flex-shrink-0 min-w-fit">Allocations</TabsTrigger>
              <TabsTrigger value="caps" className="sm:flex-1 flex-shrink-0 min-w-fit">Caps</TabsTrigger>
              <TabsTrigger value="timelocks" className="sm:flex-1 flex-shrink-0 min-w-fit">Timelocks</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-4">
            <Card className="gap-0 py-4">
              <CardContent className="px-4">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={morphoUiUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-lg font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors break-words"
                  >
                    {vaultName}
                  </a>
                  <Badge variant="outline" className="text-xs">
                    {vaultSymbol}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {vaultAsset}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {feeWrapper ? (
              <VaultOverviewPair
                underlying={{
                  tvl: vault.tvl,
                  tvlUnderlying: vault.totalAssets ?? null,
                  liquidityUsd: risk?.liquidityUsd ?? null,
                  liquidityUnderlying: risk?.liquidityBreakdown?.totalAssets ?? null,
                  apy: vault.apy,
                  depositors: vault.depositors,
                  depositorHint: 'Vault holders',
                  performanceFeePercent:
                    vault.parameters?.performanceFeePercent ??
                    (vault.parameters?.performanceFeeBps != null
                      ? vault.parameters.performanceFeeBps / 100
                      : null),
                  managementFeePercent:
                    vault.parameters?.managementFeePercent ??
                    (vault.parameters?.managementFeeBps != null
                      ? vault.parameters.managementFeeBps / 100
                      : null),
                }}
                wrapper={feeWrapper}
                chainId={vault.chainId}
                underlyingVaultName={vaultName}
                assetSymbol={vaultAsset}
                assetDecimals={vault.assetDecimals ?? null}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <KpiCard title="TVL" value={vault.tvl} subtitle={tvlSubtitle} format="usd" />
                <KpiCard
                  title="Liquidity"
                  value={risk?.liquidityUsd ?? null}
                  subtitle={liquiditySubtitle}
                  format="usd"
                  isLoading={!risk}
                  infoTooltip={liquidityBreakdownTooltip}
                  infoTooltipLabel="Liquidity breakdown"
                />
                <KpiCard title="APY" value={vault.apy} subtitle="Current yield rate" format="percentage" />
                <KpiCard title="Depositors" value={vault.depositors} subtitle="Vault holders" format="number" />
                <KpiCard
                  title="Performance Fee"
                  value={performanceFee}
                  subtitle="Fee on yield generated"
                  format="percentage"
                />
                <KpiCard
                  title="Management Fee"
                  value={managementFee}
                  subtitle="Annual fee on AUM"
                  format="percentage"
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="risk" className="space-y-4">
            <VaultRiskV2 vaultAddress={vault.address} preloadedData={risk} />
          </TabsContent>

          <TabsContent value="roles">
            <VaultV2Roles vaultAddress={vault.address} preloadedData={governance} />
          </TabsContent>

          <TabsContent value="adapters">
            <VaultV2Adapters vaultAddress={vault.address} preloadedData={governance} />
          </TabsContent>

          <TabsContent value="allocations">
            <VaultV2Allocations vaultAddress={vault.address} preloadedRisk={risk} />
          </TabsContent>

          <TabsContent value="caps">
            <VaultV2Caps vaultAddress={vault.address} preloadedData={governance} />
          </TabsContent>

          <TabsContent value="timelocks">
            <VaultV2Timelocks vaultAddress={vault.address} preloadedData={governance} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
