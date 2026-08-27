import { gql } from 'graphql-request';
import { GRAPHQL_FIRST_LIMIT } from '@/lib/constants';
import { morphoGraphQLClient } from './graphql-client';

const MAX_POSITION_PAGES = 25;

const VAULT_V2_POSITIONS_PAGE_QUERY = gql`
  query VaultV2PositionsPage($address: String!, $chainId: Int!, $first: Int!, $skip: Int!) {
    vaultV2ByAddress(address: $address, chainId: $chainId) {
      positions(first: $first, skip: $skip) {
        items { user { address } }
      }
    }
  }
`;

/**
 * Paginate V2 vault positions so depositor counts are not truncated at GraphQL `first`.
 */
export async function collectVaultV2DepositorAddresses(
  address: string,
  chainId: number
): Promise<Set<string>> {
  const users = new Set<string>();
  const pageSize = GRAPHQL_FIRST_LIMIT;

  for (let page = 0; page < MAX_POSITION_PAGES; page++) {
    const data = await morphoGraphQLClient.request<{
      vaultV2ByAddress?: {
        positions?: { items?: Array<{ user?: { address?: string } | null } | null> | null } | null;
      } | null;
    }>(VAULT_V2_POSITIONS_PAGE_QUERY, {
      address,
      chainId,
      first: pageSize,
      skip: page * pageSize,
    });

    const items = data.vaultV2ByAddress?.positions?.items ?? [];
    for (const item of items) {
      const userAddress = item?.user?.address?.toLowerCase();
      if (userAddress) {
        users.add(userAddress);
      }
    }

    if (items.length < pageSize) {
      break;
    }
  }

  return users;
}
