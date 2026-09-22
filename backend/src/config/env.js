const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from backend root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const tradingMode = process.env.TRADING_MODE || 'PAPER_TRADING';

// Validate and sanitize TRADING_MODE
let validatedTradingMode = 'PAPER_TRADING';
if (tradingMode === 'LIVE_TRADING') {
  if (!process.env.COINDCX_API_KEY || !process.env.COINDCX_API_SECRET) {
    console.warn('[SAFETY ALERT] LIVE_TRADING requested but COINDCX_API_KEY or COINDCX_API_SECRET is missing. Reverting safely to PAPER_TRADING.');
    validatedTradingMode = 'PAPER_TRADING';
  } else {
    validatedTradingMode = 'LIVE_TRADING';
  }
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

  // Mode & Risk Limits
  tradingMode: validatedTradingMode,
  maxTradeAmount: parseFloat(process.env.MAX_TRADE_AMOUNT) || 50,
  maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS) || 100,
  stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT) || 2.0,
  takeProfitPercent: parseFloat(process.env.TAKE_PROFIT_PERCENT) || 4.0,
  cooldownSeconds: parseInt(process.env.COOLDOWN_SECONDS, 10) || 60,
  maxOpenPositions: parseInt(process.env.MAX_OPEN_POSITIONS, 10) || 1,

  // Strategy defaults
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
      maxTradeAmount: this.maxTradeAmount,
      maxDailyLoss: this.maxDailyLoss,
      stopLossPercent: this.stopLossPercent,
      takeProfitPercent: this.takeProfitPercent,
      defaultPair: this.defaultPair,
    };
  }
};

module.exports = config;
