const mongoose = require('mongoose');

const botSettingsSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    emergencyStop: {
      type: Boolean,
      default: false,
    },
    mode: {
      type: String,
      enum: ['PAPER_TRADING', 'LIVE_TRADING'],
      default: 'PAPER_TRADING',
    },
    pair: {
      type: String,
      default: 'BTCUSDT',
    },
    tradeAmount: {
      type: Number,
      default: 50,
    },
    leverage: {
      type: Number,
      default: 1,
      min: 1,
      max: 100,
    },
    stopLossPercent: {
      type: Number,
      default: 2.0,
    },
    takeProfitPercent: {
      type: Number,
      default: 4.0,
    },
    trailingActivationPercent: {
      type: Number,
      default: 3.5,
    },
    trailingGivebackPercent: {
      type: Number,
      default: 0.3,
    },
    breakevenTriggerPercent: {
      type: Number,
      default: 1.0,
    },
    maxDailyLoss: {
      type: Number,
      default: 100,
    },
    maxOpenPositions: {
      type: Number,
      default: 1,
    },
    cooldownSeconds: {
      type: Number,
      default: 60,
    },
    strategy: {
      type: String,
      default: 'EMA_RSI',
    },
    evalIntervalMs: {
      type: Number,
      default: 10000,
    },
    fastEmaPeriod: {
      type: Number,
      default: 20,
    },
    slowEmaPeriod: {
      type: Number,
      default: 50,
    },
    rsiPeriod: {
      type: Number,
      default: 14,
    },
    rsiOverbought: {
      type: Number,
      default: 70,
    },
    rsiOversold: {
      type: Number,
      default: 30,
    },
  },
  {
    timestamps: true,
  }
);

const BotSettings = mongoose.models.BotSettings || mongoose.model('BotSettings', botSettingsSchema);

module.exports = BotSettings;
