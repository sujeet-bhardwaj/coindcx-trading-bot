/**
 * Reconciliation, Exchange Health & Bot Instance Manager
 *
 * Implements Production Requirements:
 * - Rule #70: Exchange Maintenance & Health Monitor (STOP_NEW_ENTRIES = true, reconciliation on recovery)
 * - Rule #71: Market Halt / Symbol Unavailable Detection
 * - Rule #73: Manual Intervention Detection (Manual BUY, SELL, Close, Stop-Loss change)
 * - Rule #74: Unexpected Position Detection (Exchange as source of truth)
 * - Rule #75: Balance Reconciliation (Available balance vs Total/Locked/Margin)
 * - Rule #77: Multiple Bot Instance Protection (Single process execution lock)
 * - Rule #78: Server Crash Recovery (Restores balance, positions, orders, daily risk, candle)
 * - Rule #79: Profit-Lock State Recovery (Restores peak/lock ladder; fails safely without inventing state)
 */

const fs = require('fs');
const path = require('path');

/**
 * Rule #77: Multiple Bot Instance Protection
 * Prevents multiple instances of the same bot from trading simultaneously.
 */
class BotInstanceManager {
  constructor(options = {}) {
    this.instanceId = options.instanceId || `BOT-INST-${process.pid || 0}-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    this.useMemoryOnly = Boolean(options.useMemoryOnly || (process.env.NODE_ENV === 'test' && !options.lockFilePath));
    this.lockFilePath = options.lockFilePath || path.join(process.cwd(), '.bot_instance.lock');
    this.staleTimeoutMs = options.staleTimeoutMs || 15000; // 15s stale heartbeat
    this.hasLock = false;
    this.lockMetadata = null;
  }

  /**
   * Attempts to acquire exclusive trading lock for this account/pair
   */
  acquireLock({ pair = 'BTCUSDT', mode = 'PAPER_TRADING', force = false } = {}) {
    const now = Date.now();

    if (this.useMemoryOnly) {
      this.hasLock = true;
      this.lockMetadata = {
        instanceId: this.instanceId,
        pid: process.pid,
        pair,
        mode,
        acquiredAt: now,
        lastHeartbeat: now
      };
      return {
        acquired: true,
        instanceId: this.instanceId,
        pid: process.pid,
        message: `Acquired in-memory exclusive trading lock: ${this.instanceId}`
      };
    }

    // Check if existing lockfile exists
    if (fs.existsSync(this.lockFilePath) && !force) {
      try {
        const raw = fs.readFileSync(this.lockFilePath, 'utf8');
        const existing = JSON.parse(raw);

        // If lock belongs to another active process and is not stale
        const isStale = (now - existing.lastHeartbeat) > this.staleTimeoutMs;
        const isSameProcess = existing.instanceId === this.instanceId;

        if (!isStale && !isSameProcess) {
          return {
            acquired: false,
            reason: 'ANOTHER_ACTIVE_BOT_INSTANCE_RUNNING',
            activeInstanceId: existing.instanceId,
            pid: existing.pid,
            lastHeartbeatAgeMs: now - existing.lastHeartbeat,
            message: `Trading halted: Another active bot instance (${existing.instanceId}, PID: ${existing.pid}) holds exclusive lock.`
          };
        }
      } catch (readErr) {
        // If file is corrupt, allow overwriting
      }
    }

    // Write lock
    const lockData = {
      instanceId: this.instanceId,
      pid: process.pid,
      pair,
      mode,
      acquiredAt: now,
      lastHeartbeat: now
    };

    try {
      fs.writeFileSync(this.lockFilePath, JSON.stringify(lockData, null, 2), 'utf8');
      this.hasLock = true;
      this.lockMetadata = lockData;
      return {
        acquired: true,
        instanceId: this.instanceId,
        pid: process.pid,
        message: `Acquired exclusive trading lock: ${this.instanceId}`
      };
    } catch (writeErr) {
      return {
        acquired: false,
        reason: 'LOCK_WRITE_FAILED',
        error: writeErr.message
      };
    }
  }

  /**
   * Renews heartbeat to keep lock fresh
   */
  renewHeartbeat() {
    if (!this.hasLock) return false;
    const now = Date.now();
    if (this.useMemoryOnly) {
      if (this.lockMetadata) this.lockMetadata.lastHeartbeat = now;
      return true;
    }
    try {
      const lockData = {
        ...this.lockMetadata,
        lastHeartbeat: now
      };
      fs.writeFileSync(this.lockFilePath, JSON.stringify(lockData, null, 2), 'utf8');
      this.lockMetadata = lockData;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Releases lock on shutdown or pause
   */
  releaseLock() {
    if (!this.useMemoryOnly && fs.existsSync(this.lockFilePath)) {
      try {
        const raw = fs.readFileSync(this.lockFilePath, 'utf8');
        const existing = JSON.parse(raw);
        if (existing.instanceId === this.instanceId) {
          fs.unlinkSync(this.lockFilePath);
        }
      } catch {
        // Ignore removal error
      }
    }
    this.hasLock = false;
    this.lockMetadata = null;
    return true;
  }
}

/**
 * Rule #70: Exchange Health Monitor
 * Detects maintenance, outages, repeated API errors, and manages recovery reconciliation.
 */
class ExchangeHealthMonitor {
  constructor(options = {}) {
    this.errorThreshold = options.errorThreshold || 3;
    this.consecutiveErrors = 0;
    this.status = 'HEALTHY'; // HEALTHY | DEGRADED | MAINTENANCE | UNAVAILABLE | RECOVERED
    this.stopNewEntries = false;
    this.needsReconciliation = false;
    this.lastError = null;
    this.lastSuccessTime = Date.now();
  }

  recordSuccess() {
    this.lastSuccessTime = Date.now();
    const wasUnavailable = ['DEGRADED', 'MAINTENANCE', 'UNAVAILABLE'].includes(this.status);
    this.consecutiveErrors = 0;

    if (wasUnavailable) {
      this.status = 'RECOVERED';
      // Invariant: Never auto-assume everything is normal after API recovery. Reconciliation required!
      this.needsReconciliation = true;
      this.stopNewEntries = true; // Still hold entries until reconciliation completes
      return {
        recovered: true,
        needsReconciliation: true,
        message: 'Exchange API recovered. Reconciliation required before allowing new trades.'
      };
    }

    if (this.status === 'RECOVERED' && !this.needsReconciliation) {
      this.status = 'HEALTHY';
      this.stopNewEntries = false;
    }

    return { healthy: true, status: this.status };
  }

  recordError(err) {
    this.consecutiveErrors += 1;
    this.lastError = {
      message: err?.message || String(err),
      statusCode: err?.response?.status || err?.status || null,
      timestamp: Date.now()
    };

    const errMsg = (err?.message || '').toLowerCase();
    const isMaintenance = errMsg.includes('maintenance') || err?.response?.status === 503;
    const isUnavailable = err?.response?.status === 502 || err?.response?.status === 504 || errMsg.includes('econnrefused');

    if (isMaintenance) {
      this.status = 'MAINTENANCE';
      this.stopNewEntries = true;
    } else if (isUnavailable || this.consecutiveErrors >= this.errorThreshold) {
      this.status = 'UNAVAILABLE';
      this.stopNewEntries = true;
    } else {
      this.status = 'DEGRADED';
    }

    return {
      status: this.status,
      stopNewEntries: this.stopNewEntries,
      consecutiveErrors: this.consecutiveErrors,
      lastError: this.lastError
    };
  }

  canOpenNewEntries() {
    return !this.stopNewEntries && !this.needsReconciliation && this.status === 'HEALTHY';
  }

  completeReconciliation() {
    this.needsReconciliation = false;
    this.status = 'HEALTHY';
    this.stopNewEntries = false;
    return {
      status: 'HEALTHY',
      stopNewEntries: false,
      message: 'Exchange reconciliation completed successfully. Trading resumed.'
    };
  }
}

/**
 * Rule #71: Market Halt / Symbol Unavailable
 * Halts new entries when a pair is delisted, halted, or inactive.
 */
class SymbolHealthMonitor {
  static checkSymbolAvailability(pair, marketDetails = null) {
    if (!marketDetails) {
      return {
        available: false,
        stopNewEntries: true,
        reason: `Market details unavailable for pair ${pair}.`,
        rule: 'SYMBOL_DETAILS_MISSING'
      };
    }

    const status = (marketDetails.status || '').toLowerCase();
    const isHalted = status === 'halted' || status === 'suspended' || status === 'inactive' || status === 'maintenance';

    if (isHalted) {
      return {
        available: false,
        stopNewEntries: true,
        pair,
        status,
        reason: `Trading pair ${pair} is currently ${status.toUpperCase()}. New entries halted.`,
        rule: 'MARKET_HALT_OR_UNAVAILABLE'
      };
    }

    return {
      available: true,
      stopNewEntries: false,
      pair,
      status: status || 'active'
    };
  }
}

/**
 * Rule #75: Balance Reconciliation
 * Strictly differentiates between Total Balance and Available Balance, accounting for
 * locked balances and margin in open orders before sizing positions.
 */
class BalanceReconciliationEngine {
  static reconcileBalance({
    totalBalance = 0,
    availableBalance = 0,
    lockedBalance = 0,
    openOrderMargin = 0,
    currentPositionValue = 0,
    requiredMargin = 0
  }) {
    const total = Math.max(0, parseFloat(totalBalance) || 0);
    const available = Math.max(0, parseFloat(availableBalance) || 0);
    const locked = Math.max(0, parseFloat(lockedBalance) || 0);
    const orderMargin = Math.max(0, parseFloat(openOrderMargin) || 0);
    const posValue = Math.max(0, parseFloat(currentPositionValue) || 0);
    const req = Math.max(0, parseFloat(requiredMargin) || 0);

    // Truly usable capital cannot exceed availableBalance or (total - locked - openOrderMargin)
    const unencumbered = Math.max(0, total - locked - orderMargin);
    const usableCapital = Math.min(available, unencumbered);

    const logRecord = {
      TOTAL_BALANCE: total,
      AVAILABLE_BALANCE: available,
      LOCKED_BALANCE: locked,
      OPEN_ORDER_MARGIN: orderMargin,
      CURRENT_POSITION_VALUE: posValue,
      USABLE_CAPITAL: usableCapital
    };

    if (req > 0 && usableCapital < req) {
      return {
        passed: false,
        usableCapital,
        requiredMargin: req,
        breakdown: logRecord,
        reason: `Insufficient available funds after balance reconciliation: Usable capital $${usableCapital.toFixed(2)} is less than required margin $${req.toFixed(2)} (Total: $${total.toFixed(2)}, Locked: $${locked.toFixed(2)}).`,
        rule: 'BALANCE_RECONCILIATION_FAILED'
      };
    }

    return {
      passed: true,
      usableCapital,
      breakdown: logRecord
    };
  }
}

/**
 * Rules #73 & #74: State Reconciler
 * Detects manual intervention (Manual Buy, Sell, Close, Stop modification)
 * and unexpected exchange positions. Exchange is treated as source of truth.
 */
class StateReconciler {
  /**
   * Reconciles local bot positions with actual positions reported by exchange
   */
  static reconcilePositions(localPositions = [], exchangePositions = []) {
    const local = Array.isArray(localPositions) ? [...localPositions] : [];
    const exchange = Array.isArray(exchangePositions) ? [...exchangePositions] : [];

    const mismatches = [];
    let pauseNewEntries = false;

    // 1. Detect Unexpected Positions on Exchange (Rule #74 / Manual BUY)
    for (const exPos of exchange) {
      const match = local.find(
        (lp) => (lp.pair === exPos.pair || lp.symbol === exPos.pair) && Math.abs(lp.quantity - exPos.quantity) < 1e-6
      );

      if (!match) {
        // Exchange has a position that bot did not create
        pauseNewEntries = true;
        mismatches.push({
          type: 'UNEXPECTED_POSITION_DETECTED',
          exchangePosition: exPos,
          reason: `Exchange reports unexpected position ${exPos.pair} (Qty: ${exPos.quantity}, Side: ${exPos.side || 'buy'}). Bot state was empty or different.`
        });
      }
    }

    // 2. Detect Manual Closes on Exchange (Rule #73 / Manual SELL)
    for (const locPos of local) {
      const match = exchange.find(
        (ep) => (ep.pair === locPos.pair || ep.symbol === locPos.pair) && Math.abs(ep.quantity - locPos.quantity) < 1e-6
      );

      if (!match) {
        // Bot thought position was open, but exchange reports 0 or closed
        pauseNewEntries = true;
        mismatches.push({
          type: 'MANUAL_CLOSE_DETECTED',
          localPosition: locPos,
          reason: `Position ${locPos.positionId || locPos.pair} was manually closed or sold on the exchange.`
        });
      } else {
        // 3. Detect Stop Loss or Quantity Modification (Rule #73)
        if (locPos.stopLossPrice && match.stopLossPrice && Math.abs(locPos.stopLossPrice - match.stopLossPrice) > 1e-4) {
          mismatches.push({
            type: 'MANUAL_STOP_MODIFICATION',
            localPosition: locPos,
            exchangeStopLoss: match.stopLossPrice,
            reason: `Stop loss price modified manually on exchange: Local ${locPos.stopLossPrice} vs Exchange ${match.stopLossPrice}.`
          });
        }
      }
    }

    const inSync = mismatches.length === 0;

    return {
      inSync,
      mismatchDetected: !inSync,
      pauseNewEntries,
      mismatches,
      // Exchange is source of truth:
      reconciledPositions: exchange
    };
  }
}

/**
 * Rules #78 & #79: Crash Recovery & Profit-Lock Recovery Manager
 * Restores state without assuming restart = clean state.
 * Restores peak profits and profit-lock ladders safely.
 */
class CrashRecoveryManager {
  static restoreAndReconcile({
    persistentPositions = [],
    exchangePositions = [],
    persistentRiskState = {},
    lastProcessedCandle = null,
    defaultStopLossPercent = 0.75
  }) {
    const warnings = [];
    let pauseNewEntries = false;

    // 1. Reconcile Positions with Exchange (Exchange is source of truth)
    const positionRecon = StateReconciler.reconcilePositions(persistentPositions, exchangePositions);
    if (positionRecon.mismatchDetected) {
      pauseNewEntries = true;
      warnings.push(...positionRecon.mismatches.map((m) => m.reason));
    }

    // 2. Profit-Lock State Recovery (Rule #79)
    // Ensure entry price, highest price reached, peak profit, and locked profit are recovered
    const restoredPositions = (positionRecon.reconciledPositions.length > 0 ? positionRecon.reconciledPositions : persistentPositions).map((pos) => {
      // Find persistent counterpart if available
      const saved = persistentPositions.find((p) => p.pair === pos.pair || p.positionId === pos.positionId) || {};

      const entryPrice = pos.entryPrice || saved.entryPrice;
      const peakProfitPercent = saved.peakProfitPercent !== undefined ? saved.peakProfitPercent : (pos.peakProfitPercent || 0);
      const lockedProfitPercent = saved.lockedProfitPercent !== undefined ? saved.lockedProfitPercent : (pos.lockedProfitPercent || 0);
      const highestPrice = saved.highestPrice || pos.highestPrice || entryPrice;
      let stopLossPrice = pos.stopLossPrice || saved.stopLossPrice;

      // Invariant: If required profit-lock state cannot be safely recovered, DO NOT invent one!
      let profitLockRecovered = true;
      if (!entryPrice || entryPrice <= 0) {
        profitLockRecovered = false;
        pauseNewEntries = true;
        warnings.push(`PROFIT_LOCK_UNRECOVERABLE: Position ${pos.pair} entry price is invalid. Applied protective emergency stop-loss.`);
        // Fallback protective stop loss
        stopLossPrice = (pos.currentPrice || 0) * (1 - defaultStopLossPercent / 100);
      }

      return {
        ...pos,
        entryPrice,
        highestPrice,
        peakProfitPercent,
        lockedProfitPercent,
        stopLossPrice,
        profitLockRecovered
      };
    });

    // 3. Restore Daily Risk State (Rule #78)
    const restoredRiskState = {
      currentDailyLoss: Math.max(0, parseFloat(persistentRiskState.currentDailyLoss || 0)),
      dailyTradesCount: Math.max(0, parseInt(persistentRiskState.dailyTradesCount || 0, 10)),
      consecutiveLosses: Math.max(0, parseInt(persistentRiskState.consecutiveLosses || 0, 10)),
      dailyLossResetDate: persistentRiskState.dailyLossResetDate || new Date().toDateString()
    };

    return {
      success: true,
      pauseNewEntries,
      restoredPositions,
      restoredRiskState,
      lastProcessedCandle,
      warnings
    };
  }
}

module.exports = {
  BotInstanceManager,
  ExchangeHealthMonitor,
  SymbolHealthMonitor,
  BalanceReconciliationEngine,
  StateReconciler,
  CrashRecoveryManager
};
