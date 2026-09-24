const assert = require('assert');
const config = require('../config/env');
const authMiddleware = require('../middleware/authMiddleware');
const { validateSettingsPayload } = require('../controllers/botController');
const {
  strategyRegistry,
  calculateSMA,
  calculateBollingerBands,
  calculateMACD,
  BollingerBandsStrategy,
  GridStrategy,
  MACDRSIStrategy,
} = require('../strategy/tradingStrategy');
const tradingBot = require('../bot/tradingBot');
const { PaperTradingEngine } = require('../services/paperTradingEngine');
const backtestService = require('../services/backtestService');

async function runOverhaulTests() {
  console.log('====================================================');
  console.log('    RUNNING ARCHITECTURE & SECURITY OVERHAUL TESTS  ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}: ${err.message}`);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}: ${err.message}`);
    }
  }

  // --- 1. AUTH MIDDLEWARE TESTS ---
  console.log('--- 1. Security & Authentication Tests ---');
  test('Auth middleware blocks requests with missing token', () => {
    let statusSent = null;
    let jsonSent = null;
    const req = { headers: {} };
    const res = {
      status(s) {
        statusSent = s;
        return this;
      },
      json(j) {
        jsonSent = j;
      },
    };
    let nextCalled = false;
    authMiddleware(req, res, () => {
      nextCalled = true;
    });
    assert.strictEqual(statusSent, 401);
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(jsonSent.success, false);
  });

  test('Auth middleware blocks requests with wrong token', () => {
    let statusSent = null;
    const req = { headers: { authorization: 'Bearer wrong-secret' } };
    const res = {
      status(s) {
        statusSent = s;
        return this;
      },
      json() {},
    };
    let nextCalled = false;
    authMiddleware(req, res, () => {
      nextCalled = true;
    });
    assert.strictEqual(statusSent, 401);
    assert.strictEqual(nextCalled, false);
  });

  test('Auth middleware allows requests with valid Bearer token', () => {
    const req = { headers: { authorization: `Bearer ${config.apiSecretKey}` } };
    const res = {};
    let nextCalled = false;
    authMiddleware(req, res, () => {
      nextCalled = true;
    });
    assert.strictEqual(nextCalled, true);
  });

  test('Auth middleware allows requests with valid x-api-key header', () => {
    const req = { headers: { 'x-api-key': config.apiSecretKey } };
    const res = {};
    let nextCalled = false;
    authMiddleware(req, res, () => {
      nextCalled = true;
    });
    assert.strictEqual(nextCalled, true);
  });

  // --- 2. SETTINGS VALIDATION TESTS ---
  console.log('\n--- 2. Risk & Settings Validation Tests ---');
  test('Rejects negative trade amount', () => {
    const err = validateSettingsPayload({ tradeAmount: -100 });
    assert.ok(err && err.includes('Trade Amount'));
  });

  test('Rejects zero or excessive stop-loss', () => {
    const err1 = validateSettingsPayload({ stopLossPercent: 0 });
    const err2 = validateSettingsPayload({ stopLossPercent: 75 });
    assert.ok(err1 && err2);
  });

  test('Rejects unknown strategy name', () => {
    const err = validateSettingsPayload({ strategy: 'INVALID_STRATEGY' });
    assert.ok(err && err.includes('Invalid strategy'));
  });

  test('Rejects invalid evaluation interval', () => {
    const err = validateSettingsPayload({ evalIntervalMs: 500 }); // min is 1000ms
    assert.ok(err && err.includes('Evaluation Interval'));
  });

  test('Accepts valid settings configuration', () => {
    const err = validateSettingsPayload({
      tradeAmount: 100,
      stopLossPercent: 2.5,
      takeProfitPercent: 5.0,
      maxOpenPositions: 3,
      evalIntervalMs: 5000,
      strategy: 'BOLLINGER_BANDS',
    });
    assert.strictEqual(err, null);
  });

  // --- 3. FAKE FALLBACK PRICE PROTECTION ---
  console.log('\n--- 3. Fallback Mock Price Safeguard Tests ---');
  await testAsync('Bot rejects synthetic fallback price and sets HOLD signal', async () => {
    // Create a mock market service returning synthetic fallback
    const origGetTicker = tradingBot.marketService.getTicker;
    tradingBot.marketService.getTicker = async () => ({
      market: 'BTCUSDT',
      last_price: '85000.00',
      isFallback: true,
      isSyntheticFallback: true,
      isFakePrice: true,
    });

    await tradingBot.evaluateTick();

    // Verify signal is HOLD and reason mentions rejection
    assert.strictEqual(tradingBot.lastSignal?.signal, 'HOLD');
    assert.ok(tradingBot.lastSignal?.reason?.includes('synthetic fallback rejected'));

    // Restore original method
    tradingBot.marketService.getTicker = origGetTicker;
  });

  // --- 4. MULTI-POSITION TRACKING TESTS ---
  console.log('\n--- 4. Multi-Position Tracking Tests ---');
  await testAsync('Paper engine and RiskManager support multi-position tracking', async () => {
    const paper = new PaperTradingEngine({
      initialBalanceUSDT: 10000,
    });

    tradingBot.riskManager.maxOpenPositions = 2;
    tradingBot.riskManager.setBotEnabled(true);
    tradingBot.riskManager.resetEmergencyStop();

    // Position 1: BUY BTC
    const buy1 = await paper.executeBuy({
      pair: 'BTCUSDT',
      amountQuote: 50,
      currentPrice: 60000,
      stopLossPercent: 2.0,
      takeProfitPercent: 4.0,
    });
    assert.strictEqual(paper.positions.length, 1);

    // Position 2: BUY BTC again (should succeed since maxOpenPositions is 2)
    const buy2 = await paper.executeBuy({
      pair: 'BTCUSDT',
      amountQuote: 50,
      currentPrice: 60000,
      stopLossPercent: 2.0,
      takeProfitPercent: 4.0,
    });
    assert.strictEqual(paper.positions.length, 2);

    // Risk Pre-Check for Position 3: should FAIL because openPositionsCount is 2 >= 2
    const check3 = tradingBot.riskManager.validateOrderPreCheck({
      pair: 'BTCUSDT',
      side: 'buy',
      amountQuote: 50,
      openPositionsCount: 2,
    });
    assert.strictEqual(check3.passed, false);
    assert.strictEqual(check3.rule, 'MAX_OPEN_POSITIONS_CHECK');

    // Close position 1: position 2 should still remain active!
    const sell1 = await paper.executeSell({
      pair: 'BTCUSDT',
      positionId: buy1.position.positionId,
      currentPrice: 61000, // profit
    });
    assert.strictEqual(paper.positions.length, 1);
    assert.strictEqual(paper.positions[0].positionId, buy2.position.positionId);
    assert.ok(sell1.pnl > 0);
  });

  // --- 5. EXTENSIBLE STRATEGIES & INDICATORS ---
  console.log('\n--- 5. Strategy Registry & Technical Indicator Tests ---');
  test('Strategy Registry contains all 4 strategies', () => {
    const list = strategyRegistry.list();
    assert.ok(list.includes('EMA_RSI'));
    assert.ok(list.includes('BOLLINGER_BANDS'));
    assert.ok(list.includes('GRID'));
    assert.ok(list.includes('MACD_RSI'));
  });

  test('Bollinger Bands calculation produces valid upper, middle, and lower bands', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
    const bb = calculateBollingerBands(prices, 20, 2.0);
    assert.strictEqual(bb.upper.length, 30);
    assert.strictEqual(bb.lower.length, 30);
    const lastUpper = bb.upper[29];
    const lastLower = bb.lower[29];
    const lastMiddle = bb.middle[29];
    assert.ok(lastUpper > lastMiddle && lastMiddle > lastLower);
  });

  test('MACD calculation produces valid MACD line, signal line, and histogram', () => {
    const prices = Array.from({ length: 45 }, (_, i) => 50 + i * 0.5);
    const macdRes = calculateMACD(prices, 12, 26, 9);
    assert.strictEqual(macdRes.macd.length, 45);
    assert.strictEqual(macdRes.signal.length, 45);
    assert.strictEqual(macdRes.histogram.length, 45);
    assert.ok(macdRes.macd[44] !== null);
  });

  test('Bollinger Bands strategy generates signal on candles', () => {
    const strategy = new BollingerBandsStrategy({ period: 10, rsiPeriod: 7 });
    const candles = Array.from({ length: 25 }, (_, i) => ({
      open: 100,
      high: 105,
      low: 95,
      close: 90 - i * 0.5, // Dips low to trigger lower band bounce or hold
      volume: 100,
      time: Date.now() + i * 60000,
    }));
    const signal = strategy.generateSignal({ candles, currentPrice: 75 });
    assert.ok(['BUY', 'SELL', 'HOLD'].includes(signal.signal));
    assert.ok(signal.reason);
  });

  // --- 6. BACKTESTING ENGINE TESTS ---
  console.log('\n--- 6. Historical Backtest Engine Tests ---');
  await testAsync('Backtest service runs simulation over historical candles', async () => {
    // Generate synthetic 100 candles
    const mockCandles = Array.from({ length: 120 }, (_, i) => ({
      open: 50000 + Math.sin(i / 5) * 500,
      high: 50000 + Math.sin(i / 5) * 500 + 100,
      low: 50000 + Math.sin(i / 5) * 500 - 100,
      close: 50000 + Math.sin(i / 5) * 500 + 20,
      volume: 50,
      time: 1700000000000 + i * 60000 * 15,
    }));

    const origGetCandles = backtestService.marketService.getCandles;
    backtestService.marketService.getCandles = async () => mockCandles;

    const result = await backtestService.runBacktest({
      pair: 'BTCUSDT',
      strategyName: 'EMA_RSI',
      limit: 120,
      initialBalance: 5000,
      tradeAmount: 100,
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.summary);
    assert.strictEqual(result.summary.initialBalance, 5000);
    assert.ok(typeof result.summary.finalBalance === 'number');
    assert.ok(typeof result.summary.winRatePercent === 'number');

    backtestService.marketService.getCandles = origGetCandles;
  });

  console.log('\n====================================================');
  console.log(`  OVERHAUL VERIFICATION SUMMARY: ${passed}/${total} PASSED`);
  console.log('====================================================\n');

  if (passed === total) {
    console.log('🎉 ALL 6 AUDIT REQUIREMENTS SUCCESSFULLY IMPLEMENTED & VERIFIED!');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runOverhaulTests().catch((err) => {
  console.error('Test run error:', err);
  process.exit(1);
});
