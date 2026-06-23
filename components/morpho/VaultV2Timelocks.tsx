'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useVaultV2Governance } from '@/lib/hooks/useVaultV2Governance';
import type { VaultV2GovernanceResponse } from '@/app/api/vaults/v2/[id]/governance/route';

interface VaultV2TimelocksProps {
  vaultAddress: string;
  preloadedData?: VaultV2GovernanceResponse | null;
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return 'Instant';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function VaultV2Timelocks({ vaultAddress, preloadedData }: VaultV2TimelocksProps) {
  const { data: fetchedData, isLoading, error } = useVaultV2Governance(vaultAddress);
  const data = preloadedData ?? fetchedData;

  if (!preloadedData && isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Timelocks</CardTitle>
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
          <CardTitle>Timelocks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600 dark:text-red-400">
            Failed to load timelocks: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (data.timelocks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Timelocks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 dark:text-slate-400">No timelocks configured.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timelocks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-1 gap-2">
          {data.timelocks.map((t) => (
            <div
              key={t.selector}
              className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800 sm:grid-cols-4 sm:items-center"
            >
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Function</p>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {t.functionName}
                  </p>
                  {t.abdicated && (
                    <Badge variant="outline" className="text-xs">
                      Abdicated
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Selector</p>
                <p className="font-mono text-xs text-slate-700 dark:text-slate-200 break-all">
                  {t.selector}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Duration</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {t.abdicated ? 'Locked' : formatDuration(t.durationSeconds)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!t.abdicated && t.durationSeconds === 0 ? (
                  <Badge variant="destructive" className="text-xs">
                    No delay
                  </Badge>
                ) : !t.abdicated ? (
                  <Badge variant="outline" className="text-xs">
                    {t.durationSeconds}s total
                  </Badge>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
