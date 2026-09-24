const assert = require('assert');
const {
  EMARSIStrategy,
  Scalper15MStrategy,
  strategyRegistry,
} = require('../strategy/tradingStrategy');

console.log('🧪 Starting 15-Minute Scalper & Cycle Strategy Tests...\n');

// 1. Verify Registration
const registered15M = strategyRegistry.get('SCALPER_15M');
assert(registered15M, 'SCALPER_15M must be registered in strategyRegistry');
console.log('✅ TEST 1 PASSED: SCALPER_15M successfully registered in strategyRegistry.');

// Mock candles where Fast EMA is above Slow EMA and RSI is healthy ~56 (current market condition)
const mockCandles = [];
let basePrice = 8350000;
for (let i = 0; i < 50; i++) {
  basePrice += (i % 2 === 0 ? 3000 : -1000);
  mockCandles.push({
    open: basePrice - 1000,
    high: basePrice + 2000,
    low: basePrice - 2000,
    close: basePrice,
    volume: 0.1,
    time: Date.now() - (50 - i) * 900000,
  });
}

// 2. Test SCALPER_15M Entry Signal
const scalper15M = new Scalper15MStrategy();
const scalperSignal = scalper15M.generateSignal({
  candles: mockCandles,
  currentPrice: basePrice,
});
console.log('SCALPER_15M Entry Signal:', scalperSignal.signal, '| Reason:', scalperSignal.reason);
assert.strictEqual(scalperSignal.signal, 'BUY', 'SCALPER_15M must trigger BUY on healthy uptrend/momentum');
console.log('✅ TEST 2 PASSED: SCALPER_15M actively triggers BUY without waiting for rare crossover.');

// 3. Test EMARSIStrategy Entry Signal on Current Market
const emaRsi = new EMARSIStrategy();
const emaSignal = emaRsi.generateSignal({
  candles: mockCandles,
  currentPrice: basePrice,
});
console.log('EMA_RSI Entry Signal:', emaSignal.signal, '| Reason:', emaSignal.reason);
assert.strictEqual(emaSignal.signal, 'BUY', 'EMA_RSI must now trigger BUY on active 15m trend momentum');
console.log('✅ TEST 3 PASSED: EMA_RSI actively triggers BUY on trend momentum.');

// 4. Test 15-Minute Cycle Auto-Exit at 900s
const oldPosition = {
  positionId: 'pos_test_15m',
  side: 'buy',
  entryPrice: basePrice,
  quantity: 0.001,
  createdAt: new Date(Date.now() - 905000).toISOString(), // 905 seconds ago (> 900s / 15m)
};
const exitSignal15M = scalper15M.generateSignal({
  candles: mockCandles,
  currentPrice: basePrice + 500,
  position: oldPosition,
});
console.log('15M Cycle Auto-Exit Signal:', exitSignal15M.signal, '| Reason:', exitSignal15M.reason);
assert.strictEqual(exitSignal15M.signal, 'SELL', 'Must SELL when 15-minute cycle completes');
assert(exitSignal15M.reason.includes('15M Cycle Complete'), 'Reason must mention 15M cycle complete');
console.log('✅ TEST 4 PASSED: Auto-closes trade when 15-minute cycle time is reached.');

// 5. Test Dynamic Trailing Profit in 15M Strategy
const profitPosition = {
  positionId: 'pos_test_trailing',
  side: 'buy',
  entryPrice: 8000000,
  quantity: 0.001,
  createdAt: new Date(Date.now() - 200000).toISOString(),
  peakProfitPercent: 1.2, // Peaked at +1.2%
};
// Price dropped from +1.2% to +0.8% (giveback 0.40% > 0.25%)
const currentPriceWithGiveback = 8000000 * (1 + 0.008);
const trailingSignal = scalper15M.generateSignal({
  candles: mockCandles,
  currentPrice: currentPriceWithGiveback,
  position: profitPosition,
});
console.log('Dynamic Trailing Signal:', trailingSignal.signal, '| Reason:', trailingSignal.reason);
assert.strictEqual(trailingSignal.signal, 'SELL', 'Must SELL when profit pulls back from peak');
assert(trailingSignal.reason.includes('Dynamic Trailing Profit Locked'), 'Reason must mention Trailing Profit');
console.log('✅ TEST 5 PASSED: Dynamic Trailing Take-Profit locks in gains on pullback.');

// 6. Test Fixed Stop-Loss in 15M Strategy
const losingPosition = {
  positionId: 'pos_test_sl',
  side: 'buy',
  entryPrice: 8000000,
  quantity: 0.001,
  createdAt: new Date(Date.now() - 100000).toISOString(),
};
// Price dropped -1.0% (below -0.80% fixed stop loss)
const slPrice = 8000000 * (1 - 0.01);
const slSignal = scalper15M.generateSignal({
  candles: mockCandles,
  currentPrice: slPrice,
  position: losingPosition,
});
console.log('Stop-Loss Signal:', slSignal.signal, '| Reason:', slSignal.reason);
assert.strictEqual(slSignal.signal, 'SELL', 'Must SELL when Stop-Loss is hit');
assert(slSignal.reason.includes('Fixed Stop-Loss Hit'), 'Reason must mention Stop-Loss Hit');
console.log('✅ TEST 6 PASSED: Strict Stop-Loss strictly caps minimum loss.');

console.log('\n🎉 ALL 6 15-MINUTE SCALPER & CYCLE TESTS PASSED PERFECTLY!\n');
