const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/env');
const { connectDB } = require('./config/db');
const tradingBot = require('./bot/tradingBot');
const websocketService = require('./services/websocketService'); // Auto-reloaded for 15m cycle timer and enhanced trade history

const accountRoutes = require('./routes/accountRoutes');
const marketRoutes = require('./routes/marketRoutes');
const botRoutes = require('./routes/botRoutes');
const orderRoutes = require('./routes/orderRoutes');

const app = express();
const server = http.createServer(app);

// Security & Middleware
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  })
);
app.use(express.json());

// Request logging in development
if (config.nodeEnv === 'development') {
  app.use((req, res, next) => {
    console.log(`[API] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    tradingMode: config.tradingMode,
    botRunning: tradingBot.isRunning,
    emergencyStop: tradingBot.riskManager.emergencyStop,
  });
});

// App Info & System Status
app.get('/', (req, res) => {
  res.json({
    name: 'CoinDCX Automated Cryptocurrency Trading Bot API',
    version: '1.0.0',
    mode: config.tradingMode,
    endpoints: {
      health: '/api/health',
      balances: '/api/account/balance',
      marketPairs: '/api/market/pairs',
      ticker: '/api/market/ticker/:pair',
      marketDetails: '/api/market/details/:pair',
      candles: '/api/market/candles/:pair',
      orderbook: '/api/market/orderbook/:pair',
      botStatus: '/api/bot/status',
      botStart: 'POST /api/bot/start',
      botStop: 'POST /api/bot/stop',
      botEmergencyStop: 'POST /api/bot/emergency-stop',
      botSettings: '/api/bot/settings',
      orders: '/api/orders',
      trades: '/api/trades',
    },
  });
});

// Register API Route Modules
app.use('/api/account', accountRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/bot', botRoutes);
app.use('/api', orderRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err.message || err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: err.message || 'Internal Server Error',
    ...(config.nodeEnv === 'development' && { details: err.stack }),
  });
});

// Prevent process crash from unhandled exceptions or rejected promises
process.on('uncaughtException', (err) => {
  console.error('💥 [UNCAUGHT EXCEPTION]:', err.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.warn('⚠️ [UNHANDLED REJECTION]:', reason?.message || reason);
});

// Start Server and Database
async function startServer() {
  await connectDB();
  await tradingBot.initialize();
  websocketService.initialize(server, tradingBot);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${config.port} is already in use by another process. Please close it.`);
    } else {
      console.error('❌ Server network error:', err.message);
    }
  });

  if (process.env.NODE_ENV !== 'test') {
    server.listen(config.port, '0.0.0.0', () => {
      console.log('====================================================');
      console.log(`🚀 CoinDCX Trading Bot Backend running on port ${config.port}`);
      console.log(`🛡️  Current Mode: [ ${config.tradingMode} ]`);
      console.log(`📊 Health Endpoint: http://localhost:${config.port}/api/health`);
      console.log(`🤖 Bot Status: ${tradingBot.isRunning ? 'RUNNING' : 'STOPPED'}`);
      console.log('====================================================');

      // 24/7 Cloud Keepalive (Prevents Render Free Tier from sleeping when user turns off laptop)
      const renderUrl = process.env.RENDER_EXTERNAL_URL || process.env.SELF_PING_URL;
      if (renderUrl) {
        const keepaliveIntervalMs = 10 * 60 * 1000; // 10 minutes
        setInterval(() => {
          try {
            const pingUrl = `${renderUrl.replace(/\/$/, '')}/api/health`;
            const https = require('https');
            const httpLib = pingUrl.startsWith('https') ? https : http;
            httpLib.get(pingUrl, () => {}).on('error', () => {});
          } catch (pingErr) {
            // ignore
          }
        }, keepaliveIntervalMs);
        console.log(`⏱️ 24/7 Cloud Keepalive active for: ${renderUrl} (Self-pings every 10m to prevent sleeping)`);
      }
    });
  }
}

// Start Server and Database only in non-test runs
if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Fatal startup error:', err.message);
  });
}

// Graceful Shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT. Gracefully shutting down...');
  await tradingBot.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM. Gracefully shutting down...');
  await tradingBot.stop();
  process.exit(0);
});

module.exports = { app, server, tradingBot };
