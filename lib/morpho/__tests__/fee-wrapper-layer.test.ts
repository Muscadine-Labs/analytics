import { describe, expect, it } from '@jest/globals';
import {
  attachFeeWrappersToUnderlyings,
  feeWrapperDepositsVisible,
  type FeeWrapperLayer,
} from '../fee-wrapper-layer';

function layer(tvl: number | null): FeeWrapperLayer {
  return {
    address: '0xwrapper',
    name: 'Wrapper',
    apy: 1,
    tvl,
    totalAssets: null,
    liquidityUsd: null,
    liquidity: null,
    performanceFeePercent: null,
    managementFeePercent: null,
    adapterAddress: null,
    innerVault: { address: '0xunderlying', name: 'Strategy', apy: 1 },
  };
}

describe('feeWrapperDepositsVisible', () => {
  it('shows a wrapper only when deposits are above $100', () => {
    expect(feeWrapperDepositsVisible(layer(100.01))).toBe(true);
    expect(feeWrapperDepositsVisible(layer(100))).toBe(false);
    expect(feeWrapperDepositsVisible(layer(0))).toBe(false);
    expect(feeWrapperDepositsVisible(layer(null))).toBe(false);
    expect(feeWrapperDepositsVisible(null)).toBe(false);
  });
});

describe('attachFeeWrappersToUnderlyings', () => {
  function vaults() {
    return [
      {
        address: '0xunderlying',
        kind: 'strategy',
        feeWrapper: null as FeeWrapperLayer | null,
      },
      {
        address: '0xwrapper',
        kind: 'feeWrapper',
        underlyingAddress: '0xunderlying',
      },
    ];
  }

  it('omits a wrapper at or below $100', () => {
    const [strategy] = attachFeeWrappersToUnderlyings(
      vaults(),
      new Map([['0xwrapper', layer(100)]])
    );
    expect(strategy.feeWrapper).toBeNull();
  });

  it('attaches a wrapper above $100', () => {
    const [strategy] = attachFeeWrappersToUnderlyings(
      vaults(),
      new Map([['0xwrapper', layer(250)]])
    );
    expect(strategy.feeWrapper?.tvl).toBe(250);
  });
});
