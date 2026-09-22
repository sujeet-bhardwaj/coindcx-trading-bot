const { RiskManager } = require('../risk/riskManager');

async function runPhase5Tests() {
  console.log('====================================================');
  console.log('       RUNNING PHASE 5 VERIFICATION TESTS           ');
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

  const risk = new RiskManager({
    botEnabled: false,
    emergencyStop: false,
    tradingMode: 'PAPER_TRADING',
    maxTradeAmount: 100,
    maxDailyLoss: 50,
    maxOpenPositions: 1,
    cooldownSeconds: 30,
  });

  const mockMarket = {
    symbol: 'BTCUSDT',
    status: 'active',
    min_quantity: 0.00001,
    min_notional: 5,
  };

  // TEST 1: Block when bot is stopped
  const test1 = risk.validateOrderPreCheck({
    pair: 'BTCUSDT',
    side: 'buy',
    amountQuote: 50,
    currentPrice: 80000,
    marketDetails: mockMarket,
  });
  assert(!test1.passed && test1.rule === 'BOT_ENABLED_CHECK', `Blocked when bot is stopped: "${test1.reason}"`);

  // Enable bot
  risk.setBotEnabled(true);

  // TEST 2: Block when EMERGENCY STOP is active
  risk.triggerEmergencyStop();
  const test2 = risk.validateOrderPreCheck({
    pair: 'BTCUSDT',
    side: 'buy',
    amountQuote: 50,
    currentPrice: 80000,
    marketDetails: mockMarket,
  });
  assert(!test2.passed && test2.rule === 'EMERGENCY_STOP_CHECK', `Blocked when EMERGENCY STOP active: "${test2.reason}"`);

  // Reset emergency stop and re-enable
  risk.resetEmergencyStop();
  risk.setBotEnabled(true);

  // TEST 3: Block when max trade amount exceeded
  const test3 = risk.validateOrderPreCheck({
    pair: 'BTCUSDT',
    side: 'buy',
    amountQuote: 150, // exceeds maxTradeAmount of 100
    currentPrice: 80000,
    marketDetails: mockMarket,
  });
  assert(!test3.passed && test3.rule === 'MAX_TRADE_AMOUNT_CHECK', `Blocked exceeding trade amount limit: "${test3.reason}"`);

  // TEST 4: Block when open positions limit reached
  const test4 = risk.validateOrderPreCheck({
    pair: 'BTCUSDT',
    side: 'buy',
    amountQuote: 50,
    currentPrice: 80000,
    marketDetails: mockMarket,
    openPositionsCount: 1, // maxOpenPositions is 1
  });
  assert(!test4.passed && test4.rule === 'MAX_OPEN_POSITIONS_CHECK', `Blocked max open positions: "${test4.reason}"`);

  // TEST 5: Block during trade cooldown
  risk.recordTradeExecution(Date.now() - 10000); // executed 10s ago (cooldown is 30s)
  const test5 = risk.validateOrderPreCheck({
    pair: 'BTCUSDT',
    side: 'buy',
    amountQuote: 50,
    currentPrice: 80000,
    marketDetails: mockMarket,
    openPositionsCount: 0,
  });
  assert(!test5.passed && test5.rule === 'COOLDOWN_CHECK', `Blocked during cooldown: "${test5.reason}"`);

  // Clear cooldown for subsequent tests
  risk.recordTradeExecution(Date.now() - 60000);

  // TEST 6: Block when daily loss limit exceeded
  risk.recordRealizedPnL(-55); // Loss of $55 exceeds maxDailyLoss of $50
  const test6 = risk.validateOrderPreCheck({
    pair: 'BTCUSDT',
    side: 'buy',
    amountQuote: 50,
    currentPrice: 80000,
    marketDetails: mockMarket,
  });
  assert(!test6.passed && test6.rule === 'MAX_DAILY_LOSS_CHECK', `Blocked daily loss limit exceeded: "${test6.reason}"`);

  // Reset risk manager for remaining checks
  const freshRisk = new RiskManager({
    botEnabled: true,
    emergencyStop: false,
    maxTradeAmount: 100,
    maxDailyLoss: 500,
    maxOpenPositions: 2,
    cooldownSeconds: 0,
  });

  // TEST 7: Block when market is suspended
  const inactiveMarket = { ...mockMarket, status: 'suspended' };
  const test7 = freshRisk.validateOrderPreCheck({
    pair: 'BTCUSDT',
    side: 'buy',
    amountQuote: 50,
    currentPrice: 80000,
    marketDetails: inactiveMarket,
  });
  assert(!test7.passed && test7.rule === 'MARKET_STATUS_CHECK', `Blocked suspended market: "${test7.reason}"`);

  // TEST 8: Block when below min_quantity
  const test8 = freshRisk.validateOrderPreCheck({
    pair: 'BTCUSDT',
    side: 'buy',
    quantity: 0.000001, // below min_quantity 0.00001
    amountQuote: 5,
    currentPrice: 80000,
    marketDetails: mockMarket,
  });
  assert(!test8.passed && test8.rule === 'MIN_QUANTITY_CHECK', `Blocked below minimum quantity: "${test8.reason}"`);

  // TEST 9: Block when below min_notional
  const test9 = freshRisk.validateOrderPreCheck({
    pair: 'BTCUSDT',
    side: 'buy',
    amountQuote: 2, // below min_notional 5
    currentPrice: 80000,
    marketDetails: mockMarket,
  });
  assert(!test9.passed && test9.rule === 'MIN_NOTIONAL_CHECK', `Blocked below minimum notional value: "${test9.reason}"`);

  // TEST 10: Successful Validation when all rules satisfied
  const test10 = freshRisk.validateOrderPreCheck({
    pair: 'BTCUSDT',
    side: 'buy',
    amountQuote: 50,
    currentPrice: 80000,
    marketDetails: mockMarket,
    openPositionsCount: 0,
  });
  assert(test10.passed === true, `All 9 risk checks passed successfully!`);

  console.log('\n----------------------------------------------------');
  console.log(`Phase 5 Test Results: ${passed} / ${total} passed`);
  console.log('----------------------------------------------------');

  if (passed === total) {
    console.log('>>> PHASE 5: RISK MANAGEMENT SUCCESSFUL! <<<\n');
    process.exit(0);
  } else {
    console.error('>>> PHASE 5 VERIFICATION FAILED! <<<\n');
    process.exit(1);
  }
}

runPhase5Tests().catch((err) => {
  console.error('Unhandled error in Phase 5 test suite:', err);
  process.exit(1);
});
