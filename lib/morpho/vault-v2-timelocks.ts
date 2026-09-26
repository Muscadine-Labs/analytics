import type { Address } from 'viem';
import { parseAbi } from 'viem';
import { multicallRead } from '@/lib/onchain/client';

export const VAULT_V2_ABDICATED_ABI = parseAbi([
  'function abdicated(bytes4 selector) view returns (bool)',
]);

export type TimelockEntry = {
  selector: string;
  functionName: string;
  durationSeconds: number;
};

export type EnrichedTimelockEntry = TimelockEntry & {
  abdicated: boolean;
};

export const HIDDEN_TIMELOCK_SELECTORS = new Set(['0x5c1a1a4f']);
export const HIDDEN_TIMELOCK_FUNCTIONS = new Set(['decreaseTimelock']);

export function isHiddenTimelock(entry: TimelockEntry): boolean {
  return (
    HIDDEN_TIMELOCK_FUNCTIONS.has(entry.functionName) ||
    HIDDEN_TIMELOCK_SELECTORS.has(entry.selector.toLowerCase())
  );
}

function normalizeSelector(selector: string): `0x${string}` {
  const hex = selector.startsWith('0x') ? selector : `0x${selector}`;
  return hex.toLowerCase() as `0x${string}`;
}

export async function enrichTimelocksWithAbdication(
  vaultAddress: Address,
  timelocks: TimelockEntry[]
): Promise<EnrichedTimelockEntry[]> {
  if (timelocks.length === 0) return [];

  const calls = timelocks.map((t) => ({
    address: vaultAddress,
    abi: VAULT_V2_ABDICATED_ABI,
    functionName: 'abdicated' as const,
    args: [normalizeSelector(t.selector)],
  }));

  let abdicatedResults = await multicallRead<boolean>(calls);
  if (abdicatedResults.some((result) => result == null)) {
    abdicatedResults = await multicallRead<boolean>(calls);
  }
  if (abdicatedResults.some((result) => result == null)) {
    throw new Error('Failed to read timelock abdication status');
  }

  return timelocks.map((t, i) => ({
    ...t,
    abdicated: abdicatedResults[i] === true,
  }));
}
