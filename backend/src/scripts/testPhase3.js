const { PaperTradingEngine } = require('../services/paperTradingEngine');

async function runPhase3Tests() {
  console.log('====================================================');
  console.log('       RUNNING PHASE 3 VERIFICATION TESTS           ');
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

  const engine = new PaperTradingEngine({
    initialBalanceUSDT: 10000,
    feePercent: 0.1,
    slippagePercent: 0.05,
  });

  // TEST 1: Initial Balances
  const initialBalances = engine.getBalances();
  assert(
    initialBalances.USDT === 10000 && initialBalances.BTC === 0,
    `Initial paper wallet initialized with 10,000 USDT and 0 BTC`
  );

  // TEST 2: Simulated BUY Order Execution
  const btcBuyPrice = 80000;
  const tradeAmount = 1000; // 1000 USDT
  const buyResult = await engine.executeBuy({
    pair: 'BTCUSDT',
    amountQuote: tradeAmount,
    currentPrice: btcBuyPrice,
    stopLossPercent: 2.0,
    takeProfitPercent: 4.0,
  });

  assert(
    engine.getBalances().USDT === 9000,
    `USDT balance correctly deducted from 10000 to 9000`
  );

  assert(
    engine.getBalances().BTC > 0 && buyResult.order.side === 'buy' && buyResult.order.status === 'filled',
    `BTC acquired: ${engine.getBalances().BTC.toFixed(6)} BTC (Order status: ${buyResult.order.status})`
  );

  assert(
    buyResult.position.stopLossPrice < buyResult.position.entryPrice &&
      buyResult.position.takeProfitPrice > buyResult.position.entryPrice,
    `Risk levels calculated: Stop Loss at $${buyResult.position.stopLossPrice.toFixed(2)}, Take Profit at $${buyResult.position.takeProfitPrice.toFixed(2)}`
  );

  // TEST 3: Unrealized P&L Calculation with Price Increase
  const higherPrice = 82000;
  const positionsWithPnL = engine.getPositionsWithPnL({ BTCUSDT: higherPrice });
  assert(
    positionsWithPnL.length === 1 && positionsWithPnL[0].unrealizedPnL > 0,
    `Unrealized P&L at $${higherPrice}: +$${positionsWithPnL[0].unrealizedPnL.toFixed(2)} (${positionsWithPnL[0].unrealizedPnLPercent.toFixed(2)}%)`
  );

  // TEST 4: Simulated SELL Order Execution (Take-Profit trigger)
  const sellResult = await engine.executeSell({
    pair: 'BTCUSDT',
    positionId: buyResult.position.positionId,
    currentPrice: higherPrice,
    reason: 'TAKE_PROFIT_TRIGGERED',
  });

  assert(
    sellResult.trade.profit > 0 && sellResult.trade.reason === 'TAKE_PROFIT_TRIGGERED',
    `Position closed with net profit of +$${sellResult.trade.profit.toFixed(2)} (Fees deducted: $${sellResult.trade.fee.toFixed(2)})`
  );

  assert(
    engine.getPositionsWithPnL().length === 0,
    `Open position removed after sell execution`
  );

  assert(
    engine.getBalances().USDT > 10000,
    `New USDT balance is $${engine.getBalances().USDT.toFixed(2)} (profitable simulated trade)`
  );

  // TEST 5: Insufficient Balance Rejection
  let insufficientErr = false;
  try {
    await engine.executeBuy({
      pair: 'BTCUSDT',
      amountQuote: 50000, // exceeds available USDT
      currentPrice: 80000,
    });
  } catch (err) {
    insufficientErr = true;
  }
  assert(
    insufficientErr,
    `Safely rejected order exceeding available simulated balance`
  );

  // TEST 6: Invalid Sell Rejection
  let invalidSellErr = false;
  try {
    await engine.executeSell({
      pair: 'ETHUSDT',
      currentPrice: 3000,
    });
  } catch (err) {
    invalidSellErr = true;
  }
  assert(
    invalidSellErr,
    `Safely rejected sell when no open position or holding exists`
  );

  console.log('\n----------------------------------------------------');
  console.log(`Phase 3 Test Results: ${passed} / ${total} passed`);
  console.log('----------------------------------------------------');

  if (passed === total) {
    console.log('>>> PHASE 3: PAPER TRADING ENGINE SUCCESSFUL! <<<\n');
    process.exit(0);
  } else {
    console.error('>>> PHASE 3 VERIFICATION FAILED! <<<\n');
    process.exit(1);
  }
}

runPhase3Tests().catch((err) => {
  console.error('Unhandled error in Phase 3 test suite:', err);
  process.exit(1);
});
