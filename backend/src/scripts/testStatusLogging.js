const assert = require('assert');
const TradingBot = require('../bot/tradingBot').constructor;
const tradingBotInstance = require('../bot/tradingBot');

async function runStatusLoggingTests() {
  console.log('====================================================');
  console.log('     RUNNING REAL-TIME BOT STATUS LOGGING TESTS     ');
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

  // --- 1. WAITING LOG (HOLD WITH NO POSITION) ---
  console.log('--- 1. WAITING Status Logging & Throttling ---');
  test('Logs WAITING when signal is HOLD and activePositions is empty', () => {
    const bot = tradingBotInstance;
    bot.logs = [];
    bot.activePositions = [];
    bot.currentPrice = 64200.50;
    bot.lastLoggedReason = null;
    bot.tickCounter = 0;

    const signalResult = {
      signal: 'HOLD',
      reason: 'RSI in neutral zone (48.5) and EMA spread narrow (0.08%)',
      indicators: { rsi: 48.5, fastEma: 64150, slowEma: 64100 },
    };

    bot._handleHoldStatusLog(signalResult);

    assert(bot.logs.length > 0, 'Log should be added');
    const firstLog = bot.logs[0];
    assert.strictEqual(firstLog.type, 'info');
    assert(firstLog.message.includes('⏳ WAITING'), `Message should contain ⏳ WAITING, got: ${firstLog.message}`);
    assert(firstLog.message.includes('64200.50'), 'Message should contain current price');
    assert(firstLog.message.includes(signalResult.reason), 'Message should contain signal reason');
  });

  test('Throttles/dedupes repeat HOLD logs with identical reason on tick 2', () => {
    const bot = tradingBotInstance;
    const initialLogCount = bot.logs.length;

    const signalResult = {
      signal: 'HOLD',
      reason: 'RSI in neutral zone (48.5) and EMA spread narrow (0.08%)',
    };

    bot._handleHoldStatusLog(signalResult); // Tick 2 with same reason
    assert.strictEqual(bot.logs.length, initialLogCount, 'Log count should not increase on repeated reason');
  });

  test('Logs immediately when signal reason changes', () => {
    const bot = tradingBotInstance;
    const initialLogCount = bot.logs.length;

    const newSignalResult = {
      signal: 'HOLD',
      reason: 'Fast EMA approached Slow EMA from below (Bullish converging)',
    };

    bot._handleHoldStatusLog(newSignalResult);
    assert.strictEqual(bot.logs.length, initialLogCount + 1, 'Should log when reason changes');
    assert(bot.logs[0].message.includes('Bullish converging'), 'Should log new reason');
  });

  test('Periodic logging triggers on every 6th tick even if reason unchanged', () => {
    const bot = tradingBotInstance;
    const initialLogCount = bot.logs.length;

    const currentReason = bot.lastLoggedReason;
    const signalResult = { signal: 'HOLD', reason: currentReason };

    // Advance ticks to reach multiple of 6
    while (bot.tickCounter % 6 !== 5) {
      bot.tickCounter++;
    }
    // Now next tick will be multiple of 6
    bot._handleHoldStatusLog(signalResult);
    assert.strictEqual(bot.logs.length, initialLogCount + 1, 'Should log on 6th periodic tick');
    assert(bot.logs[0].message.includes('⏳ WAITING'), 'Should log WAITING status');
  });

  // --- 2. HOLDING LOG (HOLD WITH ACTIVE POSITION) ---
  console.log('\n--- 2. HOLDING Status Logging with Active Position ---');
  test('Logs HOLDING position with unrealized P&L when position exists', () => {
    const bot = tradingBotInstance;
    bot.logs = [];
    bot.currentPrice = 66000;
    bot.activePositions = [
      {
        positionId: 'POS_TEST_1',
        entryPrice: 65000,
        quantity: 0.1,
      },
    ];
    bot.lastLoggedReason = null;
    bot.tickCounter = 0;

    const signalResult = {
      signal: 'HOLD',
      reason: 'Trend remains intact, waiting for Take-Profit ceiling',
    };

    bot._handleHoldStatusLog(signalResult);

    assert(bot.logs.length > 0, 'Log added');
    const log = bot.logs[0];
    assert.strictEqual(log.type, 'info');
    assert(log.message.includes('📊 HOLDING position'), `Expected 📊 HOLDING position, got: ${log.message}`);
    assert(log.message.includes('Entry: $65000.00'), 'Includes entry price');
    assert(log.message.includes('Unrealized P&L: +1.54%'), `Includes unrealized P&L percent, got: ${log.message}`);
  });

  // --- 3. HEARTBEAT LOGGING ---
  console.log('\n--- 3. Heartbeat Status Logging ---');
  test('Heartbeat logs alive message with indicators and enforces ~60s cooldown', () => {
    const bot = tradingBotInstance;
    bot.logs = [];
    bot.lastHeartbeatTime = 0; // Force trigger
    bot.currentPrice = 65000;

    const indicators = { rsi: 52.4, fastEma: 64900, slowEma: 64700 };
    bot._handleHeartbeatLog(indicators);

    assert(bot.logs.length > 0, 'Heartbeat log created');
    const hbLog = bot.logs[0];
    assert.strictEqual(hbLog.type, 'info');
    assert(hbLog.message.includes('💓 Bot alive'), `Message has heartbeat emoji, got: ${hbLog.message}`);
    assert(hbLog.message.includes('RSI: 52.4'), 'Includes RSI');
    assert(hbLog.message.includes('Fast EMA: 64900'), 'Includes Fast EMA');
    assert(hbLog.message.includes('Slow EMA: 64700'), 'Includes Slow EMA');

    // Second call within 60s should be throttled
    const countAfterFirst = bot.logs.length;
    bot._handleHeartbeatLog(indicators);
    assert.strictEqual(bot.logs.length, countAfterFirst, 'Heartbeat throttled within 60 seconds');

    // Simulate 61s passing
    bot.lastHeartbeatTime = Date.now() - 61000;
    bot._handleHeartbeatLog(indicators);
    assert.strictEqual(bot.logs.length, countAfterFirst + 1, 'Heartbeat fires after 60 seconds');
  });

  // --- 4. BUY & SELL LOG ENHANCEMENTS ---
  console.log('\n--- 4. BOUGHT & SOLD Status Logging ---');
  await test('Paper trade simulation logs enhanced ✅ BOUGHT and 💰 SOLD messages', async () => {
    const bot = tradingBotInstance;
    bot.logs = [];

    const res = await bot.simulateDemoTrade({ profitPercent: 2.0 });
    assert.strictEqual(res.success, true);

    const buyLog = bot.logs.find((l) => l.message.includes('✅ BOUGHT'));
    const sellLog = bot.logs.find((l) => l.message.includes('💰 SOLD'));

    assert(buyLog, 'BOUGHT log found with ✅');
    assert.strictEqual(buyLog.type, 'trade');
    assert(buyLog.message.includes('Reason:'), 'BOUGHT log has Reason');

    assert(sellLog, 'SOLD log found with 💰');
    assert.strictEqual(sellLog.type, 'trade');
    assert(sellLog.message.includes('P&L:'), 'SOLD log includes P&L');
    assert(sellLog.message.includes('+2.00%') || sellLog.message.includes('2%'), 'SOLD log includes profit %');
  });

  console.log('\n====================================================');
  console.log(`TOTAL LOGGING TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('====================================================\n');

  if (passed === total) {
    console.log('🎉 ALL BOT STATUS LOGGING TESTS PASSED!\n');
    return true;
  } else {
    throw new Error(`${total - passed} test(s) failed.`);
  }
}

if (require.main === module) {
  runStatusLoggingTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = runStatusLoggingTests;
