/**
 * 15-Minute Candle Validation & Duplicate Protection Utility
 * Implements Requirements #31, #32, #41
 * Pure functions + State tracker: No network I/O, fully unit-testable.
 */

const INTERVAL_MS_MAP = {
  '1m': 1 * 60 * 1000,
  '3m': 3 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

/**
 * Normalizes timestamp from ms, seconds or date string to numeric UTC ms
 * @param {number|string|Date} time
 * @returns {number}
 */
function normalizeTimestamp(time) {
  if (typeof time === 'number') {
    // If timestamp is in seconds (e.g. 10 digits instead of 13)
    return time < 1e11 ? time * 1000 : time;
  }
  const parsed = new Date(time).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Validates the structural integrity of a single OHLCV candle.
 * @param {Object} candle - { time, open, high, low, close, volume }
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateCandleStructure(candle) {
  if (!candle || typeof candle !== 'object') {
    return { valid: false, reason: 'Candle object is null or undefined' };
  }

  const time = normalizeTimestamp(candle.time);
  const open = Number(candle.open);
  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);
  const volume = candle.volume !== undefined ? Number(candle.volume) : 0;

  if (!time || time <= 0) {
    return { valid: false, reason: 'Invalid or missing candle timestamp' };
  }

  if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || open <= 0 || high <= 0 || low <= 0 || close <= 0) {
    return { valid: false, reason: 'Candle OHLC prices must be positive numbers' };
  }

  if (isNaN(volume) || volume < 0) {
    return { valid: false, reason: 'Candle volume must be non-negative' };
  }

  if (high < low) {
    return { valid: false, reason: `Malformed candle: high (${high}) is less than low (${low})` };
  }

  if (high < open || high < close) {
    return { valid: false, reason: `Malformed candle: high (${high}) is below open (${open}) or close (${close})` };
  }

  if (low > open || low > close) {
    return { valid: false, reason: `Malformed candle: low (${low}) is above open (${open}) or close (${close})` };
  }

  return { valid: true };
}

/**
 * Filters out the currently forming/incomplete candle and returns only fully closed completed candles.
 * Rule #31: Never use the currently forming candle for a new entry signal.
 *
 * @param {Array<Object>} candles - Array of raw candles from exchange (oldest to newest)
 * @param {string} interval - e.g. '15m'
 * @param {number} [now=Date.now()] - Current timestamp in ms
 * @returns {Array<Object>} Array containing ONLY completed candles
 */
function getCompletedCandles(candles, interval = '15m', now = Date.now()) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return [];
  }

  const intervalMs = INTERVAL_MS_MAP[interval] || 15 * 60 * 1000;

  return candles
    .map((c, idx) => {
      // If candle has no time, assign sequential past timestamps (for testing/mock streams)
      if (!c.time) {
        return {
          ...c,
          time: now - (candles.length - idx) * intervalMs,
        };
      }
      return c;
    })
    .filter((c) => {
      const struct = validateCandleStructure(c);
      if (!struct.valid) return false;

      const openTimeMs = normalizeTimestamp(c.time);
      const closeTimeMs = openTimeMs + intervalMs;

      // Completed candle means close time has already passed
      return closeTimeMs <= now;
    });
}

/**
 * Validates a series of completed candles before indicator calculation.
 * Ensures:
 * 1. Minimum historical depth exists for reliable EMA9, EMA21, RSI14.
 * 2. No invalid or malformed data in series.
 *
 * @param {Array<Object>} candles - Completed candles
 * @param {number} minRequired - e.g. 52 candles
 * @returns {{ valid: boolean, reason?: string, count: number }}
 */
function validateCandleSeries(candles, minRequired = 52) {
  if (!Array.isArray(candles)) {
    return { valid: false, reason: 'Candles must be an array', count: 0 };
  }

  if (candles.length < minRequired) {
    return {
      valid: false,
      reason: `Insufficient historical candles: received ${candles.length}, minimum required is ${minRequired}`,
      count: candles.length,
    };
  }

  for (let i = 0; i < candles.length; i++) {
    const check = validateCandleStructure(candles[i]);
    if (!check.valid) {
      return {
        valid: false,
        reason: `Candle at index ${i} is invalid: ${check.reason}`,
        count: candles.length,
      };
    }
  }

  return { valid: true, count: candles.length };
}

/**
 * Stateful tracker to prevent duplicate trade processing on the exact same completed candle.
 * Implements Rule #41: Store lastProcessedCandleTimestamp and skip if identical.
 */
class CandleTracker {
  constructor() {
    this.lastProcessedCandleTimestamp = null;
    this.lastProcessedCandleTimeStr = null;
  }

  /**
   * Checks if candle can be processed or is a duplicate.
   * Duplicate skipping only blocks when a position is already active/open on this candle.
   * @param {Object} candle - The latest completed candle
   * @param {boolean} [hasOpenPosition=false] - Whether an active position currently exists
   * @returns {{ canProcess: boolean, reason?: string }}
   */
  checkCandle(candle, hasOpenPosition = false) {
    if (!candle) {
      return { canProcess: false, reason: 'Candle is missing' };
    }

    const candleTime = normalizeTimestamp(candle.time);
    if (hasOpenPosition && this.lastProcessedCandleTimestamp !== null && candleTime === this.lastProcessedCandleTimestamp) {
      return {
        canProcess: false,
        reason: `DUPLICATE_CANDLE_SKIPPED: Candle at ${this.lastProcessedCandleTimeStr} was already evaluated`,
        timestamp: candleTime,
      };
    }

    return { canProcess: true, timestamp: candleTime };
  }

  /**
   * Records candle as processed after evaluation
   * @param {Object} candle
   */
  recordProcessed(candle) {
    if (candle) {
      this.lastProcessedCandleTimestamp = normalizeTimestamp(candle.time);
      this.lastProcessedCandleTimeStr = new Date(this.lastProcessedCandleTimestamp).toISOString();
    }
  }

  /**
   * Resets tracker (e.g. On pair change or strategy switch)
   */
  reset() {
    this.lastProcessedCandleTimestamp = null;
    this.lastProcessedCandleTimeStr = null;
  }
}

module.exports = {
  INTERVAL_MS_MAP,
  normalizeTimestamp,
  validateCandleStructure,
  getCompletedCandles,
  validateCandleSeries,
  CandleTracker,
};
