'use client';

import { Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { MarketRiskScores, MarketRiskGrade } from '@/lib/morpho/compute-v1-market-risk';
import type { OracleTimestampData } from '@/lib/morpho/oracle-utils';
import { getOracleDisplayLines } from '@/lib/morpho/format-risk';

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 60) return 'text-sky-600 dark:text-sky-400';
  if (score >= 40) return 'text-amber-600 dark:text-amber-400';
  if (score >= 20) return 'text-orange-600 dark:text-orange-400';
  return 'text-rose-600 dark:text-rose-400';
}

function getGradeColor(grade: MarketRiskGrade): string {
  switch (grade) {
    case 'A+':
    case 'A':
    case 'A−':
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300';
    case 'B+':
    case 'B':
    case 'B−':
      return 'border-sky-500/30 bg-sky-500/15 text-sky-600 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-300';
    case 'C+':
    case 'C':
    case 'C−':
      return 'border-amber-500/30 bg-amber-500/15 text-amber-600 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300';
    case 'D':
      return 'border-orange-500/30 bg-orange-500/15 text-orange-600 dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-orange-300';
    case 'F':
      return 'border-rose-500/30 bg-rose-500/15 text-rose-600 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300';
    default:
      return 'border-gray-500/30 bg-gray-500/15 text-gray-600 dark:border-gray-400/20 dark:bg-gray-500/10 dark:text-gray-300';
  }
}

function getComponentGrade(score: number): MarketRiskGrade {
  if (score >= 93) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 87) return 'A−';
  if (score >= 84) return 'B+';
  if (score >= 80) return 'B';
  if (score >= 77) return 'B−';
  if (score >= 74) return 'C+';
  if (score >= 70) return 'C';
  if (score >= 65) return 'C−';
  if (score >= 60) return 'D';
  return 'F';
}

function ScoreBlock({
  label,
  score,
  tooltip,
  children,
}: {
  label: string;
  score: number;
  tooltip: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <p className="text-xs text-slate-600 dark:text-slate-400">{label}</p>
        <div className="group relative">
          <Info
            className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 cursor-help hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            aria-label="Information"
          />
          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64 p-2 text-xs text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 rounded-md shadow-lg border border-slate-200 dark:border-slate-700 pointer-events-none">
            {tooltip}
            <div className="absolute left-4 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-200 dark:border-t-slate-700" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <p className={cn('text-lg font-semibold', getScoreColor(score))}>{score.toFixed(2)}</p>
        <Badge
          variant="outline"
          className={cn('text-xs font-semibold px-1.5 py-0.5', getGradeColor(getComponentGrade(score)))}
        >
          {getComponentGrade(score)}
        </Badge>
      </div>
      {children}
    </div>
  );
}

export function MarketRiskScoreBreakdown({
  scores,
  utilizationPct,
  targetUtilizationPct,
  oracleTimestampData,
}: {
  scores: MarketRiskScores;
  utilizationPct: number | null;
  targetUtilizationPct: number;
  oracleTimestampData?: OracleTimestampData | null;
}) {
  const oracleLines = getOracleDisplayLines(oracleTimestampData);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2 border-t">
      <ScoreBlock
        label="Utilization"
        score={scores.utilizationScore}
        tooltip="Scored vs the IRM target (gold standard 90%). Reaching 90% utilization earns a perfect score; utilization above target reduces the score."
      >
        {utilizationPct !== null && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Current: {utilizationPct.toFixed(2)}% · Gold standard: {targetUtilizationPct.toFixed(0)}%
          </p>
        )}
      </ScoreBlock>

      <ScoreBlock
        label="Oracle Freshness"
        score={scores.oracleScore}
        tooltip="Measures how recently the price oracle was updated. Fresh oracles are most reliable; stale oracles increase risk."
      >
        {oracleLines.lastUpdated ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Last updated: {oracleLines.lastUpdated}
            {oracleLines.age ? ` (${oracleLines.age})` : ''}
          </p>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Last updated: unavailable</p>
        )}
      </ScoreBlock>

      <ScoreBlock
        label="Liquidation Headroom"
        score={scores.liquidationHeadroomScore}
        tooltip="Buffer before liquidation under a price shock (−2.5% same/derivative, −5% different assets)."
      />

      <ScoreBlock
        label="Coverage Ratio"
        score={scores.coverageRatioScore}
        tooltip="Available liquidity vs liquidatable borrows under a price shock. Ratio ≥1.0 means full liquidation coverage."
      />
    </div>
  );
}
