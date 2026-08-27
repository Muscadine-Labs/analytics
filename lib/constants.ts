/**
 * Application Constants
 * Centralized constants to avoid magic numbers throughout the codebase
 */

// Network Configuration
export const ETHEREUM_CHAIN_ID = 1;
export const BASE_CHAIN_ID = 8453;

// Networks for sidebar (order: Ethereum, Base)
export const SIDEBAR_NETWORKS = [
  { chainId: ETHEREUM_CHAIN_ID, name: 'Ethereum' },
  { chainId: BASE_CHAIN_ID, name: 'Base' },
] as const;

// Block Explorer URLs
export const ETHEREUM_SCAN_URL = 'https://etherscan.io';
export const BASE_SCAN_URL = 'https://basescan.org';

const CHAIN_SCAN_URLS: Record<number, string> = {
  [ETHEREUM_CHAIN_ID]: ETHEREUM_SCAN_URL,
  [BASE_CHAIN_ID]: BASE_SCAN_URL,
};

/** Returns block explorer base URL for a chain. Falls back to Base if unknown. */
export function getScanUrlForChain(chainId: number): string {
  return CHAIN_SCAN_URLS[chainId] ?? BASE_SCAN_URL;
}

/** Returns block explorer display name for a chain (e.g. "Etherscan", "Basescan"). */
export function getScanNameForChain(chainId: number): string {
  return chainId === ETHEREUM_CHAIN_ID ? 'Etherscan' : 'Basescan';
}

// Fee conversion (decimal 0–1 to basis points)
export const BPS_PER_ONE = 10000;

// GraphQL Query Limits
export const GRAPHQL_FIRST_LIMIT = 1000;
export const GRAPHQL_TRANSACTIONS_LIMIT = 10;

export const MINUTE_MS = 60_000;

// API Configuration
export const MORPHO_GRAPHQL_ENDPOINT = 'https://api.morpho.org/graphql';

export function getMorphoMarketUrl(chainId: number, marketId: string): string {
  const network = chainId === ETHEREUM_CHAIN_ID ? 'ethereum' : 'base';
  return `https://app.morpho.org/${network}/market/${marketId}`;
}

export function getMorphoVaultUrl(chainId: number, vaultAddress: string): string {
  const network = chainId === ETHEREUM_CHAIN_ID ? 'ethereum' : 'base';
  return `https://app.morpho.org/${network}/vault/${vaultAddress.toLowerCase()}`;
}

// Request Timeouts
export const EXTERNAL_API_TIMEOUT_MS = 60000; // 60 seconds

// Rate Limiting
export const RATE_LIMIT_REQUESTS_PER_MINUTE = 60;
