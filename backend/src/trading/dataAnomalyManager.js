/**
 * Market Data Anomaly, Candle Gap & Trading Cooldown Protection Engine
 *
 * Implements Production Requirements:
 * - Rule #80: Data Anomaly Protection (Rejects price <= 0, high < low, close <= 0, invalid volume/timestamp, NaN EMA/RSI)
 * - Rule #81: Candle Gap Detection (Detects missing 15m candles, action: WAIT_FOR_VALID_DATA, no fake candles)
 * - Rule #84: Cooldown After Loss (Configurable cooldown e.g. 15m to prevent revenge trading)
 * - Rule #85: No Martingale / No Recovery Mode (Strictly prevents scaling up or increasing risk after losses)
 */

const { INTERVAL_MS_MAP, normalizeTimestamp } = require('../utils/candleValidator');

/**
 * Rule #80: Data Anomaly Protector
 * Validates market feeds, candle structure, and technical indicators before allowing trading decisions.
 */
class DataAnomalyProtector {
  /**
   * Validates market ticker, candle series, and technical indicators
   * @param {Object} params
   * @param {Object} [params.ticker] - { last_price, bid, ask }
   * @param {Array<Object>} [params.candles] - Array of completed OHLCV candles
   * @param {Object} [params.indicators] - { ema, rsi, fastEma, slowEma }
   * @returns {{ valid: boolean, action: string, reason: string, details?: string }}
   */
  static validateMarketData({ ticker = null, candles = null, indicators = null } = {}) {
    // 1. Ticker price validation
    if (ticker) {
      const price = Number(ticker.last_price);
      if (isNaN(price) || price <= 0) {
        return {
          valid: false,
          action: 'SKIP_CYCLE',
          reason: 'DATA_VALIDATION_FAILED',
          details: `Invalid ticker price: ${ticker.last_price}. Price must be greater than zero.`
        };
      }
    }

    // 2. Candle series validation
    if (Array.isArray(candles) && candles.length > 0) {
      let previousTime = null;

      for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        if (!c || typeof c !== 'object') {
          return {
            valid: false,
            action: 'SKIP_CYCLE',
            reason: 'DATA_VALIDATION_FAILED',
            details: `Candle at index ${i} is null or malformed.`
          };
        }

        const open = Number(c.open);
        const high = Number(c.high);
        const low = Number(c.low);
        const close = Number(c.close);
        const volume = Number(c.volume !== undefined ? c.volume : 0);
        const time = normalizeTimestamp(c.time);

        // Price <= 0 or NaN checks
        if (isNaN(open) || open <= 0 || isNaN(high) || high <= 0 || isNaN(low) || low <= 0 || isNaN(close) || close <= 0) {
          return {
            valid: false,
            action: 'SKIP_CYCLE',
            reason: 'DATA_VALIDATION_FAILED',
            details: `Candle at index ${i} has non-positive or NaN price (O: ${open}, H: ${high}, L: ${low}, C: ${close}).`
          };
        }

        // High < Low check
        if (high < low) {
          return {
            valid: false,
            action: 'SKIP_CYCLE',
            reason: 'DATA_VALIDATION_FAILED',
            details: `Candle at index ${i} has High (${high}) < Low (${low}).`
          };
        }

        // High < Open or Close check
        if (high < open || high < close) {
          return {
            valid: false,
            action: 'SKIP_CYCLE',
            reason: 'DATA_VALIDATION_FAILED',
            details: `Candle at index ${i} has High (${high}) lower than Open (${open}) or Close (${close}).`
          };
        }

        // Low > Open or Close check
        if (low > open || low > close) {
          return {
            valid: false,
            action: 'SKIP_CYCLE',
            reason: 'DATA_VALIDATION_FAILED',
            details: `Candle at index ${i} has Low (${low}) higher than Open (${open}) or Close (${close}).`
          };
        }

        // Volume check
        if (isNaN(volume) || volume < 0) {
          return {
            valid: false,
            action: 'SKIP_CYCLE',
            reason: 'DATA_VALIDATION_FAILED',
            details: `Candle at index ${i} has invalid volume: ${volume}.`
          };
        }

        // Timestamp check
        if (!time || isNaN(time) || time <= 0) {
          return {
            valid: false,
            action: 'SKIP_CYCLE',
            reason: 'DATA_VALIDATION_FAILED',
            details: `Candle at index ${i} has invalid timestamp: ${c.time}.`
          };
        }

        // Monotonic order & duplicate check
        if (previousTime !== null) {
          if (time === previousTime) {
            return {
              valid: false,
              action: 'SKIP_CYCLE',
              reason: 'DATA_VALIDATION_FAILED',
              details: `Duplicate candle detected with timestamp ${new Date(time).toISOString()}.`
            };
          }
          if (time < previousTime) {
            return {
              valid: false,
              action: 'SKIP_CYCLE',
              reason: 'DATA_VALIDATION_FAILED',
              details: `Candle timestamps out of sequence: ${new Date(time).toISOString()} came after ${new Date(previousTime).toISOString()}.`
            };
          }
        }
        previousTime = time;
      }
    }

    // 3. Technical Indicator validation (EMA & RSI NaN Protection)
    if (indicators) {
      if (indicators.ema !== undefined && (isNaN(indicators.ema) || indicators.ema === null)) {
        return {
          valid: false,
          action: 'SKIP_CYCLE',
          reason: 'DATA_VALIDATION_FAILED',
          details: 'Technical indicator EMA is NaN or null.'
        };
      }
      if (indicators.fastEma !== undefined && (isNaN(indicators.fastEma) || indicators.fastEma === null)) {
        return {
          valid: false,
          action: 'SKIP_CYCLE',
          reason: 'DATA_VALIDATION_FAILED',
          details: 'Technical indicator Fast EMA is NaN or null.'
        };
      }
      if (indicators.slowEma !== undefined && (isNaN(indicators.slowEma) || indicators.slowEma === null)) {
        return {
          valid: false,
          action: 'SKIP_CYCLE',
          reason: 'DATA_VALIDATION_FAILED',
          details: 'Technical indicator Slow EMA is NaN or null.'
        };
      }
      if (indicators.rsi !== undefined && (isNaN(indicators.rsi) || indicators.rsi === null)) {
        return {
          valid: false,
          action: 'SKIP_CYCLE',
          reason: 'DATA_VALIDATION_FAILED',
          details: 'Technical indicator RSI is NaN or null.'
        };
      }
    }

    return {
      valid: true,
      action: 'PROCEED',
      reason: 'NONE'
    };
  }
}

/**
 * Rule #81: Candle Gap Detector
 * Detects missing candles in expected intervals (e.g. 10:00 -> 10:15 -> 10:45 with 10:30 missing).
 * Pauses signal generation until valid continuous data arrives.
 */
class CandleGapDetector {
  /**
   * Scans a series of candles for missing timestamps
   * @param {Array<Object>} candles - Completed candles in chronological order
   * @param {string} interval - e.g. '15m', '1m', '5m'
   * @returns {{ hasGap: boolean, action: string, gaps: Array<Object>, reason?: string }}
   */
  static detectGaps(candles, interval = '15m') {
    if (!Array.isArray(candles) || candles.length < 2) {
      return { hasGap: false, action: 'PROCEED', gaps: [] };
    }

    const intervalMs = INTERVAL_MS_MAP[interval] || 15 * 60 * 1000;
    const gaps = [];

    for (let i = 1; i < candles.length; i++) {
      const prevTime = normalizeTimestamp(candles[i - 1].time);
      const currTime = normalizeTimestamp(candles[i].time);

      const delta = currTime - prevTime;

      // If difference exceeds standard interval (allow 10% drift tolerance for clock skew)
      if (delta > intervalMs * 1.1) {
        const expectedNext = prevTime + intervalMs;
        const missingCount = Math.round(delta / intervalMs) - 1;

        gaps.push({
          fromIndex: i - 1,
          toIndex: i,
          previousTimestamp: prevTime,
          currentTimestamp: currTime,
          expectedTimestamp: expectedNext,
          missingCount,
          timeFormatted: `${new Date(prevTime).toISOString()} -> ${new Date(currTime).toISOString()}`
        });
      }
    }

    if (gaps.length > 0) {
      const first = gaps[0];
      return {
        hasGap: true,
        action: 'WAIT_FOR_VALID_DATA',
        gaps,
        reason: `Candle gap detected: ${first.missingCount} missing candle(s) between ${first.timeFormatted}. Expected ${new Date(first.expectedTimestamp).toISOString()}.`
      };
    }

    return {
      hasGap: false,
      action: 'PROCEED',
      gaps: []
    };
  }
}

/**
 * Rule #84: Loss Cooldown Manager
 * Enforces a pause after any losing trade to avoid revenge trading.
 */
class LossCooldownManager {
  constructor(options = {}) {
    this.cooldownMinutes = options.cooldownMinutes !== undefined ? parseInt(options.cooldownMinutes, 10) : 15;
    this.lastLossTimestamp = options.lastLossTimestamp || 0;
  }

  recordLoss(timestamp = Date.now()) {
    this.lastLossTimestamp = timestamp;
  }

  isCooldownActive(now = Date.now()) {
    if (!this.lastLossTimestamp || this.lastLossTimestamp <= 0) {
      return { active: false, remainingSeconds: 0 };
    }

    const elapsedMs = now - this.lastLossTimestamp;
    const cooldownMs = this.cooldownMinutes * 60 * 1000;

    if (elapsedMs < cooldownMs) {
      const remainingSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
      return {
        active: true,
        remainingSeconds,
        remainingMinutes: (remainingSeconds / 60).toFixed(1),
        reason: `Loss cooldown active: ${remainingSeconds}s remaining (${this.cooldownMinutes}m cooldown). Revenge trading prohibited.`
      };
    }

    return { active: false, remainingSeconds: 0 };
  }

  reset() {
    this.lastLossTimestamp = 0;
  }
}

/**
 * Rule #85: Anti-Martingale Validator
 * Guarantees that position size and risk are NEVER increased after a loss.
 */
class AntiMartingaleValidator {
  /**
   * Validates that planned trade does not violate non-martingale principles
   * @param {Object} params
   * @param {number} params.plannedQuantity - Sized quantity for upcoming trade
   * @param {number} params.previousQuantity - Quantity of previous trade
   * @param {number} params.previousTradePnL - Realized PnL of previous trade
   * @param {number} params.plannedRiskPercent - Planned risk (e.g. 0.005)
   * @param {number} [params.maxRiskCeiling=0.005] - Maximum permitted risk ceiling (0.5%)
   * @returns {{ valid: boolean, reason?: string }}
   */
  static validateTradeIndependence({
    plannedQuantity,
    previousQuantity = 0,
    previousTradePnL = null,
    plannedRiskPercent = 0.005,
    maxRiskCeiling = 0.005
  }) {
    // 1. Strict risk ceiling check
    if (plannedRiskPercent > maxRiskCeiling * 1.001) {
      return {
        valid: false,
        reason: `ANTI_MARTINGALE_VIOLATION: Planned risk (${(plannedRiskPercent * 100).toFixed(2)}%) exceeds configured ceiling (${(maxRiskCeiling * 100).toFixed(2)}%). Risk expansion is prohibited.`
      };
    }

    // 2. Anti-Doubling / Anti-Revenge Scaling Check
    if (previousTradePnL !== null && previousTradePnL < 0 && previousQuantity > 0) {
      // If previous trade was a loss, quantity must NEVER double or scale up (allow 3% rounding tolerance)
      if (plannedQuantity > previousQuantity * 1.03) {
        return {
          valid: false,
          reason: `ANTI_MARTINGALE_VIOLATION: Position sizing scaled up from previous losing trade (${previousQuantity} -> ${plannedQuantity}). Doubling or increasing size after loss is strictly prohibited.`
        };
      }
    }

    return { valid: true };
  }
}

module.exports = {
  DataAnomalyProtector,
  CandleGapDetector,
  LossCooldownManager,
  AntiMartingaleValidator
};
