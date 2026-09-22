const request = require('supertest');
const { app, tradingBot } = require('../server');
const { connectDB } = require('../config/db');

async function runPhase6Tests() {
  console.log('====================================================');
  console.log('       RUNNING PHASE 6 VERIFICATION TESTS           ');
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

  // Ensure DB connection is initialized
  await connectDB();

  // TEST 1: Get Bot Status
  const statusRes = await request(app).get('/api/bot/status');
  assert(
    statusRes.status === 200 && statusRes.body.success === true && statusRes.body.status.mode === 'PAPER_TRADING',
    `GET /api/bot/status returned mode: ${statusRes.body.status?.mode}`
  );

  // TEST 2: Start Bot
  const startRes = await request(app).post('/api/bot/start');
  assert(
    startRes.status === 200 && startRes.body.success === true && tradingBot.isRunning === true,
    `POST /api/bot/start successfully started bot (isRunning: true)`
  );

  // TEST 3: Stop Bot
  const stopRes = await request(app).post('/api/bot/stop');
  assert(
    stopRes.status === 200 && stopRes.body.success === true && tradingBot.isRunning === false,
    `POST /api/bot/stop successfully stopped bot (isRunning: false)`
  );

  // TEST 4: Trigger Emergency Stop
  const emgRes = await request(app).post('/api/bot/emergency-stop');
  assert(
    emgRes.status === 200 && emgRes.body.success === true && tradingBot.riskManager.emergencyStop === true,
    `POST /api/bot/emergency-stop triggered emergency stop successfully`
  );

  // TEST 5: Verify Start blocked under Emergency Stop
  const blockedStart = await request(app).post('/api/bot/start');
  assert(
    blockedStart.body.success === false && blockedStart.body.message.includes('EMERGENCY STOP'),
    `Safely blocked starting bot while EMERGENCY STOP is active`
  );

  // TEST 6: Reset Emergency Stop
  const resetRes = await request(app).post('/api/bot/reset-emergency-stop');
  assert(
    resetRes.status === 200 && tradingBot.riskManager.emergencyStop === false,
    `POST /api/bot/reset-emergency-stop cleared emergency stop`
  );

  // TEST 7: Update and Retrieve Bot Settings
  const patchRes = await request(app)
    .patch('/api/bot/settings')
    .send({
      tradeAmount: 75,
      stopLossPercent: 2.5,
      takeProfitPercent: 5.0,
      pair: 'BTCUSDT',
    });

  assert(
    patchRes.status === 200 &&
      patchRes.body.success === true &&
      patchRes.body.status.tradeAmount === 75 &&
      patchRes.body.status.riskLimits.stopLossPercent === 2.5,
    `PATCH /api/bot/settings updated tradeAmount ($75) and stopLoss (2.5%)`
  );

  // TEST 8: Record and Query Orders Endpoint
  await tradingBot.orderService.recordOrder({
    exchangeOrderId: `TEST_ORD_${Date.now()}`,
    pair: 'BTCUSDT',
    side: 'buy',
    type: 'market_order',
    price: 81000,
    quantity: 0.001,
    fee: 0.08,
    status: 'filled',
    mode: 'PAPER_TRADING',
  });

  const ordersRes = await request(app).get('/api/orders');
  assert(
    ordersRes.status === 200 && ordersRes.body.success === true && ordersRes.body.orders.length > 0,
    `GET /api/orders returned ${ordersRes.body.orders.length} orders`
  );

  // TEST 9: Record and Query Trades Endpoint
  await tradingBot.orderService.recordTrade({
    pair: 'BTCUSDT',
    side: 'buy_then_sell',
    entryPrice: 80000,
    exitPrice: 82000,
    quantity: 0.001,
    profit: 1.9,
    fee: 0.16,
    mode: 'PAPER_TRADING',
    strategy: 'EMA_RSI',
    status: 'closed',
    reason: 'TAKE_PROFIT_TRIGGERED',
  });

  const tradesRes = await request(app).get('/api/trades');
  assert(
    tradesRes.status === 200 && tradesRes.body.success === true && tradesRes.body.trades.length > 0,
    `GET /api/trades returned ${tradesRes.body.trades.length} trades (Profit: +$${tradesRes.body.trades[0].profit})`
  );

  // TEST 10: Reconcile Open Orders
  const reconciled = await tradingBot.orderService.reconcileOpenOrders();
  assert(
    Array.isArray(reconciled),
    `Order reconciliation executed without errors (reconciled ${reconciled.length} open orders)`
  );

  console.log('\n----------------------------------------------------');
  console.log(`Phase 6 Test Results: ${passed} / ${total} passed`);
  console.log('----------------------------------------------------');

  if (passed === total) {
    console.log('>>> PHASE 6: MONGODB & BOT ORCHESTRATOR SUCCESSFUL! <<<\n');
    process.exit(0);
  } else {
    console.error('>>> PHASE 6 VERIFICATION FAILED! <<<\n');
    process.exit(1);
  }
}

runPhase6Tests().catch((err) => {
  console.error('Unhandled error in Phase 6 test suite:', err);
  process.exit(1);
});
