import { BASE_CHAIN_ID } from '@/lib/constants';

// Simplified vault config - only stores addresses
// All other data (name, symbol, asset, performance fee, etc.) is fetched from GraphQL
export type MorphoVersion = 'v2';
export type VaultListCategory = 'prime' | 'vineyard' | 'frontier';

export interface VaultAddressConfig {
  address: string;
  chainId: number;
  morphoVersion: MorphoVersion;
  listCategory: VaultListCategory;
}

// Vault addresses only - all other data fetched from GraphQL
export const vaultAddresses: VaultAddressConfig[] = [
  // V2 Prime Vaults
  {
    address: process.env.NEXT_PUBLIC_VAULT_USDC_V2 || '0x89712980Cb434eF5aE4AB29349419eb976B0b496',
    chainId: BASE_CHAIN_ID,
    morphoVersion: 'v2',
    listCategory: 'prime',
  },
  {
    address: process.env.NEXT_PUBLIC_VAULT_WETH_V2 || '0xd6dcad2f7da91fbb27bda471540d9770c97a5a43',
    chainId: BASE_CHAIN_ID,
    morphoVersion: 'v2',
    listCategory: 'prime',
  },
  {
    address: process.env.NEXT_PUBLIC_VAULT_CBBTC_V2 || '0x99dcd0d75822ba398f13b2a8852b07c7e137ec70',
    chainId: BASE_CHAIN_ID,
    morphoVersion: 'v2',
    listCategory: 'prime',
  },
  // V2 Frontier Vaults
  {
    address: process.env.NEXT_PUBLIC_VAULT_USDC_FRONTIER_V2 || '0x314fD07319ef645bA7D548915CCd91F4788A1839',
    chainId: BASE_CHAIN_ID,
    morphoVersion: 'v2',
    listCategory: 'frontier',
  },
];

// Helper functions
export const getVaultByAddress = (address: string): VaultAddressConfig | undefined => {
  return vaultAddresses.find(vault => vault.address.toLowerCase() === address.toLowerCase());
};

export const getAllVaultAddresses = (): VaultAddressConfig[] => {
  return vaultAddresses;
};

/** @deprecated Use VaultListCategory */
export type VaultCategory = VaultListCategory;

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

/** @deprecated Use getVaultListCategory with address */
export const getVaultCategory = (vaultName: string | null | undefined): VaultListCategory => {
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

export const shouldUseV2Query = (_vaultName?: string | null): boolean => true;
