import type { OracleTimestampData } from './oracle-utils';

/** Gold-standard utilization target (IRM kink default). */
export const UTILIZATION_GOLD_STANDARD = 0.9;

/**
 * Format Chainlink oracle last-update time for risk displays.
 */
export function formatOracleLastUpdated(
  updatedAt: number | null | undefined
): string | null {
  if (updatedAt == null || !Number.isFinite(updatedAt)) {
    return null;
  }

  const date = new Date(updatedAt * 1000);
  const year = date.getUTCFullYear();
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const month = monthNames[date.getUTCMonth()];
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  return `${day} ${month} ${year}, ${hours}:${minutes}:${seconds} UTC`;
}

export function formatOracleAge(ageSeconds: number | null | undefined): string | null {
  if (ageSeconds == null || !Number.isFinite(ageSeconds)) {
    return null;
  }

  const ageHours = ageSeconds / 3600;
  const ageDays = ageHours / 24;

  if (ageHours < 1) {
    return `${ageHours.toFixed(1)}h ago`;
  }
  if (ageDays < 7) {
    return `${ageDays.toFixed(1)}d ago`;
  }
  return `${ageDays.toFixed(0)}d ago`;
}

type OracleTimestampLike = {
  updatedAt?: number | null;
  ageSeconds?: number | null;
} | null | undefined;

export function getOracleDisplayLines(
  oracleTimestampData?: OracleTimestampData | OracleTimestampLike
): { lastUpdated: string | null; age: string | null } {
  return {
    lastUpdated: formatOracleLastUpdated(oracleTimestampData?.updatedAt),
    age: formatOracleAge(oracleTimestampData?.ageSeconds),
  };
}
