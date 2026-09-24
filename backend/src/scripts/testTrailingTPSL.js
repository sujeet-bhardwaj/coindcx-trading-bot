const assert = require('assert');
const config = require('../config/env');
const { RiskManager } = require('../risk/riskManager');
const { validateSettingsPayload } = require('../controllers/botController');
const { PaperTradingEngine } = require('../services/paperTradingEngine');
const backtestService = require('../services/backtestService');

async function runTrailingTests() {
  console.log('====================================================');
  console.log('  RUNNING DYNAMIC TRAILING TP/SL & BREAKEVEN TESTS  ');
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
  console.log('--- 1. Configuration & RiskManager Defaults ---');
  test('Env config exposes trailing defaults (3.5% activation, 0.3% giveback, 1.0% breakeven)', () => {
    assert.strictEqual(config.trailingActivationPercent, 3.5);
    assert.strictEqual(config.trailingGivebackPercent, 0.3);
    assert.strictEqual(config.breakevenTriggerPercent, 1.0);
  });

  test('RiskManager initializes trailing parameters correctly', () => {
    const rm = new RiskManager();
    assert.strictEqual(rm.trailingActivationPercent, 3.5);
    assert.strictEqual(rm.trailingGivebackPercent, 0.3);
    assert.strictEqual(rm.breakevenTriggerPercent, 1.0);

    const summary = rm.getRiskSummary();
    assert.strictEqual(summary.trailingActivationPercent, 3.5);
    assert.strictEqual(summary.trailingGivebackPercent, 0.3);
    assert.strictEqual(summary.breakevenTriggerPercent, 1.0);
  });

  test('RiskManager updateLimits updates trailing parameters', () => {
    const rm = new RiskManager();
    rm.updateLimits({
      trailingActivationPercent: 2.5,
      trailingGivebackPercent: 0.4,
      breakevenTriggerPercent: 0.8,
    });
    assert.strictEqual(rm.trailingActivationPercent, 2.5);
    assert.strictEqual(rm.trailingGivebackPercent, 0.4);
    assert.strictEqual(rm.breakevenTriggerPercent, 0.8);
  });

  // --- 2. VALIDATION OF TRAILING SETTINGS ---
  console.log('\n--- 2. Validation of Settings Payload ---');
  test('Validates trailing parameters within acceptable bounds', () => {
    const err = validateSettingsPayload({
      tradeAmount: 100,
      stopLossPercent: 2.0,
      takeProfitPercent: 4.0,
      trailingActivationPercent: 3.0,
      trailingGivebackPercent: 0.5,
      breakevenTriggerPercent: 1.2,
      maxDailyLoss: 100,
      maxOpenPositions: 1,
      cooldownSeconds: 60,
    });
    assert.strictEqual(err, null, 'Error should be null for valid payload');
  });

  test('Rejects negative or invalid trailing parameters', () => {
    const negActivation = validateSettingsPayload({
      trailingActivationPercent: -1,
    });
    assert.notStrictEqual(negActivation, null);

    const negGiveback = validateSettingsPayload({
      trailingGivebackPercent: 0,
    });
    assert.notStrictEqual(negGiveback, null);

    const invalidGiveback = validateSettingsPayload({
      trailingActivationPercent: 2.0,
      trailingGivebackPercent: 2.5, // giveback >= activation
    });
    assert.notStrictEqual(invalidGiveback, null);
  });

  // --- 3. PAPER TRADING ENGINE TRAILING STATE ---
  console.log('\n--- 3. PaperTradingEngine State & Tracking ---');
  await testAsync('PaperTradingEngine initializes trailing fields on buy and allows updates', async () => {
    const engine = new PaperTradingEngine({ initialBalanceUSDT: 1000, initialBalanceINR: 0 });
    const buyResult = await engine.executeBuy({
      pair: 'BTCUSDT',
      currentPrice: 50000,
      amountQuote: 100,
      stopLossPercent: 2.0,
      takeProfitPercent: 4.0,
      strategy: 'EMA_RSI',
    });

    const pos = buyResult.position;
    assert(pos.positionId, 'Position has a positionId');
    assert.strictEqual(pos.peakProfitPercent, 0);
    assert.strictEqual(pos.trailingActive, false);
    assert.strictEqual(pos.effectiveStopLossPrice, pos.stopLossPrice);

    // Update trailing state
    const updated = await engine.updatePositionTrailing(pos.positionId, {
      peakProfitPercent: 1.5,
      effectiveStopLossPrice: 50000, // breakeven
      trailingActive: false,
    });

    assert.strictEqual(updated.peakProfitPercent, 1.5);
    assert.strictEqual(updated.effectiveStopLossPrice, 50000);
  });

  // --- 4. STEP-BY-STEP SIMULATION OF 5-RULE STRICT PRIORITY ---
  console.log('\n--- 4. Strict Evaluation Order & Trailing Logic ---');

  // Helper simulation function replicating TradingBot / BacktestService tick logic
  function evaluatePositionTick({
    pos,
    currentPrice,
    hardStopLossPercent = 2.0,
    hardTakeProfitPercent = 4.0,
    trailingActivationPercent = 3.5,
    trailingGivebackPercent = 0.3,
    breakevenTriggerPercent = 1.0,
  }) {
    const currentProfitPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
    const peakProfit = Math.max(pos.peakProfitPercent || 0, currentProfitPercent);
    const isTrailingArmed = pos.trailingActive || (peakProfit >= trailingActivationPercent);

    // RULE 1: Hard ceiling take-profit
    if (currentProfitPercent >= hardTakeProfitPercent) {
      return { action: 'SELL', reason: 'HARD_TAKE_PROFIT', profitPercent: currentProfitPercent };
    }

    // RULE 2: Hard floor stop-loss
    if (currentProfitPercent <= -hardStopLossPercent) {
      return { action: 'SELL', reason: 'HARD_STOP_LOSS', profitPercent: currentProfitPercent };
    }

    // RULE 3: Trailing Take-Profit Giveback Exit
    if (isTrailingArmed && (peakProfit - currentProfitPercent) >= trailingGivebackPercent) {
      return {
        action: 'SELL',
        reason: 'TRAILING_TAKE_PROFIT',
        profitPercent: currentProfitPercent,
        peakProfit,
        giveback: peakProfit - currentProfitPercent,
      };
    }

    // RULE 4: Trailing Stop-Loss / Breakeven Exit
    if (peakProfit >= breakevenTriggerPercent && currentProfitPercent <= 0) {
      return {
        action: 'SELL',
        reason: 'BREAKEVEN_STOP_LOSS',
        profitPercent: currentProfitPercent,
      };
    }

    // RULE 5: HOLD - calculate updated state
    let effectiveSL = pos.entryPrice * (1 - hardStopLossPercent / 100);
    if (peakProfit >= breakevenTriggerPercent) {
      effectiveSL = Math.max(effectiveSL, pos.entryPrice);
    }

    return {
      action: 'HOLD',
      updatedPosition: {
        ...pos,
        peakProfitPercent: peakProfit,
        trailingActive: isTrailingArmed,
        effectiveStopLossPrice: effectiveSL,
      },
    };
  }

  test('Rule 1: Hard Take-Profit fires immediately at or above +4.0%', () => {
    const pos = { entryPrice: 100, peakProfitPercent: 0, trailingActive: false };
    const res = evaluatePositionTick({ pos, currentPrice: 104.2 });
    assert.strictEqual(res.action, 'SELL');
    assert.strictEqual(res.reason, 'HARD_TAKE_PROFIT');
    assert(res.profitPercent >= 4.0);
  });

  test('Rule 2: Hard Stop-Loss fires immediately at or below -2.0%', () => {
    const pos = { entryPrice: 100, peakProfitPercent: 0, trailingActive: false };
    const res = evaluatePositionTick({ pos, currentPrice: 97.8 });
    assert.strictEqual(res.action, 'SELL');
    assert.strictEqual(res.reason, 'HARD_STOP_LOSS');
    assert(res.profitPercent <= -2.0);
  });

  test('Rule 4: Breakeven locks at +1.0% and exits if price drops back to entry price ($100)', () => {
    let pos = { entryPrice: 100, peakProfitPercent: 0, trailingActive: false };

    // Tick 1: Price goes to 101.2 (+1.2%)
    let step1 = evaluatePositionTick({ pos, currentPrice: 101.2 });
    assert.strictEqual(step1.action, 'HOLD');
    assert.strictEqual(Number(step1.updatedPosition.peakProfitPercent.toFixed(2)), 1.2);
    assert.strictEqual(step1.updatedPosition.effectiveStopLossPrice, 100); // Breakeven locked
    assert.strictEqual(step1.updatedPosition.trailingActive, false); // Not 3.5% yet

    // Tick 2: Price drops back to 99.98 (<= 0%)
    pos = step1.updatedPosition;
    let step2 = evaluatePositionTick({ pos, currentPrice: 99.98 });
    assert.strictEqual(step2.action, 'SELL');
    assert.strictEqual(step2.reason, 'BREAKEVEN_STOP_LOSS');
  });

  test('Rule 3: Trailing TP arms at 3.5%, peaks at 3.8%, sells on drop to 3.4% (-0.4% >= 0.3%)', () => {
    let pos = { entryPrice: 100, peakProfitPercent: 0, trailingActive: false };

    // Tick 1: Price rises to 103.6 (+3.6% >= 3.5%) -> arms trailing
    let step1 = evaluatePositionTick({ pos, currentPrice: 103.6 });
    assert.strictEqual(step1.action, 'HOLD');
    assert.strictEqual(step1.updatedPosition.trailingActive, true);
    assert.strictEqual(Number(step1.updatedPosition.peakProfitPercent.toFixed(2)), 3.6);

    // Tick 2: Price rises further to 103.8 (+3.8%) -> new peak
    pos = step1.updatedPosition;
    let step2 = evaluatePositionTick({ pos, currentPrice: 103.8 });
    assert.strictEqual(step2.action, 'HOLD');
    assert.strictEqual(Number(step2.updatedPosition.peakProfitPercent.toFixed(2)), 3.8);

    // Tick 3: Price drops slightly to 103.65 (+3.65%, drop = 0.15% < 0.3%) -> continues HOLD
    pos = step2.updatedPosition;
    let step3 = evaluatePositionTick({ pos, currentPrice: 103.65 });
    assert.strictEqual(step3.action, 'HOLD');

    // Tick 4: Price drops to 103.4 (+3.4%, drop = 3.8 - 3.4 = 0.4% >= 0.3%) -> SELLS IMMEDIATELY
    pos = step3.updatedPosition;
    let step4 = evaluatePositionTick({ pos, currentPrice: 103.4 });
    assert.strictEqual(step4.action, 'SELL');
    assert.strictEqual(step4.reason, 'TRAILING_TAKE_PROFIT');
    assert(step4.profitPercent >= 3.39 && step4.profitPercent <= 3.41);
    assert.strictEqual(Number(step4.peakProfit.toFixed(2)), 3.8);
  });

  // --- 5. BACKTEST TRAILING SUPPORT ---
  console.log('\n--- 5. Backtest Engine Trailing TP/SL Simulation ---');
  await testAsync('Backtest service runs with trailing parameters enabled without errors', async () => {
    // Generate synthetic candles: 60 candles to pass minLookback
    const mockCandles = [];
    let basePrice = 50000;
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
      const p = i < 30 ? basePrice * (1 + (i * 0.002)) : basePrice * (1 + 0.04 - ((i - 30) * 0.002));
      mockCandles.push({
        openTime: now - (60 - i) * 60000,
        open: p,
        high: p * 1.002,
        low: p * 0.998,
        close: p,
        volume: 10,
      });
    }

    // Mock marketService.getCandles
    const originalGetCandles = backtestService.marketService.getCandles;
    backtestService.marketService.getCandles = async () => mockCandles;

    try {
      const result = await backtestService.runBacktest({
        pair: 'BTCUSDT',
        strategyName: 'EMA_RSI',
        interval: '15m',
        limit: 60,
        tradeAmount: 100,
        stopLossPercent: 2.0,
        takeProfitPercent: 4.0,
        trailingActivationPercent: 3.5,
        trailingGivebackPercent: 0.3,
        breakevenTriggerPercent: 1.0,
      });

      assert.strictEqual(result.success, true);
      assert(result.summary, 'Summary generated');
      assert(result.summary.winRatePercent !== undefined, 'Win rate percent calculated');
    } finally {
      backtestService.marketService.getCandles = originalGetCandles;
    }
  });

  // --- SUMMARY ---
  console.log('\n====================================================');
  console.log(`TOTAL TRAILING TP/SL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('====================================================\n');

  if (passed === total) {
    console.log('🎉 ALL DYNAMIC TRAILING TP/SL & BREAKEVEN TESTS PASSED!\n');
    return true;
  } else {
    throw new Error(`${total - passed} test(s) failed.`);
  }
}

if (require.main === module) {
  runTrailingTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = runTrailingTests;
