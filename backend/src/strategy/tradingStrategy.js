/**
 * Technical Indicator Utilities & Modular Trading Strategy Engine
 */

/**
 * Calculates Exponential Moving Average (EMA) array for a series of numbers
 * @param {number[]} values - Array of numeric close prices
 * @param {number} period - Number of periods (e.g. 20 or 50)
 * @returns {number[]} Array of EMA values matching the length of values (null until period)
 */
function calculateEMA(values, period) {
  if (!values || values.length < period) {
    return [];
  }

  const k = 2 / (period + 1);
  const emaArray = new Array(values.length).fill(null);

  // Initial SMA for the first `period` values
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  let prevEma = sum / period;
  emaArray[period - 1] = prevEma;

  // Compute subsequent EMAs
  for (let i = period; i < values.length; i++) {
    const currentEma = values[i] * k + prevEma * (1 - k);
    emaArray[i] = currentEma;
    prevEma = currentEma;
  }

  return emaArray;
}

/**
 * Calculates Relative Strength Index (RSI) using Wilder's Smoothing method
 * @param {number[]} values - Array of close prices
 * @param {number} period - RSI lookback period (e.g. 14)
 * @returns {number[]} Array of RSI values between 0 and 100
 */
function calculateRSI(values, period = 14) {
  if (!values || values.length <= period) {
    return [];
  }

  const rsiArray = new Array(values.length).fill(null);
  const changes = [];

  for (let i = 1; i < values.length; i++) {
    changes.push(values[i] - values[i - 1]);
  }

  let gains = 0;
  let losses = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] >= 0) {
      gains += changes[i];
    } else {
      losses += Math.abs(changes[i]);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (avgLoss === 0) {
    rsiArray[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    rsiArray[period] = 100 - 100 / (1 + rs);
  }

  for (let i = period; i < changes.length; i++) {
    const currentGain = changes[i] >= 0 ? changes[i] : 0;
    const currentLoss = changes[i] < 0 ? Math.abs(changes[i]) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    if (avgLoss === 0) {
      rsiArray[i + 1] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsiArray[i + 1] = 100 - 100 / (1 + rs);
    }
  }

  return rsiArray;
}

/**
 * Base Abstract Strategy Interface
 */
class BaseStrategy {
  constructor(name) {
    this.name = name;
  }

  /**
   * Generates BUY, SELL, or HOLD signal from market data
   * @param {Object} context - { candles, currentPrice, position, config }
   * @returns {Object} { signal: 'BUY'|'SELL'|'HOLD', reason: string, confidence: null, indicators: Object }
   */
  generateSignal(context) {
    throw new Error('generateSignal() must be implemented by strategy subclass');
  }
}

/**
 * Fast EMA + Slow EMA + RSI Strategy
 */
class EMARSIStrategy extends BaseStrategy {
  constructor(options = {}) {
    super('EMA_RSI');
    this.fastPeriod = options.fastPeriod || 20;
    this.slowPeriod = options.slowPeriod || 50;
    this.rsiPeriod = options.rsiPeriod || 14;
    this.rsiOverbought = options.rsiOverbought || 70;
    this.rsiOversold = options.rsiOversold || 30;
  }

  /**
   * Generates trade signal based on Fast/Slow EMA crossover, RSI confirmation, and position risk levels.
   */
  generateSignal({ candles = [], currentPrice = null, position = null }) {
    if (!candles || candles.length < this.slowPeriod + 2) {
      return {
        signal: 'HOLD',
        reason: `Insufficient candle data for calculation. Need at least ${this.slowPeriod + 2} candles, got ${candles.length}`,
        confidence: null,
        indicators: null,
      };
    }

    const closePrices = candles.map((c) => parseFloat(c.close));
    const effectivePrice = currentPrice !== null ? currentPrice : closePrices[closePrices.length - 1];

    // Calculate Indicators
    const fastEmaArray = calculateEMA(closePrices, this.fastPeriod);
    const slowEmaArray = calculateEMA(closePrices, this.slowPeriod);
    const rsiArray = calculateRSI(closePrices, this.rsiPeriod);

    const len = closePrices.length;
    const currentFastEma = fastEmaArray[len - 1];
    const prevFastEma = fastEmaArray[len - 2];
    const currentSlowEma = slowEmaArray[len - 1];
    const prevSlowEma = slowEmaArray[len - 2];
    const currentRsi = rsiArray[len - 1];

    const indicators = {
      price: effectivePrice,
      fastEma: currentFastEma !== null ? parseFloat(currentFastEma.toFixed(4)) : null,
      prevFastEma: prevFastEma !== null ? parseFloat(prevFastEma.toFixed(4)) : null,
      slowEma: currentSlowEma !== null ? parseFloat(currentSlowEma.toFixed(4)) : null,
      prevSlowEma: prevSlowEma !== null ? parseFloat(prevSlowEma.toFixed(4)) : null,
      rsi: currentRsi !== null ? parseFloat(currentRsi.toFixed(2)) : null,
    };

    // 1. POSITION MANAGEMENT: Check Stop-Loss and Take-Profit if in an active position
    if (position && position.side === 'buy') {
      if (position.stopLossPrice && effectivePrice <= position.stopLossPrice) {
        return {
          signal: 'SELL',
          reason: `Stop-Loss triggered: Current price (${effectivePrice}) <= Stop-Loss (${position.stopLossPrice.toFixed(2)})`,
          confidence: null,
          indicators,
        };
      }

      if (position.takeProfitPrice && effectivePrice >= position.takeProfitPrice) {
        return {
          signal: 'SELL',
          reason: `Take-Profit triggered: Current price (${effectivePrice}) >= Take-Profit (${position.takeProfitPrice.toFixed(2)})`,
          confidence: null,
          indicators,
        };
      }

      // Check Bearish Crossover to exit early
      if (prevFastEma >= prevSlowEma && currentFastEma < currentSlowEma) {
        return {
          signal: 'SELL',
          reason: `Bearish Crossover: Fast EMA (${currentFastEma.toFixed(2)}) crossed below Slow EMA (${currentSlowEma.toFixed(2)})`,
          confidence: null,
          indicators,
        };
      }

      return {
        signal: 'HOLD',
        reason: 'Holding active position. Risk targets not reached and no exit crossover.',
        confidence: null,
        indicators,
      };
    }

    // 2. ENTRY SIGNAL EVALUATION (When not currently holding a position)
    const isBullishCrossover = prevFastEma <= prevSlowEma && currentFastEma > currentSlowEma;
    const isRsiAcceptable = currentRsi !== null && currentRsi < this.rsiOverbought;

    if (isBullishCrossover && isRsiAcceptable) {
      return {
        signal: 'BUY',
        reason: `Bullish Crossover: Fast EMA (${currentFastEma.toFixed(2)}) crossed above Slow EMA (${currentSlowEma.toFixed(2)}) with RSI (${currentRsi.toFixed(1)} < ${this.rsiOverbought})`,
        confidence: null,
        indicators,
      };
    }

    // If already above slow EMA and RSI is oversold rebounding
    if (currentFastEma > currentSlowEma && currentRsi !== null && currentRsi <= this.rsiOversold) {
      return {
        signal: 'BUY',
        reason: `Oversold Reversal: RSI (${currentRsi.toFixed(1)} <= ${this.rsiOversold}) in bullish trend (Fast EMA > Slow EMA)`,
        confidence: null,
        indicators,
      };
    }

    return {
      signal: 'HOLD',
      reason: 'No trade condition met. Monitoring market.',
      confidence: null,
      indicators,
    };
  }
}

/**
 * Strategy Registry to easily replace or load strategies
 */
class StrategyRegistry {
  constructor() {
    this.strategies = new Map();
    this.register(new EMARSIStrategy());
  }

  register(strategyInstance) {
    this.strategies.set(strategyInstance.name, strategyInstance);
  }

  get(name = 'EMA_RSI') {
    return this.strategies.get(name) || this.strategies.get('EMA_RSI');
  }

  list() {
    return Array.from(this.strategies.keys());
  }
}

const strategyRegistry = new StrategyRegistry();

module.exports = {
  calculateEMA,
  calculateRSI,
  BaseStrategy,
  EMARSIStrategy,
  strategyRegistry,
};
