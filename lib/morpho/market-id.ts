/** Resolve a Morpho market identifier (prefer `marketId` over deprecated `id`). */
export function resolveMarketId(
  market: { marketId?: string | null; id?: string | null } | null | undefined
): string {
  return market?.marketId ?? market?.id ?? '';
}
