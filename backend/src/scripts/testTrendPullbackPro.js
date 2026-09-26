const assert = require('assert');
const {
  strategyRegistry,
  TrendPullbackProStrategy,
  calculateATR,
  calculateADX,
} = require('../strategy/tradingStrategy');
const { evaluateExit } = require('../risk/exitEngine');
const { riskManager } = require('../risk/riskManager');

console.log('--- RUNNING RIGOROUS VERIFICATION FOR HIGH-PROFIT CONSECUTIVE TRADING ---');

// 1. Check Strategy Registration
const strat = strategyRegistry.get('TREND_PULLBACK_PRO');
assert(strat, 'TREND_PULLBACK_PRO must be registered in strategyRegistry');
assert.strictEqual(strat.name, 'TREND_PULLBACK_PRO');
console.log('✅ TEST 1 PASSED: TREND_PULLBACK_PRO registered in strategyRegistry.');

// 2. Check Indicator Calculations (ATR & ADX)
const sampleCandles = [];
for (let i = 0; i < 40; i++) {
  sampleCandles.push({
    open: 100 + i * 0.5,
    high: 102 + i * 0.5,
    low: 98 + i * 0.5,
    close: 101 + i * 0.5,
    volume: 1000 + i * 10,
  });
}

const atr = calculateATR(sampleCandles, 14);
assert(atr.length === sampleCandles.length, 'ATR array length must match sampleCandles length');
console.log('✅ TEST 2 PASSED: calculateATR computed smoothly.');

const adx = calculateADX(sampleCandles, 14);
assert(adx.adx.length === sampleCandles.length, 'ADX array length must match sampleCandles length');
console.log('✅ TEST 3 PASSED: calculateADX computed smoothly.');

// 3. Check Fee-Aware Exit Engine with Indian Crypto TDS
const dummyPosition = {
  entryPrice: 6000000,
  currentPrice: 6000000,
  peakProfitPercent: 0,
  lockedProfitPercent: 0,
  side: 'buy',
};

const feeCfg = {
  maxLossPercent: 1.5,
  profitLockLevels: [3.5, 5.5, 8, 12, 15],
  profitLockStepAfterLast: 1.5,
  lockBufferPercent: 0.4,
  breakevenTriggerPercent: 2.5,
  feeAware: true,
  feeDeductionPercent: 1.5,
};

// Scenario A: Trade rallies to +3.6% gross (net is +2.1%). Ladder level 3.5% should be locked!
const rallyPrice = 6000000 * 1.036;
const exitRally = evaluateExit(dummyPosition, rallyPrice, feeCfg);
assert(exitRally.state.peakProfitPercent >= 2.0, 'Peak profit should be tracked');
console.log(`✅ TEST 4 PASSED: Rally to +3.6% gross tracked. Peak net profit: ${exitRally.state.peakProfitPercent.toFixed(2)}%`);

// Scenario B: Breakeven Stop Check - If trade peaked at +2.6% gross and pulls back to +1.4% gross (net -0.1%)
const peakedPos = {
  entryPrice: 6000000,
  currentPrice: 6000000 * 1.014,
  peakProfitPercent: 2.6 - 1.5, // 1.1% net peak
  lockedProfitPercent: 0,
  side: 'buy',
};
const beCfg = {
  ...feeCfg,
  breakevenTriggerPercent: 1.0, // net trigger
};
const exitBE = evaluateExit(peakedPos, peakedPos.currentPrice, beCfg);
assert.strictEqual(exitBE.action, 'SELL', 'Must trigger SELL to avoid negative net return after TDS');
assert(exitBE.reason.includes('Breakeven Stop triggered'), 'Reason must mention breakeven');
console.log(`✅ TEST 5 PASSED: Breakeven stop triggered correctly before taking net loss: ${exitBE.reason}`);

// 4. Consecutive Trade Ready Check
riskManager.tradingMode = 'PAPER_TRADING';
riskManager.setBotEnabled(true);
riskManager.resetLossCooldown();
riskManager.resetTradeCooldown();
const checkResult = riskManager.validateOrderPreCheck({
  pair: 'BTCINR',
  side: 'buy',
  amountQuote: 2500,
  currentPrice: 6000000,
  priceTimestamp: Date.now(),
  openPositionsCount: 0,
});
assert.strictEqual(checkResult.passed, true, `validateOrderPreCheck must be valid, got: ${checkResult.reason}`);
console.log('✅ TEST 6 PASSED: Pre-check is valid for continuous instant trades.');

console.log('\n🎉 ALL HIGH-PROFIT & CONSECUTIVE TRADE VERIFICATIONS PASSED SUCCESSFULLY!');
