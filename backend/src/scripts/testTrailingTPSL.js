const assert = require('assert');
const config = require('../config/env');
const { RiskManager } = require('../risk/riskManager');
const { validateSettingsPayload } = require('../controllers/botController');
const { PaperTradingEngine } = require('../services/paperTradingEngine');
const backtestService = require('../services/backtestService');
const { evaluateExit } = require('../risk/exitEngine');

async function runTrailingTests() {
  console.log('====================================================');
  console.log('  RUNNING UNIFIED EXIT ENGINE (MAX LOSS & PROFIT LOCK) TESTS  ');
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
  test('Env config exposes unified exit defaults (0.75% max loss, ladder 0.5-5, step 1, buffer 0)', () => {
    assert.strictEqual(config.maxLossPercent, 0.75);
    assert.strictEqual(config.profitLockLevels, '0.5,1,2,3,4,5');
    assert.strictEqual(config.profitLockStepAfterLast, 1);
    assert.strictEqual(config.lockBufferPercent, 0);
    assert.strictEqual(config.breakevenTriggerPercent, 0);
  });

  test('RiskManager initializes unified exit parameters correctly', () => {
    const rm = new RiskManager();
    assert.strictEqual(rm.maxLossPercent, 0.75);
    assert.strictEqual(rm.profitLockLevels, '0.5,1,2,3,4,5');
    assert.strictEqual(rm.profitLockStepAfterLast, 1);
    assert.strictEqual(rm.lockBufferPercent, 0);
    assert.strictEqual(rm.breakevenTriggerPercent, 0);

    const summary = rm.getRiskSummary();
    assert.strictEqual(summary.maxLossPercent, 0.75);
    assert.strictEqual(summary.profitLockLevels, '0.5,1,2,3,4,5');
    assert.strictEqual(summary.profitLockStepAfterLast, 1);
    assert.strictEqual(summary.lockBufferPercent, 0);
    assert.strictEqual(summary.breakevenTriggerPercent, 0);
  });

  test('RiskManager updateLimits updates unified exit parameters', () => {
    const rm = new RiskManager();
    rm.updateLimits({
      maxLossPercent: 1.0,
      profitLockLevels: '1,2,3,4',
      profitLockStepAfterLast: 2,
      lockBufferPercent: 0.1,
      breakevenTriggerPercent: 0.5,
    });
    assert.strictEqual(rm.maxLossPercent, 1.0);
    assert.strictEqual(rm.profitLockLevels, '1,2,3,4');
    assert.strictEqual(rm.profitLockStepAfterLast, 2);
    assert.strictEqual(rm.lockBufferPercent, 0.1);
    assert.strictEqual(rm.breakevenTriggerPercent, 0.5);
  });

  // --- 2. VALIDATION OF UNIFIED EXIT SETTINGS ---
  console.log('\n--- 2. Validation of Settings Payload ---');
  test('Validates exit parameters within acceptable bounds', () => {
    const err = validateSettingsPayload({
      tradeAmount: 100,
      maxLossPercent: 0.75,
      profitLockLevels: '0.5,1,2,3,4,5',
      profitLockStepAfterLast: 1,
      lockBufferPercent: 0,
      breakevenTriggerPercent: 0,
      maxDailyLoss: 100,
      maxOpenPositions: 1,
      cooldownSeconds: 60,
    });
    assert.strictEqual(err, null, 'Error should be null for valid payload');
  });

  test('Rejects negative or invalid exit parameters', () => {
    const negLoss = validateSettingsPayload({
      maxLossPercent: -1,
    });
    assert.notStrictEqual(negLoss, null);

    const negStep = validateSettingsPayload({
      profitLockStepAfterLast: -1,
    });
    assert.notStrictEqual(negStep, null);

    const negBuffer = validateSettingsPayload({
      lockBufferPercent: -1,
    });
    assert.notStrictEqual(negBuffer, null);
  });

  // --- 3. PAPER TRADING ENGINE EXIT STATE ---
  console.log('\n--- 3. PaperTradingEngine State & Tracking ---');
  await testAsync('PaperTradingEngine initializes lockedProfitPercent on buy and allows updates', async () => {
    const engine = new PaperTradingEngine({ initialBalanceUSDT: 1000, initialBalanceINR: 0 });
    const buyResult = await engine.executeBuy({
      pair: 'BTCUSDT',
      currentPrice: 50000,
      amountQuote: 100,
      stopLossPercent: 0.75,
      strategy: 'EMA_RSI',
    });

    const pos = buyResult.position;
    assert(pos.positionId, 'Position has a positionId');
    assert.strictEqual(pos.peakProfitPercent, 0);
    assert.strictEqual(pos.lockedProfitPercent, 0);

    // Update trailing/lock state
    const updated = await engine.updatePositionTrailing(pos.positionId, {
      peakProfitPercent: 1.5,
      lockedProfitPercent: 1.0,
    });

    assert.strictEqual(updated.peakProfitPercent, 1.5);
    assert.strictEqual(updated.lockedProfitPercent, 1.0);
  });

  // --- 4. STEP-BY-STEP SIMULATION OF UNIFIED EXIT ENGINE ---
  console.log('\n--- 4. Unified Exit Engine Evaluation ---');

  test('Rule 1: Hard Max-Loss sells when profit% <= -0.75%', () => {
    const pos = { entryPrice: 100, peakProfitPercent: 0, lockedProfitPercent: 0 };
    const holdRes = evaluateExit(pos, 99.26); // -0.74%
    assert.strictEqual(holdRes.action, 'HOLD');

    const sellRes = evaluateExit(pos, 99.25); // -0.75%
    assert.strictEqual(sellRes.action, 'SELL');
    assert(sellRes.reason.includes('Hard Stop-Loss'));
  });

  test('Rule 2 & 3: Profit-lock ladder steps and triggers sell when profit% < lockedProfitPercent', () => {
    let pos = { entryPrice: 100, peakProfitPercent: 0, lockedProfitPercent: 0 };

    // Peak reaches 0.5% -> locks 0.5%
    let step1 = evaluateExit(pos, 100.5);
    assert.strictEqual(step1.action, 'HOLD');
    assert.strictEqual(Number(step1.state.peakProfitPercent.toFixed(2)), 0.5);
    assert.strictEqual(Number(step1.state.lockedProfitPercent.toFixed(2)), 0.5);

    // Price drops to 100.49% -> sells immediately
    pos = { ...pos, ...step1.state };
    let step2 = evaluateExit(pos, 100.49);
    assert.strictEqual(step2.action, 'SELL');
    assert(step2.reason.includes('Profit-Lock'));
  });

  test('Peak 0.9% locks 0.5%, drops to 0.6% holds', () => {
    let pos = { entryPrice: 100, peakProfitPercent: 0, lockedProfitPercent: 0 };
    let step1 = evaluateExit(pos, 100.9);
    assert.strictEqual(Number(step1.state.peakProfitPercent.toFixed(2)), 0.9);
    assert.strictEqual(Number(step1.state.lockedProfitPercent.toFixed(2)), 0.5);

    pos = { ...pos, ...step1.state };
    let step2 = evaluateExit(pos, 100.6);
    assert.strictEqual(step2.action, 'HOLD');
  });

  test('Peak 1.2% locks 1.0%, drops to 0.99% sells', () => {
    let pos = { entryPrice: 100, peakProfitPercent: 0, lockedProfitPercent: 0 };
    let step1 = evaluateExit(pos, 101.2);
    assert.strictEqual(Number(step1.state.peakProfitPercent.toFixed(2)), 1.2);
    assert.strictEqual(Number(step1.state.lockedProfitPercent.toFixed(2)), 1.0);

    pos = { ...pos, ...step1.state };
    let step2 = evaluateExit(pos, 100.99);
    assert.strictEqual(step2.action, 'SELL');
    assert(step2.reason.includes('Profit-Lock'));
  });

  test('Peak 2.5% locks 2.0%', () => {
    let pos = { entryPrice: 100, peakProfitPercent: 0, lockedProfitPercent: 0 };
    let step = evaluateExit(pos, 102.5);
    assert.strictEqual(Number(step.state.peakProfitPercent.toFixed(2)), 2.5);
    assert.strictEqual(Number(step.state.lockedProfitPercent.toFixed(2)), 2.0);
  });

  test('Peak 7.3% locks 7.0%, lock never decreases', () => {
    let pos = { entryPrice: 100, peakProfitPercent: 0, lockedProfitPercent: 0 };
    let step1 = evaluateExit(pos, 107.3);
    assert.strictEqual(Number(step1.state.peakProfitPercent.toFixed(2)), 7.3);
    assert.strictEqual(Number(step1.state.lockedProfitPercent.toFixed(2)), 7.0);

    pos = { ...pos, ...step1.state };
    let step2 = evaluateExit(pos, 107.1);
    assert.strictEqual(step2.action, 'HOLD');
    assert.strictEqual(Number(step2.state.lockedProfitPercent.toFixed(2)), 7.0);
  });

  // --- 5. BACKTEST TRAILING SUPPORT ---
  console.log('\n--- 5. Backtest Engine Simulation ---');
  await testAsync('Backtest service runs with unified exit parameters enabled without errors', async () => {
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

    const originalGetCandles = backtestService.marketService.getCandles;
    backtestService.marketService.getCandles = async () => mockCandles;

    try {
      const result = await backtestService.runBacktest({
        pair: 'BTCUSDT',
        strategyName: 'EMA_RSI',
        interval: '15m',
        limit: 60,
        tradeAmount: 100,
        maxLossPercent: 0.75,
        profitLockLevels: '0.5,1,2,3,4,5',
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
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('====================================================\n');

  if (passed === total) {
    console.log('🎉 ALL UNIFIED EXIT ENGINE TESTS PASSED!\n');
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
