import { getVaultByAddress } from '@/lib/config/vaults';
import { useVault } from './useProtocolStats';
import { useVaultV2Risk } from './useVaultV2Risk';
import { useVaultV2Governance } from './useVaultV2Governance';

export function useVaultV2Complete(vaultAddress: string | null | undefined) {
  const isWrapper = vaultAddress
    ? getVaultByAddress(vaultAddress)?.kind === 'feeWrapper'
    : false;
  const vault = useVault(vaultAddress || '');
  const risk = useVaultV2Risk(vaultAddress);
  const governance = useVaultV2Governance(isWrapper ? null : vaultAddress);

  // Block the page only on vault overview. Risk/governance failures are handled in-section.
  const isLoading = vault.isLoading;
  const isError = vault.isError;
  const error = vault.error;

  return {
    vault: vault.data,
    risk: risk.data,
    governance: governance.data,
    isLoading,
    vaultIsLoading: vault.isLoading, // Separate vault loading state
    isError,
    error,
  };
}

