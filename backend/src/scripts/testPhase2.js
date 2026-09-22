const request = require('supertest');
const { app } = require('../server');

async function runPhase2Tests() {
  console.log('====================================================');
  console.log('       RUNNING PHASE 2 VERIFICATION TESTS           ');
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

  // TEST 1: Health Check Endpoint
  const healthRes = await request(app).get('/api/health');
  assert(
    healthRes.status === 200 && healthRes.body.status === 'healthy',
    `GET /api/health returned 200 OK (mode: ${healthRes.body.tradingMode})`
  );

  // TEST 2: Account Balance Endpoint (Paper Mode by default)
  const balanceRes = await request(app).get('/api/account/balance');
  assert(
    balanceRes.status === 200 &&
      balanceRes.body.success === true &&
      balanceRes.body.mode === 'PAPER_TRADING' &&
      Array.isArray(balanceRes.body.balances),
    `GET /api/account/balance returned Paper Trading balances (${balanceRes.body.balances.map(b => `${b.currency}: ${b.balance}`).join(', ')})`
  );

  // TEST 3: Market Ticker for BTCUSDT
  const tickerRes = await request(app).get('/api/market/ticker/BTCUSDT');
  assert(
    tickerRes.status === 200 &&
      tickerRes.body.success === true &&
      tickerRes.body.ticker &&
      parseFloat(tickerRes.body.ticker.last_price) > 0,
    `GET /api/market/ticker/BTCUSDT returned live price: ${tickerRes.body.ticker?.last_price}`
  );

  // TEST 4: Market Details for BTCUSDT
  const detailsRes = await request(app).get('/api/market/details/BTCUSDT');
  assert(
    detailsRes.status === 200 &&
      detailsRes.body.success === true &&
      detailsRes.body.details &&
      detailsRes.body.details.min_quantity !== undefined,
    `GET /api/market/details/BTCUSDT returned valid specs (min_quantity: ${detailsRes.body.details?.min_quantity})`
  );

  // TEST 5: Market Candles for BTCUSDT
  const candlesRes = await request(app).get('/api/market/candles/BTCUSDT?limit=5');
  assert(
    candlesRes.status === 200 &&
      candlesRes.body.success === true &&
      Array.isArray(candlesRes.body.candles) &&
      candlesRes.body.candles.length > 0,
    `GET /api/market/candles/BTCUSDT returned ${candlesRes.body.candles.length} candles`
  );

  // TEST 6: Supported Trading Pairs
  const pairsRes = await request(app).get('/api/market/pairs');
  assert(
    pairsRes.status === 200 &&
      pairsRes.body.success === true &&
      Array.isArray(pairsRes.body.pairs) &&
      pairsRes.body.pairs.length > 0,
    `GET /api/market/pairs returned ${pairsRes.body.count} active trading pairs`
  );

  console.log('\n----------------------------------------------------');
  console.log(`Phase 2 Test Results: ${passed} / ${total} passed`);
  console.log('----------------------------------------------------');

  if (passed === total) {
    console.log('>>> PHASE 2: BALANCE & MARKET DATA SUCCESSFUL! <<<\n');
    process.exit(0);
  } else {
    console.error('>>> PHASE 2 VERIFICATION FAILED! <<<\n');
    process.exit(1);
  }
}

runPhase2Tests().catch((err) => {
  console.error('Unhandled error in Phase 2 test suite:', err);
  process.exit(1);
});
