/**
 * Permanent Audit Log Service (Rule #86)
 *
 * Implements strict, structured, permanent audit recording for:
 * 1. Every trade execution and closure with all required parameters.
 * 2. Critical system events (API errors, order errors, state mismatches,
 *    risk-limit activations, emergency stops, maintenance, data failures).
 */

const fs = require('fs');
const path = require('path');

class AuditLogService {
  constructor(options = {}) {
    this.logsDir = options.logsDir || path.join(process.cwd(), 'logs');
    this.tradeLogFile = path.join(this.logsDir, 'audit_trades.jsonl');
    this.eventLogFile = path.join(this.logsDir, 'audit_events.jsonl');
    this.inMemoryTrades = [];
    this.inMemoryEvents = [];
    this.maxMemory = 200;

    // Ensure logs directory exists
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }
    } catch {
      // Non-fatal if filesystem is restricted
    }
  }

  /**
   * Rule #86: Formats and permanently logs every trade
   */
  recordTradeAudit(tradeData = {}) {
    const record = {
      TRADE_ID: tradeData.TRADE_ID || tradeData.tradeId || `TRADE-${Date.now()}`,
      BOT_INSTANCE_ID: tradeData.BOT_INSTANCE_ID || tradeData.botInstanceId || 'DEFAULT_BOT',
      TIMESTAMP: tradeData.TIMESTAMP || new Date().toISOString(),
      SYMBOL: tradeData.SYMBOL || tradeData.pair || 'BTCUSDT',
      SIDE: tradeData.SIDE || tradeData.side || 'buy',
      SIGNAL: tradeData.SIGNAL || tradeData.signal || 'EMA_CROSSOVER',
      ENTRY_PRICE: parseFloat(tradeData.ENTRY_PRICE || tradeData.entryPrice || 0),
      EXIT_PRICE: parseFloat(tradeData.EXIT_PRICE || tradeData.exitPrice || 0),
      REQUESTED_QUANTITY: parseFloat(tradeData.REQUESTED_QUANTITY || tradeData.requestedQuantity || 0),
      FILLED_QUANTITY: parseFloat(tradeData.FILLED_QUANTITY || tradeData.filledQuantity || tradeData.quantity || 0),
      AVERAGE_FILL_PRICE: parseFloat(tradeData.AVERAGE_FILL_PRICE || tradeData.averageFillPrice || tradeData.entryPrice || 0),
      STOP_LOSS: parseFloat(tradeData.STOP_LOSS || tradeData.stopLoss || tradeData.stopLossPrice || 0),
      HIGHEST_PRICE: parseFloat(tradeData.HIGHEST_PRICE || tradeData.highestPrice || 0),
      HIGHEST_PROFIT: parseFloat(tradeData.HIGHEST_PROFIT || tradeData.peakProfitPercent || 0),
      LOCKED_PROFIT: parseFloat(tradeData.LOCKED_PROFIT || tradeData.lockedProfitPercent || 0),
      EXIT_REASON: tradeData.EXIT_REASON || tradeData.reason || 'MANUAL_OR_SIGNAL',
      FEES: parseFloat(tradeData.FEES || tradeData.fees || tradeData.fee || 0),
      SLIPPAGE: parseFloat(tradeData.SLIPPAGE || tradeData.slippage || 0),
      GROSS_PNL: parseFloat(tradeData.GROSS_PNL || tradeData.grossPnL || tradeData.profit || 0),
      NET_PNL: parseFloat(tradeData.NET_PNL || tradeData.netPnL || tradeData.profit || 0),
      DAILY_PNL: parseFloat(tradeData.DAILY_PNL || tradeData.dailyPnL || 0),
    };

    this.inMemoryTrades.unshift(record);
    if (this.inMemoryTrades.length > this.maxMemory) this.inMemoryTrades.pop();

    this._appendToFile(this.tradeLogFile, record);
    return record;
  }

  /**
   * Rule #86: Logs critical system and risk events
   */
  recordEventAudit(eventType, eventData = {}) {
    const record = {
      EVENT_ID: `EVT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      EVENT_TYPE: eventType, // API_ERROR | ORDER_ERROR | STATE_MISMATCH | RISK_LIMIT_ACTIVATION | etc.
      TIMESTAMP: new Date().toISOString(),
      DETAILS: eventData,
    };

    this.inMemoryEvents.unshift(record);
    if (this.inMemoryEvents.length > this.maxMemory) this.inMemoryEvents.pop();

    this._appendToFile(this.eventLogFile, record);
    return record;
  }

  _appendToFile(filePath, data) {
    try {
      const line = JSON.stringify(data) + '\n';
      fs.appendFileSync(filePath, line, 'utf8');
    } catch {
      // Memory fallback if filesystem write fails
    }
  }

  getRecentTrades(limit = 50) {
    return this.inMemoryTrades.slice(0, limit);
  }

  getRecentEvents(limit = 50) {
    return this.inMemoryEvents.slice(0, limit);
  }
}

const defaultAuditLogService = new AuditLogService();

module.exports = {
  AuditLogService,
  auditLogService: defaultAuditLogService,
};
