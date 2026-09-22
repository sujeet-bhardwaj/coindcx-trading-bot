const {
  calculateEMA,
  calculateRSI,
  EMARSIStrategy,
  strategyRegistry,
} = require('../strategy/tradingStrategy');

async function runPhase4Tests() {
  console.log('====================================================');
  console.log('       RUNNING PHASE 4 VERIFICATION TESTS           ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
    }
  }

  // TEST 1: EMA Calculation
  const testPrices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const ema5 = calculateEMA(testPrices, 5);
  assert(
    ema5[3] === null && ema5[4] === 12 && ema5[10] >= 18,
    `EMA calculation correct (period 5 initial SMA=12, terminal EMA=${ema5[10].toFixed(2)})`
  );

  // TEST 2: RSI Calculation
  const rsiPrices = [
    44, 44.5, 45, 44.8, 45.2, 45.8, 46, 46.5, 47, 46.8, 47.5, 48, 48.5, 49, 49.5, 50,
  ];
  const rsi = calculateRSI(rsiPrices, 14);
  const latestRsi = rsi[rsi.length - 1];
  assert(
    latestRsi !== null && latestRsi >= 0 && latestRsi <= 100 && latestRsi > 70,
    `RSI calculation verified (Upward trending sequence RSI=${latestRsi?.toFixed(2)})`
  );

  // Helper to generate realistic candles with slight price movements
  function createSyntheticCandles(prices) {
    return prices.map((price, i) => ({
      open: price - 0.2,
      high: price + 0.5,
      low: price - 0.5,
      close: price,
      volume: 100,
      time: 1600000000000 + i * 60000,
    }));
  }

  // TEST 3: Strategy Signal - Bullish Crossover (BUY)
  const strategy = new EMARSIStrategy({
    fastPeriod: 5,
    slowPeriod: 10,
    rsiPeriod: 5,
    rsiOverbought: 70,
  });

  // Price series where Fast EMA was below Slow EMA, then gradually crosses above while RSI remains moderate (~55)
  const crossoverPrices = [
    100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 90, 89.5, 90.5, 90, 91, 90.5, 91.5, 91, 92, 91.8, 92.5
  ];
  const crossoverCandles = createSyntheticCandles(crossoverPrices);

  const buySignal = strategy.generateSignal({
    candles: crossoverCandles,
    currentPrice: 92.5,
    position: null,
  });

  assert(
    buySignal.signal === 'BUY' && buySignal.reason.includes('Bullish Crossover'),
    `Bullish crossover generated BUY signal: "${buySignal.reason}" (RSI: ${buySignal.indicators?.rsi})`
  );

  // TEST 4: Stop-Loss Trigger (SELL)
  const openPosition = {
    pair: 'BTCUSDT',
    side: 'buy',
    entryPrice: 80000,
    stopLossPrice: 78400, // 2% stop loss
    takeProfitPrice: 83200, // 4% take profit
  };

  const slSignal = strategy.generateSignal({
    candles: crossoverCandles,
    currentPrice: 78000, // Price dropped below Stop Loss
    position: openPosition,
  });

  assert(
    slSignal.signal === 'SELL' && slSignal.reason.includes('Stop-Loss'),
    `Stop-Loss level triggered SELL signal: "${slSignal.reason}"`
  );

  // TEST 5: Take-Profit Trigger (SELL)
  const tpSignal = strategy.generateSignal({
    candles: crossoverCandles,
    currentPrice: 83500, // Price climbed above Take Profit
    position: openPosition,
  });

  assert(
    tpSignal.signal === 'SELL' && tpSignal.reason.includes('Take-Profit'),
    `Take-Profit level triggered SELL signal: "${tpSignal.reason}"`
  );

  // TEST 6: Modular Strategy Registry
  const registered = strategyRegistry.get('EMA_RSI');
  assert(
    registered && registered.name === 'EMA_RSI',
    `Strategy Registry successfully manages modular strategies (Available: ${strategyRegistry.list().join(', ')})`
  );

  console.log('\n----------------------------------------------------');
  console.log(`Phase 4 Test Results: ${passed} / ${total} passed`);
  console.log('----------------------------------------------------');

  if (passed === total) {
    console.log('>>> PHASE 4: TRADING STRATEGY SUCCESSFUL! <<<\n');
    process.exit(0);
  } else {
    console.error('>>> PHASE 4 VERIFICATION FAILED! <<<\n');
    process.exit(1);
  }
}

runPhase4Tests().catch((err) => {
  console.error('Unhandled error in Phase 4 test suite:', err);
  process.exit(1);
});
