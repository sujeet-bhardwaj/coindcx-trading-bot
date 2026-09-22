const crypto = require('crypto');
const CoinDCXService = require('../services/coindcxService');

async function runPhase1Tests() {
  console.log('====================================================');
  console.log('       RUNNING PHASE 1 VERIFICATION TESTS           ');
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

  // TEST 1: HMAC-SHA256 signature correctness with known test vector
  const testSecret = 'secret_test_key_12345';
  const testPayload = JSON.stringify({ timestamp: 1600000000000, market: 'BTCUSDT' });
  const expectedSignature = crypto
    .createHmac('sha256', testSecret)
    .update(testPayload)
    .digest('hex');

  const testService = new CoinDCXService({
    apiKey: 'key_test_123',
    apiSecret: testSecret,
  });

  const generatedSignature = testService.generateSignature(testPayload);
  assert(
    generatedSignature === expectedSignature,
    `HMAC-SHA256 signature generated correctly (${generatedSignature.slice(0, 16)}...)`
  );

  // TEST 2: Auth headers format check
  const headers = testService.getAuthHeaders({ timestamp: 1600000000000 });
  assert(
    headers['X-AUTH-APIKEY'] === 'key_test_123' &&
      typeof headers['X-AUTH-SIGNATURE'] === 'string' &&
      headers['Content-Type'] === 'application/json',
    'Auth headers include X-AUTH-APIKEY, X-AUTH-SIGNATURE, and Content-Type'
  );

  // TEST 3: Safe rejection when API secret is missing for private requests
  const unauthedService = new CoinDCXService({ apiKey: '', apiSecret: '' });
  let threwExpected = false;
  try {
    unauthedService.generateSignature({ test: true });
  } catch (err) {
    threwExpected = true;
  }
  assert(
    threwExpected,
    'Service safely throws when attempting to sign without API secret'
  );

  // TEST 4: Live CoinDCX Public Ticker Connectivity
  console.log('\nTesting live CoinDCX Public API endpoints...');
  try {
    const defaultService = new CoinDCXService();
    const btcTicker = await defaultService.getTicker('BTCUSDT');
    assert(
      btcTicker && btcTicker.market === 'BTCUSDT' && parseFloat(btcTicker.last_price) > 0,
      `Successfully connected to CoinDCX public ticker! BTCUSDT last_price: ${btcTicker.last_price}`
    );
  } catch (err) {
    console.error('Ticker error:', err.message);
    assert(false, 'CoinDCX public ticker connectivity failed');
  }

  // TEST 5: Live CoinDCX Market Details
  try {
    const defaultService = new CoinDCXService();
    const btcDetails = await defaultService.getMarketsDetails('BTCUSDT');
    assert(
      btcDetails && btcDetails.symbol === 'BTCUSDT' && btcDetails.min_quantity !== undefined,
      `Market details loaded for BTCUSDT: min_qty=${btcDetails.min_quantity}, min_notional=${btcDetails.min_notional}`
    );
  } catch (err) {
    console.error('Markets details error:', err.message);
    assert(false, 'CoinDCX markets details fetch failed');
  }

  // TEST 6: Live CoinDCX Candles
  try {
    const defaultService = new CoinDCXService();
    const candles = await defaultService.getCandles({ pair: 'B-BTC_USDT', interval: '1m', limit: 5 });
    assert(
      Array.isArray(candles) && candles.length > 0 && candles[0].close !== undefined,
      `Historical candles loaded: ${candles.length} candles retrieved (Latest close: ${candles[candles.length - 1].close})`
    );
  } catch (err) {
    console.error('Candles error:', err.message);
    assert(false, 'CoinDCX candles fetch failed');
  }

  console.log('\n----------------------------------------------------');
  console.log(`Phase 1 Test Results: ${passed} / ${total} passed`);
  console.log('----------------------------------------------------');

  if (passed === total) {
    console.log('>>> PHASE 1: PROJECT SETUP & API CONNECTION SUCCESSFUL! <<<\n');
    process.exit(0);
  } else {
    console.error('>>> PHASE 1 VERIFICATION FAILED! <<<\n');
    process.exit(1);
  }
}

runPhase1Tests().catch((err) => {
  console.error('Unhandled error in Phase 1 test suite:', err);
  process.exit(1);
});
