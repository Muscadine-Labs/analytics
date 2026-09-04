import { BASE_CHAIN_ID } from '@/lib/constants';

export type VaultListCategory = 'prime' | 'vineyard' | 'frontier';
export type VaultKind = 'strategy' | 'feeWrapper';

/**
 * `strategy` — allocates to Morpho Blue markets (MorphoMarketV1Adapter).
 * `feeWrapper` — single MorphoVaultV2Adapter into another Vault V2.
 */
export interface VaultAddressConfig {
  address: string;
  chainId: number;
  listCategory: VaultListCategory;
  /** Default `strategy`. Fee wrappers only allocate to one underlying Vault V2. */
  kind?: VaultKind;
  /** Child Vault V2 when `kind` is `feeWrapper`. GraphQL fallback for `innerVault`. */
  underlyingAddress?: string;
}

const VAULT_USDC_PRIME =
  process.env.NEXT_PUBLIC_VAULT_USDC_V2 || '0x89712980Cb434eF5aE4AB29349419eb976B0b496';
const VAULT_WETH_PRIME =
  process.env.NEXT_PUBLIC_VAULT_WETH_V2 || '0xd6dcad2f7da91fbb27bda471540d9770c97a5a43';
const VAULT_CBBTC_PRIME =
  process.env.NEXT_PUBLIC_VAULT_CBBTC_V2 || '0x99dcd0d75822ba398f13b2a8852b07c7e137ec70';
const VAULT_USDC_FRONTIER =
  process.env.NEXT_PUBLIC_VAULT_USDC_FRONTIER_V2 || '0x314fD07319ef645bA7D548915CCd91F4788A1839';

export const vaultAddresses: VaultAddressConfig[] = [
  {
    address: VAULT_USDC_PRIME,
    chainId: BASE_CHAIN_ID,
    listCategory: 'prime',
  },
  {
    address: VAULT_WETH_PRIME,
    chainId: BASE_CHAIN_ID,
    listCategory: 'prime',
  },
  {
    address: VAULT_CBBTC_PRIME,
    chainId: BASE_CHAIN_ID,
    listCategory: 'prime',
  },
  {
    address: VAULT_USDC_FRONTIER,
    chainId: BASE_CHAIN_ID,
    listCategory: 'frontier',
  },
  {
    address:
      process.env.NEXT_PUBLIC_VAULT_USDC_PRIME_WRAPPER ||
      '0x036A01eFdDC87F6634FFDE0533EE528b90fc7A45',
    chainId: BASE_CHAIN_ID,
    listCategory: 'prime',
    kind: 'feeWrapper',
    underlyingAddress: VAULT_USDC_PRIME,
  },
  {
    address:
      process.env.NEXT_PUBLIC_VAULT_WETH_PRIME_WRAPPER ||
      '0x548653b09b03A69f93B3890c382fE9DcD245cbc4',
    chainId: BASE_CHAIN_ID,
    listCategory: 'prime',
    kind: 'feeWrapper',
    underlyingAddress: VAULT_WETH_PRIME,
  },
  {
    address:
      process.env.NEXT_PUBLIC_VAULT_CBBTC_PRIME_WRAPPER ||
      '0x0e0a857d2AF1A2d43c82d1FA54766239CAb70147',
    chainId: BASE_CHAIN_ID,
    listCategory: 'prime',
    kind: 'feeWrapper',
    underlyingAddress: VAULT_CBBTC_PRIME,
  },
  {
    address:
      process.env.NEXT_PUBLIC_VAULT_USDC_FRONTIER_WRAPPER ||
      '0x54D8417bD21C86A7806b58f5aa2e2E0bB88B856A',
    chainId: BASE_CHAIN_ID,
    listCategory: 'frontier',
    kind: 'feeWrapper',
    underlyingAddress: VAULT_USDC_FRONTIER,
  },
];

export const getVaultByAddress = (address: string): VaultAddressConfig | undefined => {
  return vaultAddresses.find(vault => vault.address.toLowerCase() === address.toLowerCase());
};

export const getAllVaultAddresses = (): VaultAddressConfig[] => {
  return vaultAddresses;
};

export function isFeeWrapperVault(
  vault: { kind?: VaultKind | null } | null | undefined
): boolean {
  return vault?.kind === 'feeWrapper';
}

const WRAPPER_SUFFIX_RE = /\(\s*wrapper\s*\)\s*$/i;

/** Append ` (wrapper)` for fee-wrapper addresses. Idempotent. */
export function withFeeWrapperLabel(
  name: string | null | undefined,
  address: string | null | undefined,
  fallback = 'Unknown Vault'
): string {
  const base = name?.trim() || fallback;
  if (!address) return base;
  if (getVaultByAddress(address)?.kind !== 'feeWrapper') return base;
  if (WRAPPER_SUFFIX_RE.test(base)) return base;
  return `${base} (wrapper)`;
}

/** GraphQL `innerVault.address`, else the wrapper's configured underlying vault. */
export function resolveUnderlyingVaultAddress(
  wrapperAddress: string,
  graphQlAddress?: string | null
): string | null {
  if (graphQlAddress) return graphQlAddress;
  return getVaultByAddress(wrapperAddress)?.underlyingAddress ?? null;
}

/**
 * Strategy vaults for protocol TVL. Fee wrappers deposit into underlying vaults —
 * summing both would double-count.
 */
export const getVaultAddressesForProtocolStats = (): VaultAddressConfig[] => {
  return vaultAddresses.filter((v) => v.kind !== 'feeWrapper');
};

export const getVaultListCategory = (
  address: string,
  vaultName?: string | null
): VaultListCategory => {
  const configured = getVaultByAddress(address);
  if (configured?.listCategory) {
    return configured.listCategory;
  }

  if (!vaultName) {
    return 'prime';
  }
  const name = vaultName.toLowerCase();
  if (name.includes('frontier')) {
    return 'frontier';
  }
  if (name.includes('vineyard')) {
    return 'vineyard';
  }
  return 'prime';
};

const CATEGORY_LABEL: Record<VaultListCategory, string> = {
  prime: 'Prime',
  frontier: 'Frontier',
  vineyard: 'Vineyard',
};

export const VAULT_LIST_KIND_ORDER = ['underlying', 'wrapper'] as const;
export type VaultListKind = (typeof VAULT_LIST_KIND_ORDER)[number];

export const VAULT_LIST_KIND_LABEL: Record<VaultListKind, string> = {
  underlying: 'Underlying',
  wrapper: 'Wrapper',
};

export const VAULT_LIST_CATEGORY_ORDER: readonly VaultListCategory[] = [
  'prime',
  'frontier',
  'vineyard',
];

export function getVaultListKind(
  vault: { kind?: VaultKind | null; address?: string } | null | undefined
): VaultListKind {
  const kind =
    vault?.kind ??
    (vault?.address ? getVaultByAddress(vault.address)?.kind : undefined);
  return kind === 'feeWrapper' ? 'wrapper' : 'underlying';
}

export type VaultListCategoryGroup<T> = {
  category: VaultListCategory;
  label: string;
  vaults: T[];
};

export type VaultListKindGroup<T> = {
  kind: VaultListKind;
  label: string;
  categories: VaultListCategoryGroup<T>[];
};

type GroupableVault = {
  kind?: VaultKind | null;
  name?: string | null;
  address: string;
};

/** Nested list groups: Underlying / Wrapper, then Prime / Frontier / Vineyard. */
export function groupVaultsByKindAndCategory<T extends GroupableVault>(
  vaults: readonly T[]
): VaultListKindGroup<T>[] {
  const groups: VaultListKindGroup<T>[] = [];
  for (const kind of VAULT_LIST_KIND_ORDER) {
    const ofKind = vaults.filter((v) => getVaultListKind(v) === kind);
    if (ofKind.length === 0) continue;
    const categories: VaultListCategoryGroup<T>[] = [];
    for (const category of VAULT_LIST_CATEGORY_ORDER) {
      const matched = ofKind.filter(
        (v) => getVaultListCategory(v.address, v.name) === category
      );
      if (matched.length === 0) continue;
      categories.push({
        category,
        label: CATEGORY_LABEL[category],
        vaults: matched,
      });
    }
    if (categories.length === 0) continue;
    groups.push({
      kind,
      label: VAULT_LIST_KIND_LABEL[kind],
      categories,
    });
  }
  return groups;
}
