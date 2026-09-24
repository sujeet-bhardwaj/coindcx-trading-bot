const mongoose = require('mongoose');

const paperPositionSchema = new mongoose.Schema(
  {
    positionId: { type: String, required: true },
    pair: { type: String, required: true },
    side: { type: String, enum: ['buy', 'sell'], default: 'buy' },
    entryPrice: { type: Number, required: true },
    quantity: { type: Number, required: true },
    leverage: { type: Number, default: 1 },
    margin: { type: Number },
    notionalValue: { type: Number },
    liquidationPrice: { type: Number },
    stopLossPrice: { type: Number },
    takeProfitPrice: { type: Number },
    stopLossPercent: { type: Number },
    takeProfitPercent: { type: Number },
    peakProfitPercent: { type: Number, default: 0 },
    lockedProfitPercent: { type: Number, default: 0 },
    trailingActive: { type: Boolean, default: false },
    effectiveStopLossPrice: { type: Number },
    strategy: { type: String, default: 'EMA_RSI' },
    entryFee: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const paperAccountSchema = new mongoose.Schema(
  {
    balances: {
      USDT: { type: Number, default: 10000 },
      INR: { type: Number, default: 100000 },
      BTC: { type: Number, default: 0 },
      ETH: { type: Number, default: 0 },
    },
    positions: [paperPositionSchema],
    dailyRealizedPnL: { type: Number, default: 0 },
    dailyLossResetDate: { type: String, default: () => new Date().toDateString() },
  },
  { timestamps: true }
);

const PaperAccount = mongoose.models.PaperAccount || mongoose.model('PaperAccount', paperAccountSchema);

module.exports = PaperAccount;
