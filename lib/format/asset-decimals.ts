/** Asset-aware decimals for display and parsing. */

export function normalizeAssetSymbol(symbol: string | null | undefined): string {
  return (symbol ?? '').trim().toUpperCase();
}

export function getKnownAssetDecimals(symbol: string | null | undefined): number | null {
  const raw = normalizeAssetSymbol(symbol);
  if (!raw) return null;

  const core = raw.replace(/^CB/, '');

  if (core === 'USDC' || core === 'USDT' || core === 'USDBC') return 6;
  if (core === 'WETH' || core === 'ETH') return 18;
  if (core === 'BTC' || core === 'cbBTC' || core === 'CBTBTC' || core === 'LBTC') return 8;

  return null;
}

export function resolveAssetDecimals(
  symbol: string | null | undefined,
  apiDecimals?: number | null
): number {
  if (apiDecimals != null && apiDecimals >= 0 && apiDecimals <= 36) return apiDecimals;
  const known = getKnownAssetDecimals(symbol);
  if (known != null) return known;
  return 18;
}

export function getTokenDisplayDecimals(
  symbol: string | null | undefined,
  chainDecimals: number
): number {
  const raw = normalizeAssetSymbol(symbol);
  const core = raw.replace(/^CB/, '');

  if (core === 'USDC' || core === 'USDT' || core === 'USDBC') return 3;
  if (core === 'DAI') return Math.min(chainDecimals, 6);
  if (core === 'WETH' || core === 'ETH') return 6;
  if (core === 'BTC' || core === 'WBTC' || core === 'TBTC' || core === 'LBTC') return 6;

  const known = getKnownAssetDecimals(symbol);
  if (known != null) return Math.min(known, 6);
  return Math.min(Math.max(chainDecimals, 0), 6);
}
