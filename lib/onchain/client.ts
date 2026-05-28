import { createPublicClient, fallback, http, Address, Abi } from 'viem';
import { base } from 'viem/chains';
import { logger } from '@/lib/utils/logger';

/** RPC endpoints in priority order; public Base RPCs are always included as fallbacks. */
function getRpcUrls(): string[] {
  const urls: string[] = [];

  if (process.env.ALCHEMY_API_KEY) {
    urls.push(`https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
  }

  if (process.env.COINBASE_CDP_API_KEY) {
    urls.push(`https://base-mainnet.cdp.coinbase.com/v1/${process.env.COINBASE_CDP_API_KEY}`);
  }

  urls.push('https://mainnet.base.org');
  urls.push('https://base.llamarpc.com');

  return urls;
}

const baseChain = {
  ...base,
  rpcUrls: {
    default: { http: getRpcUrls() },
    public: { http: getRpcUrls() },
  },
};

export const publicClient = createPublicClient({
  chain: baseChain,
  transport: fallback(getRpcUrls().map((url) => http(url))),
});

// Helper function to safely read contract data
export const safeContractRead = async <T>(
  contractAddress: Address,
  abi: Abi,
  functionName: string,
  args: unknown[] = []
): Promise<T | null> => {
  try {
    const result = await publicClient.readContract({
      address: contractAddress,
      abi,
      functionName,
      args,
    });
    return result as T;
  } catch (error) {
    logger.warn(`Failed to read ${functionName} from ${contractAddress}`, {
      contractAddress,
      functionName,
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return null;
  }
};

// Helper function for multicall
export const multicallRead = async <T>(
  contracts: Array<{
    address: Address;
    abi: Abi;
    functionName: string;
    args?: unknown[];
  }>
): Promise<(T | null)[]> => {
  try {
    const results = await publicClient.multicall({
      contracts: contracts.map(contract => ({
        address: contract.address,
        abi: contract.abi,
        functionName: contract.functionName,
        args: contract.args || [],
      })),
    });
    
    return results.map(result => {
      if (result.status === 'success') {
        return result.result as T;
      }
      return null;
    });
  } catch (error) {
    logger.warn('Multicall failed', {
      contractCount: contracts.length,
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return contracts.map(() => null);
  }
};
