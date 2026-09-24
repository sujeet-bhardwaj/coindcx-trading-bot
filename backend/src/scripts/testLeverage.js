const assert = require('assert');
const config = require('../config/env');
const { RiskManager } = require('../risk/riskManager');
const { validateSettingsPayload } = require('../controllers/botController');
const { PaperTradingEngine } = require('../services/paperTradingEngine');
const backtestService = require('../services/backtestService');

async function runLeverageTests() {
  console.log('====================================================');
  console.log('         RUNNING COMPREHENSIVE LEVERAGE TESTS       ');
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

  // --- 1. CONFIG & RISK MANAGER DEFAULTS ---
  console.log('--- 1. Configuration & RiskManager Leverage Defaults ---');
  test('Env config exposes defaultLeverage', () => {
    assert(config.defaultLeverage !== undefined);
    assert(config.defaultLeverage >= 1);
  });

  test('RiskManager initializes with default leverage or options.leverage', () => {
    const rmDefault = new RiskManager();
    assert.strictEqual(rmDefault.leverage, 1);

    const rm10x = new RiskManager({ leverage: 10 });
    assert.strictEqual(rm10x.leverage, 10);

    const summary = rm10x.getRiskSummary();
    assert.strictEqual(summary.leverage, 10);
  });

  test('RiskManager updateLimits updates leverage properly', () => {
    const rm = new RiskManager();
    rm.updateLimits({ leverage: 20 });
    assert.strictEqual(rm.leverage, 20);

    // Rejects out of range leverage
    rm.updateLimits({ leverage: 999 });
    assert.strictEqual(rm.leverage, 20);
  });

  test('RiskManager calculates liquidation price for long positions accurately', () => {
    const rm = new RiskManager();
    // At 10x leverage on BTC @ $100,000, 95% margin loss liquidation occurs at ~$90,500
    const liqPrice10x = rm.calculateLiquidationPrice(100000, 10, 'buy');
    assert.strictEqual(liqPrice10x, 90500);

    // At 1x leverage, returns null (no liquidation risk for 1x spot)
    const liqPrice1x = rm.calculateLiquidationPrice(100000, 1, 'buy');
    assert.strictEqual(liqPrice1x, null);
  });

  // --- 2. CONTROLLER VALIDATION ---
  console.log('\n--- 2. Bot Controller Settings Validation ---');
  test('validateSettingsPayload accepts valid leverage 1 to 100', () => {
    assert.strictEqual(validateSettingsPayload({ leverage: 1 }), null);
    assert.strictEqual(validateSettingsPayload({ leverage: 10 }), null);
    assert.strictEqual(validateSettingsPayload({ leverage: 100 }), null);
  });

  test('validateSettingsPayload rejects invalid leverage (< 1, > 100, NaN)', () => {
    assert(validateSettingsPayload({ leverage: 0 }) !== null);
    assert(validateSettingsPayload({ leverage: 150 }) !== null);
    assert(validateSettingsPayload({ leverage: 'abc' }) !== null);
  });

  // --- 3. PAPER TRADING ENGINE LEVERAGED EXECUTION ---
  console.log('\n--- 3. Paper Trading Engine Leveraged Execution ---');
  await testAsync('Paper Engine executes leveraged buy (10x) and calculates margin & notional correctly', async () => {
    const engine = new PaperTradingEngine({ feePercent: 0, slippagePercent: 0 });
    const initialUSDT = engine.balances.USDT;
    const margin = 100;
    const price = 50000;
    const leverage = 10;

    const { order, position } = await engine.executeBuy({
      pair: 'BTCUSDT',
      amountQuote: margin,
      currentPrice: price,
      leverage,
    });

    // 10x notional = 100 * 10 = $1,000 position
    assert.strictEqual(order.notionalValue, 1000);
    assert.strictEqual(order.leverage, 10);
    assert.strictEqual(order.margin, 100);
    // Quantity = 1000 / 50000 = 0.02 BTC
    assert.strictEqual(position.quantity, 0.02);
    assert.strictEqual(position.leverage, 10);
    assert.strictEqual(position.margin, 100);
    // USDT balance deducted strictly by margin (100 USDT)
    assert.strictEqual(engine.balances.USDT, initialUSDT - margin);
    // Liquidation price set: 50000 * (1 - 0.95 / 10) = 45250
    assert.strictEqual(position.liquidationPrice, 45250);
  });

  await testAsync('Paper Engine executes leveraged sell and realizes 10x leveraged PnL on margin', async () => {
    const engine = new PaperTradingEngine({ feePercent: 0, slippagePercent: 0 });
    const initialUSDT = engine.balances.USDT;
    const margin = 100;
    const entryPrice = 50000;
    const leverage = 10;

    const { position } = await engine.executeBuy({
      pair: 'BTCUSDT',
      amountQuote: margin,
      currentPrice: entryPrice,
      leverage,
    });

    // Price rises by 5% (from $50,000 to $52,500)
    // 5% market gain * 10x leverage = 50% ROI on $100 margin = +$50 profit!
    const exitPrice = 52500;
    const { order, trade, pnl, pnlPercent } = await engine.executeSell({
      pair: 'BTCUSDT',
      positionId: position.positionId,
      currentPrice: exitPrice,
      reason: 'Take-Profit Hit',
    });

    assert.strictEqual(trade.leverage, 10);
    assert.strictEqual(trade.margin, 100);
    assert.strictEqual(pnl, 50); // $50 profit
    assert.strictEqual(pnlPercent, 50); // +50% on margin
    // Final USDT balance = initial balance + $50 profit
    assert.strictEqual(engine.balances.USDT, initialUSDT + 50);
  });

  await testAsync('Paper Engine positionsWithPnL accurately reflects leveraged unrealized return', async () => {
    const engine = new PaperTradingEngine({ feePercent: 0, slippagePercent: 0 });
    const margin = 100;
    const entryPrice = 50000;
    const leverage = 5;

    await engine.executeBuy({
      pair: 'BTCUSDT',
      amountQuote: margin,
      currentPrice: entryPrice,
      leverage,
    });

    // Price drops by 2% (from $50,000 to $49,000)
    // Unrealized loss = -2% * 5x = -10% on margin (-$10)
    const positions = engine.getPositionsWithPnL({ BTCUSDT: 49000 });
    assert.strictEqual(positions.length, 1);
    assert.strictEqual(positions[0].leverage, 5);
    assert.strictEqual(positions[0].unrealizedPnL, -10);
    assert.strictEqual(positions[0].unrealizedPnLPercent, -10);
  });

  // --- 4. BACKTEST WITH LEVERAGE ---
  console.log('\n--- 4. Backtest Engine With Leverage ---');
  await testAsync('Backtest service executes simulation with leverage parameter', async () => {
    const now = Date.now();
    const mockCandles = [];
    for (let i = 0; i < 60; i++) {
      const p = 50000 + Math.sin(i / 5) * 1000;
      mockCandles.push({
        openTime: now - (60 - i) * 60000,
        open: p,
        high: p * 1.002,
        low: p * 0.998,
        close: p,
        volume: 10,
      });
    }

    const originalGetCandles = backtestService.marketService.getCandles;
    backtestService.marketService.getCandles = async () => mockCandles;

    try {
      const result = await backtestService.runBacktest({
        pair: 'BTCUSDT',
        strategyName: 'EMA_RSI',
        interval: '15m',
        limit: 60,
        tradeAmount: 100,
        leverage: 5,
        stopLossPercent: 2.0,
        takeProfitPercent: 4.0,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.summary.leverage, 5);
    } finally {
      backtestService.marketService.getCandles = originalGetCandles;
    }
  });

  // --- SUMMARY ---
  console.log('\n====================================================');
  console.log(`TOTAL LEVERAGE TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('====================================================\n');

  if (passed === total) {
    console.log('🎉 ALL LEVERAGE TESTS PASSED SUCCESSFULLY!\n');
    return true;
  } else {
    throw new Error(`${total - passed} test(s) failed.`);
  }
}

if (require.main === module) {
  runLeverageTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = runLeverageTests;
