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
      default: 'BTCINR',
    },
    tradeAmount: {
      type: Number,
      default: 2500,
    },
    leverage: {
      type: Number,
      default: 1,
      min: 1,
      max: 100,
    },
    maxLossPercent: {
      type: Number,
      default: 1.8,
    },
    profitLockLevels: {
      type: String,
      default: '3,5,8,12,15',
    },
    profitLockStepAfterLast: {
      type: Number,
      default: 1.5,
    },
    lockBufferPercent: {
      type: Number,
      default: 0.3,
    },
    breakevenTriggerPercent: {
      type: Number,
      default: 2.0,
    },
    stopLossPercent: {
      type: Number,
      default: 1.8,
    },
    takeProfitPercent: {
      type: Number,
      default: 0,
    },
    trailingActivationPercent: {
      type: Number,
      default: 0.5,
    },
    trailingGivebackPercent: {
      type: Number,
      default: 0.3,
    },
    maxDailyLoss: {
      type: Number,
      default: 250,
    },
    maxOpenPositions: {
      type: Number,
      default: 1,
    },
    cooldownSeconds: {
      type: Number,
      default: 120,
    },
    strategy: {
      type: String,
      default: 'TREND_4H',
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
