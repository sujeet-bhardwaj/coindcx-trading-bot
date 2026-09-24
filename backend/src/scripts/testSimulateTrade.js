/**
 * Test script for instant demo trade simulation feature
 */
const tradingBot = require('../bot/tradingBot');

async function testSimulate() {
  console.log('--- Initial Bot State ---');
  await tradingBot.initialize();
  const initialStatus = tradingBot.getStatus();
  console.log('Initial USDT Balance:', initialStatus.balances.USDT);
  console.log('Initial Realized PnL:', initialStatus.dailyRealizedPnL);

  console.log('\n--- Running simulateDemoTrade() ---');
  const result = await tradingBot.simulateDemoTrade({ profitPercent: 2.0 });
  console.log('Result Success:', result.success);
  console.log('Result Message:', result.message);

  console.log('\n--- State After Simulation ---');
  const finalStatus = tradingBot.getStatus();
  console.log('Final USDT Balance:', finalStatus.balances.USDT);
  console.log('Final Realized PnL:', finalStatus.dailyRealizedPnL);
  console.log('Orders Count:', tradingBot.paperEngine.orders.length);
  console.log('Trades Count:', tradingBot.paperEngine.trades.length);

  if (result.success && finalStatus.dailyRealizedPnL > 0) {
    console.log('\n✅ VERIFICATION PASSED: Balance and Realized P&L successfully updated!');
    process.exit(0);
  } else {
    console.error('\n❌ VERIFICATION FAILED');
    process.exit(1);
  }
}

testSimulate().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
