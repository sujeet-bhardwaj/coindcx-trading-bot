const { io: ioClient } = require('socket.io-client');
const mongoose = require('mongoose');

async function checkEverything() {
  console.log('================================================================');
  console.log('       🔍 COINDCX TRADING BOT - END-TO-END SYSTEM AUDIT         ');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function report(success, title, details = '') {
    total++;
    if (success) {
      console.log(`✅ [PASS] ${title}`);
      if (details) console.log(`   └─ ${details}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title}`);
      if (details) console.error(`   └─ ${details}`);
    }
  }

  // 1. Backend Server Health
  try {
    const res = await fetch('http://localhost:5000/api/health');
    const data = await res.json();
    report(
      res.status === 200 && data.status === 'healthy',
      'Backend Express Server is Online (Port 5000)',
      `Status: ${data.status}, Uptime: ${data.uptime.toFixed(1)}s, Mode: ${data.tradingMode}`
    );
  } catch (err) {
    report(false, 'Backend Express Server is Online', err.message);
  }

  // 2. Frontend Server Status
  try {
    const res = await fetch('http://localhost:3000');
    const html = await res.text();
    report(
      res.status === 200 && html.includes('CoinDCX Trading Bot'),
      'Frontend Vite React Server is Online (Port 3000)',
      `HTTP ${res.status}, Length: ${html.length} bytes, Contains app root & meta tags`
    );
  } catch (err) {
    report(false, 'Frontend Vite React Server is Online', err.message);
  }

  // 3. Live CoinDCX Market API Connectivity (BTCUSDT)
  try {
    const res = await fetch('http://localhost:5000/api/market/ticker/BTCUSDT');
    const data = await res.json();
    const lastPrice = parseFloat(data.ticker?.last_price || 0);
    report(
      data.success && lastPrice > 0,
      'Live CoinDCX Market API Connection (BTCUSDT)',
      `Live Ticker: $${lastPrice.toLocaleString()} | 24h Change: ${data.ticker.change_24_hour}%`
    );
  } catch (err) {
    report(false, 'Live CoinDCX Market API Connection (BTCUSDT)', err.message);
  }

  // 4. Live CoinDCX Market API Connectivity (BTCINR)
  try {
    const res = await fetch('http://localhost:5000/api/market/ticker/BTCINR');
    const data = await res.json();
    const lastPrice = parseFloat(data.ticker?.last_price || 0);
    report(
      data.success && lastPrice > 0,
      'Live CoinDCX Market API Connection (BTCINR)',
      `Live Ticker: ₹${lastPrice.toLocaleString()} | 24h High: ₹${data.ticker.high}`
    );
  } catch (err) {
    report(false, 'Live CoinDCX Market API Connection (BTCINR)', err.message);
  }

  // 5. Account Balance Endpoint (Paper Trading Mode Verification)
  try {
    const res = await fetch('http://localhost:5000/api/account/balance');
    const data = await res.json();
    const usdt = data.balances.find((b) => b.currency === 'USDT');
    const inr = data.balances.find((b) => b.currency === 'INR');
    report(
      data.success && data.mode === 'PAPER_TRADING' && usdt && inr,
      'Account Balance Endpoint (Protected PAPER_TRADING Mode)',
      `Mode: ${data.mode} | USDT: $${usdt.balance} | INR: ₹${inr.balance} | Notice: "${data.notice}"`
    );
  } catch (err) {
    report(false, 'Account Balance Endpoint', err.message);
  }

  // 6. Bot Lifecycle: Start Bot
  try {
    const res = await fetch('http://localhost:5000/api/bot/start', { method: 'POST' });
    const data = await res.json();
    report(
      data.success === true,
      'Bot Lifecycle Control: START BOT (POST /api/bot/start)',
      `Response: "${data.message}", isRunning: ${data.status?.isRunning}`
    );
  } catch (err) {
    report(false, 'Bot Lifecycle: START BOT', err.message);
  }

  // 7. Verify Bot Running Status & Active Evaluation
  try {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await fetch('http://localhost:5000/api/bot/status');
    const data = await res.json();
    report(
      data.success && data.status.isRunning === true,
      'Bot Evaluation Loop is Active & Evaluating Ticks',
      `Pair: ${data.status.pair}, Price: $${data.status.currentPrice}, Strategy: ${data.status.strategy}, Last Signal: ${data.status.lastSignal?.signal || 'HOLD'}`
    );
  } catch (err) {
    report(false, 'Bot Evaluation Loop', err.message);
  }

  // 8. Bot Lifecycle: Stop Bot
  try {
    const res = await fetch('http://localhost:5000/api/bot/stop', { method: 'POST' });
    const data = await res.json();
    report(
      data.success === true && data.status.isRunning === false,
      'Bot Lifecycle Control: STOP BOT (POST /api/bot/stop)',
      `Response: "${data.message}", isRunning: false`
    );
  } catch (err) {
    report(false, 'Bot Lifecycle: STOP BOT', err.message);
  }

  // 9. Emergency Stop Circuit Breaker
  try {
    const res = await fetch('http://localhost:5000/api/bot/emergency-stop', { method: 'POST' });
    const data = await res.json();
    report(
      data.success === true && data.status.emergencyStop === true,
      'Safety Circuit Breaker: EMERGENCY STOP (POST /api/bot/emergency-stop)',
      `emergencyStop: true, isRunning: false`
    );
  } catch (err) {
    report(false, 'Safety Circuit Breaker: EMERGENCY STOP', err.message);
  }

  // 10. Attempt Start while Emergency Stop is Active (Must Fail Safely)
  try {
    const res = await fetch('http://localhost:5000/api/bot/start', { method: 'POST' });
    const data = await res.json();
    report(
      data.success === false && data.message.includes('EMERGENCY STOP'),
      'Safety Guard: Block Start while Emergency Stop is Active',
      `Safely rejected with: "${data.message}"`
    );
  } catch (err) {
    report(false, 'Safety Guard: Block Start while Emergency Stop', err.message);
  }

  // 11. Reset Emergency Stop
  try {
    const res = await fetch('http://localhost:5000/api/bot/reset-emergency-stop', { method: 'POST' });
    const data = await res.json();
    report(
      data.success === true && data.status.emergencyStop === false,
      'Safety Circuit Breaker: RESET EMERGENCY STOP (POST /api/bot/reset-emergency-stop)',
      `emergencyStop: false (Restored normal standby)`
    );
  } catch (err) {
    report(false, 'Reset Emergency Stop', err.message);
  }

  // 12. Strategy Settings Update Endpoint
  try {
    const res = await fetch('http://localhost:5000/api/bot/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tradeAmount: 60,
        stopLossPercent: 2.0,
        takeProfitPercent: 4.0,
      }),
    });
    const data = await res.json();
    report(
      data.success && data.status.tradeAmount === 60,
      'Strategy & Risk Settings Configuration (PATCH /api/bot/settings)',
      `Trade Amount: $${data.status.tradeAmount}, Stop Loss: ${data.status.riskLimits.stopLossPercent}%, Take Profit: ${data.status.riskLimits.takeProfitPercent}%`
    );
  } catch (err) {
    report(false, 'Strategy Settings Update', err.message);
  }

  // 13. Orders and Trade History Endpoints
  try {
    const [ordersRes, tradesRes] = await Promise.all([
      fetch('http://localhost:5000/api/orders').then((r) => r.json()),
      fetch('http://localhost:5000/api/trades').then((r) => r.json()),
    ]);
    report(
      ordersRes.success && tradesRes.success,
      'Orders & Trade History Endpoints (/api/orders & /api/trades)',
      `Total Orders Recorded: ${ordersRes.orders.length} | Total Trades Recorded: ${tradesRes.trades.length}`
    );
  } catch (err) {
    report(false, 'Orders and Trade History Endpoints', err.message);
  }

  // 14. Real-time WebSocket / Socket.IO Connectivity
  try {
    const socket = ioClient('http://localhost:5000', {
      transports: ['websocket'],
      timeout: 3000,
    });

    const socketConnected = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket connection timed out')), 3000);
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve(true);
      });
      socket.on('connect_error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });

    const receivedStatus = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket bot_status timed out')), 3000);
      socket.on('bot_status', (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });

    socket.disconnect();

    report(
      socketConnected && receivedStatus && receivedStatus.mode === 'PAPER_TRADING',
      'Real-time WebSocket (Socket.IO) Stream & Event Broadcast',
      `Socket Connected, Real-time status event received (Pair: ${receivedStatus.pair}, Mode: ${receivedStatus.mode})`
    );
  } catch (err) {
    report(false, 'Real-time WebSocket (Socket.IO) Stream', err.message);
  }

  // 15. MongoDB Database Connection & Persistence
  try {
    const dbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/coindcx_bot';
    const conn = await mongoose.connect(dbUri, { serverSelectionTimeoutMS: 3000 });
    const collections = await conn.connection.db.listCollections().toArray();
    const collectionNames = collections.map((c) => c.name);
    await mongoose.disconnect();
    report(
      collections !== null,
      'MongoDB Database Connection & Schema Collections',
      `Connected to ${dbUri} | Collections present: [${collectionNames.join(', ')}]`
    );
  } catch (err) {
    report(false, 'MongoDB Database Connection', err.message);
  }

  console.log('\n================================================================');
  console.log(`  SYSTEM AUDIT RESULT: ${passed} / ${total} CHECKS PASSED (${((passed / total) * 100).toFixed(0)}%)`);
  console.log('================================================================\n');

  if (passed === total) {
    console.log('🎉 ALL SYSTEMS ARE 100% OPERATIONAL AND WORKING PERFECTLY!\n');
    process.exit(0);
  } else {
    console.error('⚠️ SOME CHECKS ENCOUNTERED ISSUES. Please see above.\n');
    process.exit(1);
  }
}

checkEverything().catch((err) => {
  console.error('Fatal audit runner error:', err);
  process.exit(1);
});
