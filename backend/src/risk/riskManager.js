const config = require('../config/env');
const { calculatePositionSize } = require('./positionSizer');
const { runComprehensivePreTradeValidation } = require('./preTradeValidator');
const { AntiMartingaleValidator } = require('../trading/dataAnomalyManager');

class RiskManager {
  constructor(options = {}) {
    this.botEnabled = options.botEnabled !== undefined ? options.botEnabled : false;
    this.emergencyStop = options.emergencyStop !== undefined ? options.emergencyStop : false;
    this.tradingMode = options.tradingMode || config.tradingMode || 'PAPER_TRADING';

    // Configurable Risk Controls
    this.leverage = options.leverage !== undefined ? parseInt(options.leverage, 10) : (config.defaultLeverage || 1);
    this.maxTradeAmount = options.maxTradeAmount || config.maxTradeAmount || 50;
    this.riskPerTrade = options.riskPerTrade !== undefined ? parseFloat(options.riskPerTrade) : (config.riskPerTrade || 0.005); // 0.5% Capital Risk
    this.maxAccountExposure = options.maxAccountExposure !== undefined ? parseFloat(options.maxAccountExposure) : (config.maxAccountExposure || 1.0);
    this.maxDailyLoss = options.maxDailyLoss || config.maxDailyLoss || 100;
    this.maxOpenPositions = options.maxOpenPositions !== undefined ? parseInt(options.maxOpenPositions, 10) : (config.maxOpenPositions || 1);

    // Consecutive Losses & Daily Trade Limits (Rules #15, #16, #17, #83)
    this.consecutiveLosses = options.consecutiveLosses !== undefined ? parseInt(options.consecutiveLosses, 10) : 0;
    this.maxConsecutiveLosses = options.maxConsecutiveLosses !== undefined ? parseInt(options.maxConsecutiveLosses, 10) : 3;
    this.consecutiveLossPause = options.consecutiveLossPause !== undefined ? Boolean(options.consecutiveLossPause) : false;
    this.dailyTradesCount = options.dailyTradesCount !== undefined ? parseInt(options.dailyTradesCount, 10) : 0;
    this.maxDailyTrades = options.maxDailyTrades !== undefined ? parseInt(options.maxDailyTrades, 10) : 10;

    // Loss Cooldown & Anti-Martingale Parameters (Rules #84, #85)
    this.lossCooldownMinutes = options.lossCooldownMinutes !== undefined
      ? parseInt(options.lossCooldownMinutes, 10)
      : (config.lossCooldownMinutes !== undefined
          ? parseInt(config.lossCooldownMinutes, 10)
          : (this.tradingMode === 'PAPER_TRADING' ? 0 : 1));
    this.lastLossTime = options.lastLossTime || 0;
    this.previousTradeQuantity = options.previousTradeQuantity || 0;
    this.lastRealizedTradePnL = null;

    // Safety Firewall Parameters (Rules #33, #34, #35, #36, #37, #38, #50)
    this.maxPriceAgeMs = options.maxPriceAgeMs !== undefined ? parseInt(options.maxPriceAgeMs, 10) : 5000;
    this.maxPriceMovePercent = options.maxPriceMovePercent !== undefined ? parseFloat(options.maxPriceMovePercent) : 3.0;
    this.maxAllowedSpread = options.maxAllowedSpread !== undefined ? parseFloat(options.maxAllowedSpread) : 0.25;
    this.maxAllowedSlippage = options.maxAllowedSlippage !== undefined ? parseFloat(options.maxAllowedSlippage) : 0.15;
    this.maxPositionToLiquidityRatio = options.maxPositionToLiquidityRatio !== undefined ? parseFloat(options.maxPositionToLiquidityRatio) : 0.05;
    this.maxAllowedVolatility = options.maxAllowedVolatility !== undefined ? parseFloat(options.maxAllowedVolatility) : 5.0;

    // Unified Exit Engine Controls
    this.maxLossPercent = options.maxLossPercent !== undefined
      ? parseFloat(options.maxLossPercent)
      : (options.stopLossPercent !== undefined ? parseFloat(options.stopLossPercent) : (config.maxLossPercent || 0.75));
    this.profitLockLevels = options.profitLockLevels || config.profitLockLevels || '1.8,3,5,7,9,11,13,15';
    this.profitLockStepAfterLast = options.profitLockStepAfterLast !== undefined
      ? parseFloat(options.profitLockStepAfterLast)
      : (config.profitLockStepAfterLast || 1);
    this.lockBufferPercent = options.lockBufferPercent !== undefined
      ? parseFloat(options.lockBufferPercent)
      : (config.lockBufferPercent || 0);
    this.breakevenTriggerPercent = options.breakevenTriggerPercent !== undefined
      ? parseFloat(options.breakevenTriggerPercent)
      : (config.breakevenTriggerPercent || 2.5);
    this.feeDeductionPercent = options.feeDeductionPercent !== undefined
      ? parseFloat(options.feeDeductionPercent)
      : (config.feeDeductionPercent !== undefined ? parseFloat(config.feeDeductionPercent) : 1.5);
    this.feeAware = options.feeAware !== undefined
      ? Boolean(options.feeAware)
      : (config.feeAware !== undefined ? Boolean(config.feeAware) : true);

    this.cooldownSeconds = options.cooldownSeconds || config.cooldownSeconds || 60;

    // Tracking State (Rule #82: Defined in UTC)
    this.currentDailyLoss = 0;
    this.dailyLossResetDateUtc = new Date().toISOString().slice(0, 10);
    this.dailyLossResetDate = this.dailyLossResetDateUtc;
    this.lastTradeTime = 0;
  }

  /**
   * Rule #82: Daily Risk Reset at 00:00:00 UTC
   * Resets daily P&L and daily trade count.
   * INVARIANT: Never resets emergencyStop, manual pause, or consecutiveLossPause!
   */
  _checkDailyReset() {
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (this.dailyLossResetDateUtc !== todayUtc) {
      this.currentDailyLoss = 0;
      this.dailyTradesCount = 0;
      this.dailyLossResetDateUtc = todayUtc;
      this.dailyLossResetDate = todayUtc;
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
    priceTimestamp = null,
    referencePrice = null,
    latestCandle = null,
    bid = null,
    ask = null,
    orderBook = null,
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

    // 4b. Consecutive Loss Pause Check (Rule #83)
    if (this.consecutiveLossPause || this.consecutiveLosses >= this.maxConsecutiveLosses) {
      return {
        passed: false,
        reason: `Consecutive loss limit reached (${this.consecutiveLosses} losses). Trading paused. Manual reset required.`,
        rule: 'CONSECUTIVE_LOSS_LIMIT_CHECK',
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

      // 7. General Cooldown Check between trades
      const isCycleFast = strategy === 'SCALPER_3M' || strategy === 'SCALPER_15M' || strategy === 'EMA_RSI' || strategy === 'TREND_4H' || this.tradingMode === 'PAPER_TRADING';
      const effectiveCooldown = isCycleFast ? 5 : Math.min(this.cooldownSeconds, 30);
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

      // 7b. Loss Cooldown Check (Rule #84: Only active in LIVE_TRADING when lossCooldownMinutes > 0)
      if (this.tradingMode === 'LIVE_TRADING' && this.lossCooldownMinutes > 0 && this.lastLossTime > 0) {
        const elapsedSinceLossSec = (now - this.lastLossTime) / 1000;
        const lossCooldownSec = this.lossCooldownMinutes * 60;
        if (elapsedSinceLossSec < lossCooldownSec) {
          const remainingSec = Math.ceil(lossCooldownSec - elapsedSinceLossSec);
          return {
            passed: false,
            reason: `Loss cooldown active: ${remainingSec}s remaining (${this.lossCooldownMinutes}m cooldown). Revenge trading prohibited.`,
            rule: 'LOSS_COOLDOWN_CHECK',
          };
        }
      }

      // 7c. Anti-Martingale & Non-Recovery Verification (Rule #85)
      const effectiveQty = quantity !== null ? quantity : (amountQuote && currentPrice ? amountQuote / currentPrice : null);
      if (effectiveQty !== null && this.previousTradeQuantity > 0 && this.lastRealizedTradePnL !== null && this.lastRealizedTradePnL < 0) {
        const antiMartingale = AntiMartingaleValidator.validateTradeIndependence({
          plannedQuantity: effectiveQty,
          previousQuantity: this.previousTradeQuantity,
          previousTradePnL: this.lastRealizedTradePnL,
          plannedRiskPercent: this.riskPerTrade,
          maxRiskCeiling: 0.005,
        });
        if (!antiMartingale.valid) {
          return {
            passed: false,
            reason: antiMartingale.reason,
            rule: 'ANTI_MARTINGALE_CHECK',
          };
        }
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

    // 10. Pre-Trade Safety Firewall (Rules #33, #34, #35, #36, #37, #38, #50)
    if (side === 'buy') {
      const effectiveQty = quantity !== null ? quantity : (amountQuote && currentPrice ? amountQuote / currentPrice : null);
      const firewallCheck = runComprehensivePreTradeValidation({
        currentPrice,
        priceTimestamp,
        maxPriceAgeMs: this.maxPriceAgeMs,
        referencePrice,
        maxPriceMovePercent: this.maxPriceMovePercent,
        latestCandle,
        maxAllowedVolatility: this.maxAllowedVolatility,
        bid,
        ask,
        maxAllowedSpread: this.maxAllowedSpread,
        quantity: effectiveQty,
        orderBook,
        side,
        maxAllowedSlippage: this.maxAllowedSlippage,
        maxPositionToLiquidityRatio: this.maxPositionToLiquidityRatio,
        consecutiveLosses: this.consecutiveLosses,
        maxConsecutiveLosses: this.maxConsecutiveLosses,
        dailyTradesCount: this.dailyTradesCount,
        maxDailyTrades: this.maxDailyTrades,
      });

      if (!firewallCheck.passed) {
        return firewallCheck;
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
    this._checkDailyReset();
    this.lastTradeTime = timestamp;
    this.dailyTradesCount += 1;
  }

  recordRealizedPnL(pnl, quantity = 0) {
    this._checkDailyReset();
    this.lastRealizedTradePnL = pnl;
    if (quantity > 0) {
      this.previousTradeQuantity = quantity;
    }
    if (pnl < 0) {
      this.currentDailyLoss += Math.abs(pnl);
      this.consecutiveLosses += 1;
      this.lastLossTime = Date.now();
      if (this.consecutiveLosses >= this.maxConsecutiveLosses) {
        this.consecutiveLossPause = true;
      }
    } else if (pnl > 0) {
      this.consecutiveLosses = 0; // Winning trade resets consecutive losses counter
    }
  }

  resetConsecutiveLosses() {
    this.consecutiveLosses = 0;
    this.consecutiveLossPause = false;
  }

  resetConsecutiveLossPause() {
    this.consecutiveLossPause = false;
    this.consecutiveLosses = 0;
  }

  resetLossCooldown() {
    this.lastLossTime = 0;
  }

  resetTradeCooldown() {
    this.lastTradeTime = 0;
    this.lastLossTime = 0;
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

  // Legacy compatibility getters & setters
  get stopLossPercent() {
    return this.maxLossPercent;
  }
  set stopLossPercent(val) {
    this.maxLossPercent = parseFloat(val);
  }
  get takeProfitPercent() {
    return 0;
  }
  set takeProfitPercent(val) {}
  get trailingActivationPercent() {
    return 0.5;
  }
  set trailingActivationPercent(val) {}
  get trailingGivebackPercent() {
    return this.lockBufferPercent;
  }
  set trailingGivebackPercent(val) {
    this.lockBufferPercent = parseFloat(val);
  }

  updateLimits(limits = {}) {
    if (limits.leverage !== undefined) {
      const lev = parseInt(limits.leverage, 10);
      if (!isNaN(lev) && lev >= 1 && lev <= 100) this.leverage = lev;
    }
    if (limits.maxTradeAmount !== undefined) this.maxTradeAmount = parseFloat(limits.maxTradeAmount);
    if (limits.maxDailyLoss !== undefined) this.maxDailyLoss = parseFloat(limits.maxDailyLoss);
    if (limits.maxOpenPositions !== undefined) this.maxOpenPositions = parseInt(limits.maxOpenPositions, 10);

    // Unified Exit Engine limits
    if (limits.maxLossPercent !== undefined) this.maxLossPercent = parseFloat(limits.maxLossPercent);
    else if (limits.stopLossPercent !== undefined) this.maxLossPercent = parseFloat(limits.stopLossPercent);

    if (limits.profitLockLevels !== undefined) this.profitLockLevels = limits.profitLockLevels;
    if (limits.riskPerTrade !== undefined) this.riskPerTrade = parseFloat(limits.riskPerTrade);
    if (limits.maxAccountExposure !== undefined) this.maxAccountExposure = parseFloat(limits.maxAccountExposure);
    if (limits.profitLockStepAfterLast !== undefined) this.profitLockStepAfterLast = parseFloat(limits.profitLockStepAfterLast);
    if (limits.lockBufferPercent !== undefined) this.lockBufferPercent = parseFloat(limits.lockBufferPercent);
    if (limits.breakevenTriggerPercent !== undefined) this.breakevenTriggerPercent = parseFloat(limits.breakevenTriggerPercent);
    if (limits.feeDeductionPercent !== undefined) this.feeDeductionPercent = parseFloat(limits.feeDeductionPercent);
    if (limits.feeAware !== undefined) this.feeAware = Boolean(limits.feeAware);

    if (limits.consecutiveLosses !== undefined) this.consecutiveLosses = parseInt(limits.consecutiveLosses, 10);
    if (limits.maxConsecutiveLosses !== undefined) this.maxConsecutiveLosses = parseInt(limits.maxConsecutiveLosses, 10);
    if (limits.dailyTradesCount !== undefined) this.dailyTradesCount = parseInt(limits.dailyTradesCount, 10);
    if (limits.maxDailyTrades !== undefined) this.maxDailyTrades = parseInt(limits.maxDailyTrades, 10);

    if (limits.cooldownSeconds !== undefined) this.cooldownSeconds = parseInt(limits.cooldownSeconds, 10);
  }

  /**
   * Delegates position sizing to strict 0.5% capital risk engine
   */
  calculatePositionSize(params = {}) {
    return calculatePositionSize({
      riskPerTrade: this.riskPerTrade,
      maxAccountExposure: this.maxAccountExposure,
      maxPositionSize: this.maxTradeAmount,
      ...params,
    });
  }

  getRiskSummary() {
    this._checkDailyReset();
    return {
      botEnabled: this.botEnabled,
      emergencyStop: this.emergencyStop,
      tradingMode: this.tradingMode,
      leverage: this.leverage,
      maxTradeAmount: this.maxTradeAmount,
      riskPerTrade: this.riskPerTrade,
      maxAccountExposure: this.maxAccountExposure,
      maxDailyLoss: this.maxDailyLoss,
      currentDailyLoss: this.currentDailyLoss,
      consecutiveLosses: this.consecutiveLosses,
      maxConsecutiveLosses: this.maxConsecutiveLosses,
      dailyTradesCount: this.dailyTradesCount,
      maxDailyTrades: this.maxDailyTrades,
      maxOpenPositions: this.maxOpenPositions,
      maxLossPercent: this.maxLossPercent,
      profitLockLevels: this.profitLockLevels,
      profitLockStepAfterLast: this.profitLockStepAfterLast,
      lockBufferPercent: this.lockBufferPercent,
      breakevenTriggerPercent: this.breakevenTriggerPercent,
      // Legacy mapped keys
      stopLossPercent: this.maxLossPercent,
      takeProfitPercent: 0,
      trailingActivationPercent: 0.5,
      trailingGivebackPercent: this.lockBufferPercent,
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
