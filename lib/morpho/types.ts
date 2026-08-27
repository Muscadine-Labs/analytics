export type MorphoMarketRaw = {
  marketId?: string | null;
  id?: string | null;
  chain?: { id?: number | null } | null;
  loanAsset?: { symbol?: string | null; decimals?: number | null } | null;
  collateralAsset?: { symbol?: string | null; decimals?: number | null } | null;
  state?: {
    supplyAssetsUsd?: number | null;
    borrowAssetsUsd?: number | null;
    collateralAssetsUsd?: number | null;
    liquidityAssetsUsd?: number | null;
    sizeUsd?: number | null;
    supplyApy?: number | null;
    borrowApy?: number | null;
    utilization?: number | null;
  } | null;
};

export type CuratorWeights = {
  utilization: number;
  rateAlignment: number;
  stressExposure: number;
  withdrawalLiquidity: number;
  liquidationCapacity: number;
};

export type CuratorConfig = {
  morphoApiUrl: string;
  utilizationCeiling: number;
  utilizationBufferHours: number;
  maxUtilizationBeyond?: number;
  rateAlignmentEps: number;
  rateAlignmentHighYieldBuffer?: number;
  rateAlignmentHighYieldEps?: number;
  fallbackBenchmarkRate: number;
  priceStressPct: number;
  liquidityStressPct: number;
  withdrawalLiquidityMinPct: number;
  insolvencyTolerancePctTvl: number;
  minTvlUsd?: number;
  weights: CuratorWeights;
  configVersion?: string;
};

export type MorphoMarketMetrics = {
  id: string;
  symbol: string;
  utilization: number;
  utilizationScore: number;
  supplyRate: number | null;
  borrowRate: number | null;
  benchmarkSupplyRate: number | null;
  rateAlignmentScore: number;
  potentialInsolvencyUsd: number;
  insolvencyPctOfTvl: number;
  stressExposureScore: number;
  availableLiquidity: number;
  requiredLiquidity: number;
  withdrawalLiquidityScore: number;
  liquidatorCapacityPostStress: number;
  liquidationCapacityScore: number;
  tvlUsd: number;
  minTvlThresholdHit: boolean;
  insufficientTvl: boolean;
  effectiveWeights: CuratorWeights;
  rating: number | null;
  configVersion?: string;
  raw: MorphoMarketRaw;
};

export type MorphoMarketsResponse = {
  timestamp: string;
  markets: MorphoMarketMetrics[];
};
