const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    exchangeOrderId: {
      type: String,
      required: true,
      index: true,
    },
    clientOrderId: {
      type: String,
      default: null,
      index: true,
    },
    pair: {
      type: String,
      required: true,
      index: true,
    },
    side: {
      type: String,
      enum: ['buy', 'sell'],
      required: true,
    },
    type: {
      type: String,
      enum: ['market_order', 'limit_order', 'stop_limit'],
      default: 'market_order',
    },
    price: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    filledQuantity: {
      type: Number,
      default: 0,
    },
    fee: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: [
        'init',
        'open',
        'partially_filled',
        'filled',
        'partially_cancelled',
        'cancelled',
        'rejected',
      ],
      default: 'open',
      index: true,
    },
    mode: {
      type: String,
      enum: ['PAPER_TRADING', 'LIVE_TRADING'],
      default: 'PAPER_TRADING',
      index: true,
    },
    reason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

module.exports = Order;
