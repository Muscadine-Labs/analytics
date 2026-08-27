// Format USD amounts
export const formatUSD = (amount: number | bigint | null, decimals: number = 2): string => {
  if (amount === null || amount === undefined) return '—';

  const numAmount = typeof amount === 'bigint' ? Number(amount) : amount;
  if (!Number.isFinite(numAmount)) return '—';

  if (numAmount === 0) return '$0.00';
  // Only show <$0.01 for positive values between 0 and 0.01
  if (numAmount > 0 && numAmount < 0.01) return '<$0.01';
  // For negative values between -0.01 and 0, show >-$0.01
  if (numAmount < 0 && numAmount > -0.01) return '>-$0.01';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numAmount);
};

// Format compact USD amounts (K, M, B)
export const formatCompactUSD = (amount: number | bigint | null): string => {
  if (amount === null || amount === undefined) return '—';

  const numAmount = typeof amount === 'bigint' ? Number(amount) : amount;
  if (!Number.isFinite(numAmount)) return '—';

  if (numAmount === 0) return '$0.00';
  if (numAmount < 1000) return formatUSD(numAmount, 2);
  
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  return formatter.format(numAmount);
};

// Format percentage
export const formatPercentage = (value: number | null, decimals: number = 2): string => {
  if (value === null || value === undefined) return '—';
  
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
};

// Format large numbers with commas
export const formatNumber = (value: number | bigint | null): string => {
  if (value === null || value === undefined) return '—';

  const numValue = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isFinite(numValue)) return '—';
  
  return new Intl.NumberFormat('en-US').format(numValue);
};

// Format compact numbers (K, M, B)
export const formatCompactNumber = (value: number | bigint | null): string => {
  if (value === null || value === undefined) return '—';

  const numValue = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isFinite(numValue)) return '—';
  
  if (numValue < 1000) return numValue.toString();
  
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(numValue);
};

// Format address (truncate middle)
export const formatAddress = (address: string | null, startChars: number = 6, endChars: number = 4): string => {
  if (!address) return 'N/A';
  
  if (address.length <= startChars + endChars) return address;
  
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
};

/** Format LTV to a percentage string (2 decimals). Handles wei (n>1e6), fraction (n<=1), or plain %. */
export function formatLtv(lltv: number | string | null | undefined): string {
  const n = typeof lltv === 'string' ? Number(lltv) : lltv;
  if (n == null || !Number.isFinite(n)) return '—';
  if (n > 1_000_000) return `${((n / 1e18) * 100).toFixed(2)}%`;
  if (n <= 1) return `${(n * 100).toFixed(2)}%`;
  return `${n.toFixed(2)}%`;
}

// Format token amount with decimals
export const formatTokenAmount = (
  amount: bigint | number | null | undefined,
  decimals: number,
  displayDecimals: number = 2
): string => {
  if (amount === null || amount === undefined || !Number.isFinite(decimals) || decimals <= 0) {
    return '0.00';
  }
  if (amount === 0n || amount === 0) return '0.00';

  const numAmount = typeof amount === 'bigint' ? Number(amount) : amount;
  const divisor = Math.pow(10, decimals);
  const formatted = numAmount / divisor;

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: displayDecimals,
    maximumFractionDigits: displayDecimals,
  }).format(formatted);
};
