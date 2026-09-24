const mongoose = require('mongoose');

const livePositionSchema = new mongoose.Schema(
  {
    positionId: { type: String, required: true, unique: true },
    pair: { type: String, required: true },
    side: { type: String, default: 'buy' },
    entryPrice: { type: Number, required: true },
    quantity: { type: Number, required: true },
    margin: { type: Number },
    leverage: { type: Number, default: 1 },
    liquidationPrice: { type: Number },
    stopLossPrice: { type: Number },
    takeProfitPrice: { type: Number },
    peakProfitPercent: { type: Number, default: 0 },
    lockedProfitPercent: { type: Number, default: 0 },
    strategy: { type: String, default: 'SCALPER_3M' },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const LivePosition = mongoose.models.LivePosition || mongoose.model('LivePosition', livePositionSchema);

module.exports = LivePosition;
