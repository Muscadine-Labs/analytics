import { useQuery } from '@tanstack/react-query';
import type { VaultV2GovernanceResponse } from '@/app/api/vaults/v2/[id]/governance/route';

async function fetchVaultV2Governance(vaultAddress: string): Promise<VaultV2GovernanceResponse> {
  const res = await fetch(`/api/vaults/v2/${vaultAddress}/governance`, {
    credentials: 'omit',
  });

  if (!res.ok) {
    const text = await res.text();
    let json: { message?: string; error?: string } | null = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    throw new Error(json?.message || json?.error || text || 'Failed to fetch vault governance data');
  }

  return res.json();
}

export function useVaultV2Governance(vaultAddress: string | null | undefined) {
  return useQuery({
    queryKey: ['vault-v2-governance', vaultAddress, 'caps-v2'],
    queryFn: () => {
      if (!vaultAddress) {
        throw new Error('Vault address is required');
      }
      return fetchVaultV2Governance(vaultAddress);
    },
    enabled: Boolean(vaultAddress),
  });
}

