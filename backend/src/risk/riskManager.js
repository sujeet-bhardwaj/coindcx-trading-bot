const config = require('../config/env');

class RiskManager {
  constructor(options = {}) {
    this.botEnabled = options.botEnabled !== undefined ? options.botEnabled : false;
    this.emergencyStop = options.emergencyStop !== undefined ? options.emergencyStop : false;
    this.tradingMode = options.tradingMode || config.tradingMode || 'PAPER_TRADING';

    // Configurable Risk Controls
    this.leverage = options.leverage !== undefined ? parseInt(options.leverage, 10) : (config.defaultLeverage || 1);
    this.maxTradeAmount = options.maxTradeAmount || config.maxTradeAmount || 50;
    this.maxDailyLoss = options.maxDailyLoss || config.maxDailyLoss || 100;
    this.maxOpenPositions = options.maxOpenPositions || config.maxOpenPositions || 1;
    this.stopLossPercent = options.stopLossPercent || config.stopLossPercent || 2.0;
    this.takeProfitPercent = options.takeProfitPercent || config.takeProfitPercent || 4.0;
    this.trailingActivationPercent = options.trailingActivationPercent || config.trailingActivationPercent || 3.5;
    this.trailingGivebackPercent = options.trailingGivebackPercent || config.trailingGivebackPercent || 0.3;
    this.breakevenTriggerPercent = options.breakevenTriggerPercent || config.breakevenTriggerPercent || 1.0;
    this.cooldownSeconds = options.cooldownSeconds || config.cooldownSeconds || 60;

    // Tracking State
    this.currentDailyLoss = 0;
    this.dailyLossResetDate = new Date().toDateString();
    this.lastTradeTime = 0;
  }

  _checkDailyReset() {
    const today = new Date().toDateString();
    if (this.dailyLossResetDate !== today) {
      this.currentDailyLoss = 0;
      this.dailyLossResetDate = today;
    }
  }

  /**
   * Comprehensive pre-trade risk evaluation.
   * Every single order must pass this pipeline before execution.
   */
  validateOrderPreCheck({
    pair,
    side, // 'buy' | 'sell'
    amountQuote = null, // Value in USDT/INR
    quantity = null, // Quantity of crypto
    currentPrice = null,
    marketDetails = null,
    openPositionsCount = 0,
    overrideBotDisabled = false, // Allowed only when emergency closing or user manual sell
    strategy = null,
    leverage = null,
  }) {
    this._checkDailyReset();

    // 0. Leverage Range Check
    const effectiveLeverage = leverage !== null && leverage !== undefined ? parseInt(leverage, 10) : this.leverage;
    if (isNaN(effectiveLeverage) || effectiveLeverage < 1 || effectiveLeverage > 100) {
      return {
        passed: false,
        reason: `Leverage must be between 1x and 100x (provided: ${effectiveLeverage}x).`,
        rule: 'LEVERAGE_RANGE_CHECK',
      };
    }

    // 1. Emergency Stop Check (Highest Priority Global Halt)
    if (this.emergencyStop) {
      return {
        passed: false,
        reason: 'EMERGENCY STOP is currently ACTIVE. All order creation is frozen.',
        rule: 'EMERGENCY_STOP_CHECK',
      };
    }

    // 2. Bot Enabled Check
    if (!this.botEnabled && !overrideBotDisabled) {
      return {
        passed: false,
        reason: 'Bot is currently STOPPED. Order creation blocked.',
        rule: 'BOT_ENABLED_CHECK',
      };
    }

    // 3. Trading Mode Check
    if (this.tradingMode !== 'PAPER_TRADING' && this.tradingMode !== 'LIVE_TRADING') {
      return {
        passed: false,
        reason: `Invalid trading mode: ${this.tradingMode}. Must be PAPER_TRADING or LIVE_TRADING.`,
        rule: 'TRADING_MODE_CHECK',
      };
    }

    // 4. Daily Loss Limit Check
    if (this.currentDailyLoss >= this.maxDailyLoss) {
      return {
        passed: false,
        reason: `Daily loss limit reached: Current loss $${this.currentDailyLoss.toFixed(2)} >= Maximum allowed $${this.maxDailyLoss.toFixed(2)}. Trading suspended for today.`,
        rule: 'MAX_DAILY_LOSS_CHECK',
      };
    }

    // Checks specific to opening NEW positions (BUY)
    if (side === 'buy') {
      // 5. Maximum Trade Amount Check (accommodates exchange discrete minimum lot sizes)
      const minNotional = marketDetails?.min_notional || 100;
      const allowedMaxTrade = Math.max(this.maxTradeAmount, minNotional * 2);
      if (amountQuote !== null && amountQuote > allowedMaxTrade) {
        return {
          passed: false,
          reason: `Requested trade amount ($${amountQuote.toFixed(2)}) exceeds maximum allowed limit ($${this.maxTradeAmount.toFixed(2)}).`,
          rule: 'MAX_TRADE_AMOUNT_CHECK',
        };
      }

      // 6. Maximum Open Positions Check
      if (openPositionsCount >= this.maxOpenPositions) {
        return {
          passed: false,
          reason: `Maximum concurrent open positions reached (${openPositionsCount} >= ${this.maxOpenPositions}). Cannot open new position.`,
          rule: 'MAX_OPEN_POSITIONS_CHECK',
        };
      }

      // 7. Cooldown Check between trades
      const isCycleFast = strategy === 'SCALPER_3M' || strategy === 'SCALPER_15M' || strategy === 'EMA_RSI';
      const effectiveCooldown = isCycleFast ? 5 : this.cooldownSeconds;
      const now = Date.now();
      const elapsedSinceLastTrade = (now - this.lastTradeTime) / 1000;
      if (this.lastTradeTime > 0 && elapsedSinceLastTrade < effectiveCooldown) {
        const remaining = Math.ceil(effectiveCooldown - elapsedSinceLastTrade);
        return {
          passed: false,
          reason: `Trade cooldown active. Please wait ${remaining} more seconds before opening a new trade.`,
          rule: 'COOLDOWN_CHECK',
        };
      }
    }

    // 8. Market Availability & Status Check
    if (marketDetails) {
      if (marketDetails.status && marketDetails.status.toLowerCase() !== 'active') {
        return {
          passed: false,
          reason: `Market pair ${pair} is not active (status: ${marketDetails.status}).`,
          rule: 'MARKET_STATUS_CHECK',
        };
      }

      // 9. Minimum Order Quantity & Notional Checks (Strict on LIVE, flexible on PAPER)
      const effectiveQty = quantity !== null ? quantity : (amountQuote && currentPrice ? amountQuote / currentPrice : null);
      if (effectiveQty !== null && effectiveQty <= 0) {
        return {
          passed: false,
          reason: 'Calculated order quantity must be greater than zero.',
          rule: 'MIN_QUANTITY_CHECK',
        };
      }

      if (effectiveQty !== null && marketDetails.min_quantity !== undefined) {
        if (effectiveQty < marketDetails.min_quantity) {
          return {
            passed: false,
            reason: `Order quantity (${effectiveQty.toFixed(6)}) is below market minimum (${marketDetails.min_quantity}).`,
            rule: 'MIN_QUANTITY_CHECK',
          };
        }
      }

      const effectiveNotional = effectiveQty && currentPrice ? effectiveQty * currentPrice : amountQuote;
      if (effectiveNotional !== null && marketDetails.min_notional !== undefined) {
        if (effectiveNotional < marketDetails.min_notional) {
          return {
            passed: false,
            reason: `Order value ($${effectiveNotional.toFixed(2)}) is below exchange minimum notional requirement ($${marketDetails.min_notional}).`,
            rule: 'MIN_NOTIONAL_CHECK',
          };
        }
      }
    }

    // All Risk Checks Passed
    return {
      passed: true,
      reason: 'All pre-trade risk checks passed successfully.',
      rule: 'NONE',
    };
  }

  setBotEnabled(enabled) {
    this.botEnabled = Boolean(enabled);
  }

  triggerEmergencyStop() {
    this.emergencyStop = true;
    this.botEnabled = false;
  }

  resetEmergencyStop() {
    this.emergencyStop = false;
  }

  recordTradeExecution(timestamp = Date.now()) {
    this.lastTradeTime = timestamp;
  }

  recordRealizedPnL(pnl) {
    this._checkDailyReset();
    if (pnl < 0) {
      this.currentDailyLoss += Math.abs(pnl);
    }
  }

  calculateLiquidationPrice(entryPrice, leverage = 1, side = 'buy') {
    const lev = Math.max(1, parseInt(leverage, 10) || 1);
    if (lev <= 1 || !entryPrice) return null;
    const maintenanceMargin = 0.05; // 5% maintenance margin requirement
    if (side === 'buy') {
      return entryPrice * (1 - (1 / lev) * (1 - maintenanceMargin));
    } else {
      return entryPrice * (1 + (1 / lev) * (1 - maintenanceMargin));
    }
  }

  updateLimits(limits = {}) {
    if (limits.leverage !== undefined) {
      const lev = parseInt(limits.leverage, 10);
      if (!isNaN(lev) && lev >= 1 && lev <= 100) this.leverage = lev;
    }
    if (limits.maxTradeAmount !== undefined) this.maxTradeAmount = parseFloat(limits.maxTradeAmount);
    if (limits.maxDailyLoss !== undefined) this.maxDailyLoss = parseFloat(limits.maxDailyLoss);
    if (limits.maxOpenPositions !== undefined) this.maxOpenPositions = parseInt(limits.maxOpenPositions, 10);
    if (limits.stopLossPercent !== undefined) this.stopLossPercent = parseFloat(limits.stopLossPercent);
    if (limits.takeProfitPercent !== undefined) this.takeProfitPercent = parseFloat(limits.takeProfitPercent);
    if (limits.trailingActivationPercent !== undefined) this.trailingActivationPercent = parseFloat(limits.trailingActivationPercent);
    if (limits.trailingGivebackPercent !== undefined) this.trailingGivebackPercent = parseFloat(limits.trailingGivebackPercent);
    if (limits.breakevenTriggerPercent !== undefined) this.breakevenTriggerPercent = parseFloat(limits.breakevenTriggerPercent);
    if (limits.cooldownSeconds !== undefined) this.cooldownSeconds = parseInt(limits.cooldownSeconds, 10);
  }

  getRiskSummary() {
    this._checkDailyReset();
    return {
      botEnabled: this.botEnabled,
      emergencyStop: this.emergencyStop,
      tradingMode: this.tradingMode,
      leverage: this.leverage,
      maxTradeAmount: this.maxTradeAmount,
      maxDailyLoss: this.maxDailyLoss,
      currentDailyLoss: this.currentDailyLoss,
      maxOpenPositions: this.maxOpenPositions,
      stopLossPercent: this.stopLossPercent,
      takeProfitPercent: this.takeProfitPercent,
      trailingActivationPercent: this.trailingActivationPercent,
      trailingGivebackPercent: this.trailingGivebackPercent,
      breakevenTriggerPercent: this.breakevenTriggerPercent,
      cooldownSeconds: this.cooldownSeconds,
      lastTradeTime: this.lastTradeTime,
    };
  }
}

// Singleton for application use
const defaultRiskManager = new RiskManager();

module.exports = {
  RiskManager,
  riskManager: defaultRiskManager,
};
