const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from backend root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const tradingMode = process.env.TRADING_MODE || 'PAPER_TRADING';

// Validate and sanitize TRADING_MODE
let validatedTradingMode = 'PAPER_TRADING';
if (tradingMode === 'LIVE_TRADING') {
  // Temporary bypass per user request: allow LIVE_TRADING without API credentials check
  /*
  if (!process.env.COINDCX_API_KEY || !process.env.COINDCX_API_SECRET) {
    console.warn('[SAFETY ALERT] LIVE_TRADING requested but COINDCX_API_KEY or COINDCX_API_SECRET is missing. Reverting safely to PAPER_TRADING.');
    validatedTradingMode = 'PAPER_TRADING';
  } else {
    validatedTradingMode = 'LIVE_TRADING';
  }
  */
  validatedTradingMode = 'LIVE_TRADING';
} else {
  validatedTradingMode = 'PAPER_TRADING';
}

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // CoinDCX API Credentials
  coindcx: {
    apiKey: process.env.COINDCX_API_KEY || '',
    apiSecret: process.env.COINDCX_API_SECRET || '',
    apiBaseUrl: 'https://api.coindcx.com',
    publicBaseUrl: 'https://public.coindcx.com',
    wsStreamUrl: 'wss://stream.coindcx.com',
  },

  // Database
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/coindcx_bot',

  // Security & Networking
  apiSecretKey: process.env.API_SECRET_KEY || 'dev-secret-key',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Mode & Risk Limits
  tradingMode: validatedTradingMode,
  defaultLeverage: parseInt(process.env.DEFAULT_LEVERAGE, 10) || 5,
  maxTradeAmount: parseFloat(process.env.MAX_TRADE_AMOUNT) || 50,
  riskPerTrade: parseFloat(process.env.RISK_PER_TRADE) || 0.005, // 0.5% maximum capital risk
  maxAccountExposure: parseFloat(process.env.MAX_ACCOUNT_EXPOSURE) || 1.0, // Max 100% of balance per position
  // Unified Exit Engine Settings
  maxLossPercent: parseFloat(process.env.MAX_LOSS_PERCENT) || 0.75,
  profitLockLevels: process.env.PROFIT_LOCK_LEVELS || '1.8,3,5,7,9,11,13,15',
  profitLockStepAfterLast: parseFloat(process.env.PROFIT_LOCK_STEP_AFTER_LAST) || 1,
  lockBufferPercent: parseFloat(process.env.LOCK_BUFFER_PERCENT) || 0,
  breakevenTriggerPercent: parseFloat(process.env.BREAKEVEN_TRIGGER_PERCENT) || 0,

  // Legacy mappings for backward compatibility
  get stopLossPercent() { return this.maxLossPercent; },
  get takeProfitPercent() { return 0; },
  get trailingActivationPercent() { return 0.5; },
  get trailingGivebackPercent() { return this.lockBufferPercent; },

  cooldownSeconds: parseInt(process.env.COOLDOWN_SECONDS, 10) || 60,
  maxOpenPositions: parseInt(process.env.MAX_OPEN_POSITIONS, 10) || 1,
  evalIntervalMs: parseInt(process.env.EVAL_INTERVAL_MS, 10) || 10000,

  // Strategy defaults
  defaultStrategy: process.env.DEFAULT_STRATEGY || 'SCALPER_3M',
  defaultPair: process.env.DEFAULT_PAIR || 'BTCUSDT',
  fastEmaPeriod: parseInt(process.env.FAST_EMA_PERIOD, 10) || 20,
  slowEmaPeriod: parseInt(process.env.SLOW_EMA_PERIOD, 10) || 50,
  rsiPeriod: parseInt(process.env.RSI_PERIOD, 10) || 14,
  rsiOverbought: parseInt(process.env.RSI_OVERBOUGHT, 10) || 70,
  rsiOversold: parseInt(process.env.RSI_OVERSOLD, 10) || 30,

  // Paper Trading Defaults
  paper: {
    initialBalanceUSDT: parseFloat(process.env.PAPER_INITIAL_BALANCE_USDT) || 10000,
    initialBalanceINR: parseFloat(process.env.PAPER_INITIAL_BALANCE_INR) || 100000,
    feePercent: parseFloat(process.env.PAPER_FEE_PERCENT) || 0.1,
  },

  // Helper to safely display config without leaking secrets
  getSanitizedConfig() {
    return {
      port: this.port,
      nodeEnv: this.nodeEnv,
      tradingMode: this.tradingMode,
      hasApiKey: Boolean(this.coindcx.apiKey),
      hasApiSecret: Boolean(this.coindcx.apiSecret),
      hasApiSecretKey: Boolean(this.apiSecretKey),
      corsOrigin: this.corsOrigin,
      defaultLeverage: this.defaultLeverage,
      maxTradeAmount: this.maxTradeAmount,
      maxDailyLoss: this.maxDailyLoss,
      maxLossPercent: this.maxLossPercent,
      profitLockLevels: this.profitLockLevels,
      profitLockStepAfterLast: this.profitLockStepAfterLast,
      lockBufferPercent: this.lockBufferPercent,
      breakevenTriggerPercent: this.breakevenTriggerPercent,
      stopLossPercent: this.stopLossPercent,
      takeProfitPercent: this.takeProfitPercent,
      trailingActivationPercent: this.trailingActivationPercent,
      trailingGivebackPercent: this.trailingGivebackPercent,
      defaultPair: this.defaultPair,
      evalIntervalMs: this.evalIntervalMs,
    };
  }
};

module.exports = config;
