process.env.NODE_ENV = 'test';
const http = require('http');
const { io: ioClient } = require('socket.io-client');
const { app, tradingBot } = require('../server');
const websocketService = require('../services/websocketService');
const config = require('../config/env');

async function runPhase8Tests() {
  console.log('====================================================');
  console.log('       RUNNING PHASE 8 VERIFICATION TESTS           ');
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

  // Create isolated HTTP server for the test
  const testServer = http.createServer(app);
  const testPort = 5059;
  websocketService.initialize(testServer, tradingBot);

  await new Promise((resolve) => {
    testServer.listen(testPort, resolve);
  });

  const clientSocket = ioClient(`http://localhost:${testPort}`, {
    transports: ['websocket'],
    autoConnect: false,
    auth: { token: config.apiSecretKey },
  });

  let receivedBotStatus = null;
  clientSocket.on('bot_status', (data) => {
    receivedBotStatus = data;
  });

  try {
    // TEST 1: WebSocket Connection
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 4000);
      clientSocket.on('connect', () => {
        clearTimeout(timeout);
        assert(clientSocket.connected, `Socket.io client connected successfully (id: ${clientSocket.id})`);
        resolve();
      });
      clientSocket.connect();
    });

    // TEST 2: Receive bot_status on connection
    await new Promise((resolve, reject) => {
      if (receivedBotStatus) return resolve();
      const timeout = setTimeout(() => {
        if (receivedBotStatus) resolve();
        else reject(new Error('bot_status timeout'));
      }, 3000);
      clientSocket.once('bot_status', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    assert(
      receivedBotStatus && receivedBotStatus.mode === 'PAPER_TRADING',
      `Received real-time 'bot_status' event from WebSocket (mode: ${receivedBotStatus?.mode})`
    );

    // TEST 3: Emit 'emergency_stop' via WebSocket
    clientSocket.emit('emergency_stop');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert(
      tradingBot.riskManager.emergencyStop === true,
      `Successfully processed 'emergency_stop' command via WebSocket`
    );

    // TEST 4: Emit 'reset_emergency_stop' via WebSocket
    clientSocket.emit('reset_emergency_stop');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert(
      tradingBot.riskManager.emergencyStop === false,
      `Successfully processed 'reset_emergency_stop' command via WebSocket`
    );

    // TEST 5: Broadcast tick event
    const receivedTick = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('tick timeout')), 4000);
      clientSocket.on('price_tick', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
      websocketService.broadcast('price_tick', { pair: 'BTCUSDT', price: 81500 });
    });

    assert(
      receivedTick && receivedTick.price === 81500,
      `Real-time price tick streamed to client (price: $${receivedTick?.price})`
    );

    console.log('\n----------------------------------------------------');
    console.log(`Phase 8 Test Results: ${passed} / ${total} passed`);
    console.log('----------------------------------------------------');

    if (passed === total) {
      console.log('>>> PHASE 8: WEBSOCKET REAL-TIME UPDATES SUCCESSFUL! <<<\n');
      clientSocket.disconnect();
      testServer.close();
      process.exit(0);
    } else {
      console.error('>>> PHASE 8 VERIFICATION FAILED! <<<\n');
      clientSocket.disconnect();
      testServer.close();
      process.exit(1);
    }
  } catch (err) {
    console.error('Phase 8 Test Error:', err.message);
    clientSocket.disconnect();
    testServer.close();
    process.exit(1);
  }
}

runPhase8Tests().catch((err) => {
  console.error('Unhandled error in Phase 8 test suite:', err);
  process.exit(1);
});
