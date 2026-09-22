const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema(
  {
    pair: {
      type: String,
      required: true,
      index: true,
    },
    side: {
      type: String,
      enum: ['buy', 'sell', 'buy_then_sell'],
      default: 'buy',
    },
    entryPrice: {
      type: Number,
      required: true,
    },
    exitPrice: {
      type: Number,
      default: null,
    },
    quantity: {
      type: Number,
      required: true,
    },
    stopLoss: {
      type: Number,
      default: null,
    },
    takeProfit: {
      type: Number,
      default: null,
    },
    profit: {
      type: Number,
      default: 0,
    },
    pnlPercent: {
      type: Number,
      default: 0,
    },
    fee: {
      type: Number,
      default: 0,
    },
    mode: {
      type: String,
      enum: ['PAPER_TRADING', 'LIVE_TRADING'],
      default: 'PAPER_TRADING',
      index: true,
    },
    strategy: {
      type: String,
      default: 'EMA_RSI',
    },
    status: {
      type: String,
      enum: ['open', 'closed', 'cancelled'],
      default: 'open',
      index: true,
    },
    reason: {
      type: String,
      default: 'SIGNAL',
    },
    closedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Trade = mongoose.models.Trade || mongoose.model('Trade', tradeSchema);

module.exports = Trade;
