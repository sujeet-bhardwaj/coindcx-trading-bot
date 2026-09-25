const assert = require('assert');
const tradingBot = require('../bot/tradingBot');
const { OrderStates } = require('../trading/orderStateMachine');

async function testConsecutiveTrading() {
  console.log('🧪 Starting Consecutive Trade Flow Verification Test...\n');

  // 1. Initialize Bot
  await tradingBot.initialize();
  tradingBot.activePositions = [];
  tradingBot.candleTracker.reset();
  tradingBot.orderStateMachine.reconcile(0);
  tradingBot.riskManager.resetLossCooldown();
  tradingBot.riskManager.resetTradeCooldown();

  console.log('State at start:');
  console.log('- Active positions:', tradingBot.activePositions.length);
  console.log('- Order state:', tradingBot.orderStateMachine.getState());
  console.log('- Can buy?:', tradingBot.orderStateMachine.canBuy());
  assert.strictEqual(tradingBot.orderStateMachine.canBuy(), true, 'Bot must be able to buy initially');

  // 2. Start Bot
  await tradingBot.start();
  assert.strictEqual(tradingBot.isRunning, true, 'Bot should be running');
  console.log('✅ Bot started successfully.');

  // 3. Simulate Trade 1 Entry
  const mockCandle = {
    time: Date.now() - 60000,
    open: 80000,
    high: 80500,
    low: 79500,
    close: 80200,
    volume: 1.5,
  };

  const buySignal = {
    signal: 'BUY',
    reason: 'Test Trade 1 Momentum Trigger',
    indicators: { fastEma: 80200, slowEma: 79800, rsi: 55 },
  };

  console.log('\n--- Executing Trade 1 ---');
  await tradingBot._handleBuySignal(buySignal);
  tradingBot.candleTracker.recordProcessed(mockCandle);

  assert.strictEqual(tradingBot.activePositions.length, 1, 'Trade 1 should be open');
  assert.strictEqual(tradingBot.orderStateMachine.getState(), OrderStates.LONG_OPEN, 'State should be LONG_OPEN');
  console.log('✅ Trade 1 opened successfully! Position ID:', tradingBot.activePositions[0].positionId);

  // 4. Simulate Trade 1 Exit (Selling position)
  console.log('\n--- Closing Trade 1 ---');
  const pos1 = tradingBot.activePositions[0];
  await tradingBot._handleSellPosition(pos1, 'Profit-Lock Hit (+2.0%)', { peakProfitPercent: 2.0, lockedProfitPercent: 1.5 });

  assert.strictEqual(tradingBot.activePositions.length, 0, 'Positions should be 0 after selling Trade 1');
  assert.strictEqual(tradingBot.orderStateMachine.getState(), OrderStates.NO_POSITION, 'State should be NO_POSITION after sell');
  assert.strictEqual(tradingBot.orderStateMachine.canBuy(), true, 'Bot must be ready to buy again after sell');
  console.log('✅ Trade 1 closed successfully! Order state cleanly reset to NO_POSITION.');

  // 5. Test Candle Tracker Check on same candle
  const candleCheckSameCandle = tradingBot.candleTracker.checkCandle(mockCandle, tradingBot.activePositions.length > 0);
  console.log('\nCandle check with 0 open positions:', candleCheckSameCandle);
  assert.strictEqual(candleCheckSameCandle.canProcess, true, 'Must allow processing new trade when no positions are open');

  // 6. Simulate Trade 2 Entry (Automatic second trade!)
  console.log('\n--- Executing Trade 2 (Consecutive Trade) ---');
  const buySignal2 = {
    signal: 'BUY',
    reason: 'Test Trade 2 Momentum Continuation Trigger',
    indicators: { fastEma: 80400, slowEma: 80000, rsi: 58 },
  };

  await tradingBot._handleBuySignal(buySignal2);
  tradingBot.candleTracker.recordProcessed(mockCandle);

  assert.strictEqual(tradingBot.activePositions.length, 1, 'Trade 2 should be open!');
  assert.strictEqual(tradingBot.orderStateMachine.getState(), OrderStates.LONG_OPEN, 'State should be LONG_OPEN for Trade 2');
  console.log('✅ Trade 2 opened successfully! Position ID:', tradingBot.activePositions[0].positionId);

  // 7. Close Trade 2
  console.log('\n--- Closing Trade 2 ---');
  const pos2 = tradingBot.activePositions[0];
  await tradingBot._handleSellPosition(pos2, 'Hard Stop-Loss (-0.75%)');

  assert.strictEqual(tradingBot.activePositions.length, 0, 'Positions should be 0 after selling Trade 2');
  assert.strictEqual(tradingBot.orderStateMachine.getState(), OrderStates.NO_POSITION, 'State should be NO_POSITION after Trade 2 exit');
  console.log('✅ Trade 2 closed and bot is cleanly ready for Trade 3!');

  // Clean up
  await tradingBot.stop();
  console.log('\n🎉 ALL CONSECUTIVE TRADING TESTS PASSED! Automatic consecutive trades work seamlessly.\n');
}

testConsecutiveTrading()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  });
