import { gql } from 'graphql-request';
import type { CuratorConfig, MorphoMarketRaw } from './types';
import { BASE_CHAIN_ID } from '@/lib/constants';
import { morphoGraphQLClient } from './graphql-client';

const MARKETS_QUERY = gql`
  query MorphoMarkets($first: Int!, $chainIds: [Int!]) {
    markets(first: $first, where: { chainId_in: $chainIds }) {
      items {
        marketId
        chain { id }
        loanAsset {
          symbol
          decimals
        }
        collateralAsset {
          symbol
          decimals
        }
        state {
          supplyAssetsUsd
          borrowAssetsUsd
          collateralAssetsUsd
          liquidityAssetsUsd
          sizeUsd
          supplyApy
          borrowApy
          utilization
        }
      }
    }
  }
`;

type MarketsQueryResponse = {
  markets: {
    items: Array<MorphoMarketRaw | null> | null;
  } | null;
};

export async function fetchMorphoMarkets(
  limit = 200,
  _config?: CuratorConfig,
  chainIds: number[] = [BASE_CHAIN_ID]
): Promise<MorphoMarketRaw[]> {
  const data = await morphoGraphQLClient.request<MarketsQueryResponse>(
    MARKETS_QUERY,
    { first: limit, chainIds }
  );

  return data.markets?.items?.filter((item): item is MorphoMarketRaw => item !== null) ?? [];
}
