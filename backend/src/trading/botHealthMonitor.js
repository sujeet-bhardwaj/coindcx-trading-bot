/**
 * Bot Health Monitor & System Health Dashboard Service (Rules #91 & #92)
 *
 * Implements:
 * 1. BOT_HEARTBEAT recording and BOT_DOWN alert detection (Rule #91).
 * 2. Formatted read-only System Health Dashboard payload (Rule #92).
 */

class BotHealthMonitor {
  constructor(options = {}) {
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs || 60000; // 60s without heartbeat = BOT_DOWN
    this.lastHeartbeat = null;
    this.heartbeatHistory = [];
    this.maxHistory = 50;
    this.errorCount = 0;
  }

  /**
   * Rule #91: Records periodic bot heartbeat
   */
  recordHeartbeat(data = {}) {
    const heartbeat = {
      timestamp: Date.now(),
      timeFormatted: new Date().toISOString(),
      botRunning: Boolean(data.botRunning),
      lastMarketDataUpdate: data.lastMarketDataUpdate || Date.now(),
      lastProcessedCandle: data.lastProcessedCandle || null,
      apiStatus: data.apiStatus || 'HEALTHY',
      currentPosition: data.currentPosition || null,
      currentPnL: parseFloat(data.currentPnL || 0),
      lastOrderStatus: data.lastOrderStatus || 'NONE',
      errorCount: this.errorCount,
    };

    this.lastHeartbeat = heartbeat;
    this.heartbeatHistory.unshift(heartbeat);
    if (this.heartbeatHistory.length > this.maxHistory) {
      this.heartbeatHistory.pop();
    }

    return heartbeat;
  }

  recordError() {
    this.errorCount++;
  }

  resetErrorCount() {
    this.errorCount = 0;
  }

  /**
   * Rule #91: Checks if bot has stopped sending heartbeats
   */
  checkLiveness(now = Date.now()) {
    if (!this.lastHeartbeat) {
      return { isAlive: false, reason: 'NO_HEARTBEAT_RECORDED_YET' };
    }

    const elapsed = now - this.lastHeartbeat.timestamp;
    if (elapsed > this.heartbeatTimeoutMs) {
      return {
        isAlive: false,
        alertType: 'BOT_DOWN',
        elapsedMs: elapsed,
        reason: `BOT_DOWN: No heartbeat received for ${(elapsed / 1000).toFixed(1)}s (timeout: ${this.heartbeatTimeoutMs / 1000}s).`,
      };
    }

    return { isAlive: true, elapsedMs: elapsed };
  }

  /**
   * Rule #92: Compiles structured System Health Dashboard payload
   */
  getHealthDashboard(botInstance) {
    const risk = botInstance.riskManager;
    const activePos = botInstance.activePositions || [];
    const firstPos = activePos[0] || null;

    let profitLockStatus = 'NO_ACTIVE_LOCK';
    if (firstPos && firstPos.lockedProfitPercent > 0) {
      profitLockStatus = `LOCKED_AT_${firstPos.lockedProfitPercent.toFixed(2)}%_PEAK_${(firstPos.peakProfitPercent || 0).toFixed(2)}%`;
    }

    const dailyLimitStatus = risk.currentDailyLoss >= risk.maxDailyLoss
      ? 'DAILY_LIMIT_EXCEEDED'
      : `OK_USED_$${risk.currentDailyLoss.toFixed(2)}_OF_$${risk.maxDailyLoss.toFixed(2)}`;

    return {
      BOT_STATUS: botInstance.isRunning ? 'RUNNING' : 'STOPPED',
      API_STATUS: botInstance.exchangeHealthMonitor?.status || 'HEALTHY',
      MARKET_DATA_STATUS: (Date.now() - (botInstance.lastPriceUpdate || 0) < 15000) ? 'LIVE' : 'STALE',
      CURRENT_POSITION: activePos.length > 0
        ? {
            pair: firstPos.pair,
            side: firstPos.side || 'buy',
            quantity: firstPos.quantity,
            entryPrice: firstPos.entryPrice,
            currentPrice: botInstance.currentPrice,
          }
        : null,
      CURRENT_PNL: firstPos
        ? parseFloat((((botInstance.currentPrice - firstPos.entryPrice) / firstPos.entryPrice) * 100).toFixed(2))
        : 0,
      DAILY_PNL: parseFloat((-risk.currentDailyLoss).toFixed(2)),
      TRADES_TODAY: risk.dailyTradesCount,
      CONSECUTIVE_LOSSES: risk.consecutiveLosses,
      DAILY_LOSS_LIMIT_STATUS: dailyLimitStatus,
      PROFIT_LOCK_STATUS: profitLockStatus,
      LAST_PROCESSED_CANDLE: botInstance.candleTracker?.lastProcessedCandleTimeStr || null,
      LAST_ORDER: botInstance.lastBuy || botInstance.lastSell || null,
      LAST_ERROR: botInstance.lastError ? botInstance.lastError.message : null,
      EMERGENCY_STOP_STATUS: risk.emergencyStop ? 'ACTIVE' : 'INACTIVE',
      TIMESTAMP: new Date().toISOString(),
    };
  }
}

module.exports = BotHealthMonitor;
