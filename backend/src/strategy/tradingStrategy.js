/**
 * Technical Indicator Utilities & Modular Trading Strategy Engine
 */

/**
 * Calculates Simple Moving Average (SMA) array
 * @param {number[]} values - Array of numeric close prices
 * @param {number} period - Number of periods
 * @returns {number[]} Array of SMA values matching length of values
 */
function calculateSMA(values, period) {
  if (!values || values.length < period) return [];
  const smaArray = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  smaArray[period - 1] = sum / period;

  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    smaArray[i] = sum / period;
  }
  return smaArray;
}

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
 * Calculates Bollinger Bands (Upper, Middle SMA, Lower)
 * @param {number[]} values - Array of prices
 * @param {number} period - Lookback period (default 20)
 * @param {number} multiplier - Standard deviation multiplier (default 2.0)
 */
function calculateBollingerBands(values, period = 20, multiplier = 2.0) {
  if (!values || values.length < period) {
    return { upper: [], middle: [], lower: [] };
  }

  const sma = calculateSMA(values, period);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = sma[i];
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    upper[i] = mean + multiplier * stdDev;
    lower[i] = mean - multiplier * stdDev;
  }

  return { upper, middle: sma, lower };
}

/**
 * Calculates Moving Average Convergence Divergence (MACD)
 * @param {number[]} values - Array of prices
 * @param {number} fastPeriod - Fast EMA period (default 12)
 * @param {number} slowPeriod - Slow EMA period (default 26)
 * @param {number} signalPeriod - Signal line period (default 9)
 */
function calculateMACD(values, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (!values || values.length < slowPeriod + signalPeriod) {
    return { macd: [], signal: [], histogram: [] };
  }

  const fastEma = calculateEMA(values, fastPeriod);
  const slowEma = calculateEMA(values, slowPeriod);

  const macdLine = new Array(values.length).fill(null);
  const validMacdValues = [];
  const validIndices = [];

  for (let i = slowPeriod - 1; i < values.length; i++) {
    if (fastEma[i] !== null && slowEma[i] !== null) {
      const diff = fastEma[i] - slowEma[i];
      macdLine[i] = diff;
      validMacdValues.push(diff);
      validIndices.push(i);
    }
  }

  const signalEma = calculateEMA(validMacdValues, signalPeriod);
  const signalLine = new Array(values.length).fill(null);
  const histogram = new Array(values.length).fill(null);

  for (let j = 0; j < validMacdValues.length; j++) {
    const origIndex = validIndices[j];
    if (signalEma[j] !== null) {
      signalLine[origIndex] = signalEma[j];
      histogram[origIndex] = macdLine[origIndex] - signalEma[j];
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

const { evaluateExit } = require('../risk/exitEngine');

/**
 * Base Abstract Strategy Interface
 */
class BaseStrategy {
  constructor(name, description = '') {
    this.name = name;
    this.description = description;
  }

  /**
   * Evaluates market context and returns trading signal
   * @param {Object} context
   * @returns {Object}
   */
  evaluate(context) {
    return this.generateSignal(context);
  }

  /**
   * Generates BUY, SELL, or HOLD signal from market data
   * @param {Object} context - { candles, currentPrice, position, config }
   * @returns {Object} { signal: 'BUY'|'SELL'|'HOLD', reason: string, indicators: Object }
   */
  generateSignal(context) {
    throw new Error('generateSignal() must be implemented by strategy subclass');
  }
}

/**
 * STRATEGY 1: Fast EMA + Slow EMA + RSI Strategy
 */
class EMARSIStrategy extends BaseStrategy {
  constructor(options = {}) {
    super('EMA_RSI', 'Trend following with Fast & Slow EMA crossover confirmed by RSI momentum.');
    this.fastPeriod = options.fastPeriod || 9;
    this.slowPeriod = options.slowPeriod || 21;
    this.rsiPeriod = options.rsiPeriod || 14;
    this.rsiOverbought = options.rsiOverbought || 70;
    this.rsiOversold = options.rsiOversold || 30;
    this.allowShort = options.allowShort !== undefined ? Boolean(options.allowShort) : false;
  }

  generateSignal({ candles = [], currentPrice = null, position = null }) {
    if (!candles || candles.length < this.slowPeriod + 2) {
      return {
        signal: 'HOLD',
        reason: `Insufficient candle data for calculation. Need at least ${this.slowPeriod + 2} candles, got ${candles.length}`,
        indicators: null,
      };
    }

    const closePrices = candles.map((c) => parseFloat(c.close));
    const effectivePrice = currentPrice !== null ? currentPrice : closePrices[closePrices.length - 1];

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

    // 1. POSITION MANAGEMENT: Unified Exit Engine + Indicator Reversal Exits (Rules #13, #45, #46)
    if (position) {
      // First evaluate SL and Dynamic Profit-Lock Ladder
      const exitResult = evaluateExit(position, effectivePrice);
      if (exitResult.action === 'SELL') {
        return {
          signal: 'SELL',
          reason: exitResult.reason,
          indicators,
          exitState: exitResult.state,
        };
      }

      // Check Indicator-based Exits (Rule #13: EMA 9 < 21 OR RSI < 45 for LONG)
      if (position.side === 'buy') {
        if (currentFastEma !== null && currentSlowEma !== null && currentFastEma < currentSlowEma) {
          return {
            signal: 'SELL',
            reason: `EMA_EXIT: Fast EMA (${currentFastEma.toFixed(2)}) crossed below Slow EMA (${currentSlowEma.toFixed(2)})`,
            indicators,
            exitState: exitResult.state,
          };
        }
        if (currentRsi !== null && currentRsi < 45) {
          return {
            signal: 'SELL',
            reason: `RSI_EXIT: RSI (${currentRsi.toFixed(1)}) dropped below 45 exit threshold`,
            indicators,
            exitState: exitResult.state,
          };
        }
      }
      // Check Indicator-based Exits (Rule #44: EMA 9 > 21 OR RSI > 55 for SHORT)
      else if (position.side === 'short') {
        if (currentFastEma !== null && currentSlowEma !== null && currentFastEma > currentSlowEma) {
          return {
            signal: 'SELL',
            reason: `EMA_EXIT: Fast EMA (${currentFastEma.toFixed(2)}) crossed above Slow EMA (${currentSlowEma.toFixed(2)})`,
            indicators,
            exitState: exitResult.state,
          };
        }
        if (currentRsi !== null && currentRsi > 55) {
          return {
            signal: 'SELL',
            reason: `RSI_EXIT: RSI (${currentRsi.toFixed(1)}) rose above 55 short exit threshold`,
            indicators,
            exitState: exitResult.state,
          };
        }
      }

      return {
        signal: 'HOLD',
        reason: 'Position healthy: profit-lock monitoring active',
        indicators,
        exitState: exitResult.state,
      };
    }

    // 2. ENTRY SIGNAL EVALUATION (Rules #2, #43 for LONG; Rule #44 for SHORT)
    const isBullishCrossover = prevFastEma <= prevSlowEma && currentFastEma > currentSlowEma;
    const isEmaBullish = currentFastEma !== null && currentSlowEma !== null && currentFastEma > currentSlowEma;
    const isRsiBullishZone = currentRsi !== null && currentRsi >= 50 && currentRsi <= 70;

    // LONG / BUY Entry: EMA 9 > EMA 21 AND 50 <= RSI <= 70
    if (isEmaBullish && isRsiBullishZone) {
      const crossoverTag = isBullishCrossover ? 'Bullish Crossover' : 'Bullish Trend';
      return {
        signal: 'BUY',
        reason: `${crossoverTag}: Fast EMA (${currentFastEma.toFixed(2)}) > Slow EMA (${currentSlowEma.toFixed(2)}) with RSI (${currentRsi.toFixed(1)}) in 50-70 range`,
        indicators,
      };
    }

    // OPTIONAL SHORT Entry: EMA 9 < EMA 21 AND 30 <= RSI <= 50 (Rule #44)
    const isEmaBearish = currentFastEma !== null && currentSlowEma !== null && currentFastEma < currentSlowEma;
    const isRsiBearishZone = currentRsi !== null && currentRsi <= 50 && currentRsi >= 30;

    if (this.allowShort && isEmaBearish && isRsiBearishZone) {
      return {
        signal: 'SHORT',
        reason: `Bearish Breakdown: Fast EMA (${currentFastEma.toFixed(2)}) < Slow EMA (${currentSlowEma.toFixed(2)}) with RSI (${currentRsi.toFixed(1)}) in 30-50 range`,
        indicators,
      };
    }

    return {
      signal: 'HOLD',
      reason: `No trade setup: Fast EMA=${currentFastEma?.toFixed(2) || 'N/A'}, Slow EMA=${currentSlowEma?.toFixed(2) || 'N/A'}, RSI=${currentRsi?.toFixed(1) || 'N/A'} (Awaiting 15m completed candle criteria)`,
      indicators,
    };
  }
}

/**
 * STRATEGY 2: Bollinger Bands Mean Reversion Strategy
 * Buys when price touches or dips below Lower Band with oversold RSI,
 * Sells when price reaches Upper Band or overbought RSI.
 */
class BollingerBandsStrategy extends BaseStrategy {
  constructor(options = {}) {
    super('BOLLINGER_BANDS', 'Mean reversion buying oversold lower-band bounces and taking profit at upper band.');
    this.period = options.period || 20;
    this.multiplier = options.multiplier || 2.0;
    this.rsiPeriod = options.rsiPeriod || 14;
    this.rsiOversold = options.rsiOversold || 35;
    this.rsiOverbought = options.rsiOverbought || 65;
  }

  generateSignal({ candles = [], currentPrice = null, position = null }) {
    if (!candles || candles.length < this.period + 2) {
      return {
        signal: 'HOLD',
        reason: `Insufficient candle data for Bollinger calculation. Need at least ${this.period + 2} candles.`,
        indicators: null,
      };
    }

    const closePrices = candles.map((c) => parseFloat(c.close));
    const effectivePrice = currentPrice !== null ? currentPrice : closePrices[closePrices.length - 1];

    const bb = calculateBollingerBands(closePrices, this.period, this.multiplier);
    const rsiArray = calculateRSI(closePrices, this.rsiPeriod);

    const len = closePrices.length;
    const upper = bb.upper[len - 1];
    const middle = bb.middle[len - 1];
    const lower = bb.lower[len - 1];
    const currentRsi = rsiArray[len - 1];

    const indicators = {
      price: effectivePrice,
      upperBand: upper !== null ? parseFloat(upper.toFixed(2)) : null,
      middleBand: middle !== null ? parseFloat(middle.toFixed(2)) : null,
      lowerBand: lower !== null ? parseFloat(lower.toFixed(2)) : null,
      rsi: currentRsi !== null ? parseFloat(currentRsi.toFixed(2)) : null,
    };

    // Position risk & exit checks (Delegated to Unified Exit Engine)
    if (position && position.side === 'buy') {
      const exitResult = evaluateExit(position, effectivePrice);
      return {
        signal: exitResult.action === 'SELL' ? 'SELL' : 'HOLD',
        reason: exitResult.reason,
        indicators,
        exitState: exitResult.state,
      };
    }

    // Entry signal: Price at or below lower band with oversold RSI
    if (lower !== null && effectivePrice <= lower && currentRsi !== null && currentRsi <= this.rsiOversold) {
      return {
        signal: 'BUY',
        reason: `Lower Bollinger Band Bounce: Price ($${effectivePrice} <= $${lower.toFixed(2)}) with Oversold RSI (${currentRsi.toFixed(1)} <= ${this.rsiOversold})`,
        indicators,
      };
    }

    return { signal: 'HOLD', reason: 'Price within normal Bollinger range. Monitoring.', indicators };
  }
}

/**
 * STRATEGY 3: Grid Trading Strategy
 * Places virtual grid buy orders at equidistant discount levels below median price,
 * and takes profit at higher grid bands.
 */
class GridStrategy extends BaseStrategy {
  constructor(options = {}) {
    super('GRID', 'Systematic grid trading profiting from sideways volatility across predefined price steps.');
    this.gridLevels = options.gridLevels || 5;
    this.gridSpanPercent = options.gridSpanPercent || 3.0; // +/- 3% grid range
    this.period = options.period || 30;
  }

  generateSignal({ candles = [], currentPrice = null, position = null }) {
    if (!candles || candles.length < this.period) {
      return { signal: 'HOLD', reason: 'Insufficient candle data for grid baseline.', indicators: null };
    }

    const closePrices = candles.map((c) => parseFloat(c.close));
    const effectivePrice = currentPrice !== null ? currentPrice : closePrices[closePrices.length - 1];

    const sma = calculateSMA(closePrices, this.period);
    const basePrice = sma[sma.length - 1] || effectivePrice;

    const stepPercent = this.gridSpanPercent / this.gridLevels;
    const lowerStep = basePrice * (1 - stepPercent / 100);
    const upperStep = basePrice * (1 + stepPercent / 100);

    const indicators = {
      price: effectivePrice,
      basePrice: parseFloat(basePrice.toFixed(2)),
      gridLower: parseFloat(lowerStep.toFixed(2)),
      gridUpper: parseFloat(upperStep.toFixed(2)),
      stepPercent,
    };

    // Position risk & exit checks (Delegated to Unified Exit Engine)
    if (position && position.side === 'buy') {
      const exitResult = evaluateExit(position, effectivePrice);
      return {
        signal: exitResult.action === 'SELL' ? 'SELL' : 'HOLD',
        reason: exitResult.reason,
        indicators,
        exitState: exitResult.state,
      };
    }

    // Buy when price dips to lower grid level
    if (effectivePrice <= lowerStep) {
      return {
        signal: 'BUY',
        reason: `Grid Buy Trigger: Price dropped to lower grid level ($${effectivePrice} <= $${lowerStep.toFixed(2)})`,
        indicators,
      };
    }

    return { signal: 'HOLD', reason: 'Price between grid levels.', indicators };
  }
}

/**
 * STRATEGY 4: MACD + RSI Momentum Strategy
 * Detects bullish histogram expansion combined with healthy RSI momentum.
 */
class MACDRSIStrategy extends BaseStrategy {
  constructor(options = {}) {
    super('MACD_RSI', 'Momentum breakout strategy utilizing MACD crossover confirmed by RSI.');
    this.fastPeriod = options.fastPeriod || 12;
    this.slowPeriod = options.slowPeriod || 26;
    this.signalPeriod = options.signalPeriod || 9;
    this.rsiPeriod = options.rsiPeriod || 14;
  }

  generateSignal({ candles = [], currentPrice = null, position = null }) {
    const minNeeded = this.slowPeriod + this.signalPeriod + 2;
    if (!candles || candles.length < minNeeded) {
      return { signal: 'HOLD', reason: `Need at least ${minNeeded} candles for MACD calculation.`, indicators: null };
    }

    const closePrices = candles.map((c) => parseFloat(c.close));
    const effectivePrice = currentPrice !== null ? currentPrice : closePrices[closePrices.length - 1];

    const macdRes = calculateMACD(closePrices, this.fastPeriod, this.slowPeriod, this.signalPeriod);
    const rsiArray = calculateRSI(closePrices, this.rsiPeriod);

    const len = closePrices.length;
    const currentHist = macdRes.histogram[len - 1];
    const prevHist = macdRes.histogram[len - 2];
    const currentMacd = macdRes.macd[len - 1];
    const currentSignal = macdRes.signal[len - 1];
    const currentRsi = rsiArray[len - 1];

    const indicators = {
      price: effectivePrice,
      macd: currentMacd !== null ? parseFloat(currentMacd.toFixed(4)) : null,
      signal: currentSignal !== null ? parseFloat(currentSignal.toFixed(4)) : null,
      histogram: currentHist !== null ? parseFloat(currentHist.toFixed(4)) : null,
      rsi: currentRsi !== null ? parseFloat(currentRsi.toFixed(2)) : null,
    };

    // Position risk & exit checks (Delegated to Unified Exit Engine)
    if (position && position.side === 'buy') {
      const exitResult = evaluateExit(position, effectivePrice);
      return {
        signal: exitResult.action === 'SELL' ? 'SELL' : 'HOLD',
        reason: exitResult.reason,
        indicators,
        exitState: exitResult.state,
      };
    }

    // Bullish crossover: histogram turns positive and RSI is in momentum zone (45 to 68)
    const isBullishCrossover = prevHist <= 0 && currentHist > 0;
    const isRsiHealthy = currentRsi !== null && currentRsi >= 45 && currentRsi <= 68;

    if (isBullishCrossover && isRsiHealthy) {
      return {
        signal: 'BUY',
        reason: `Bullish MACD Crossover: Histogram positive (${currentHist.toFixed(3)}) with solid RSI momentum (${currentRsi.toFixed(1)})`,
        indicators,
      };
    }

    return { signal: 'HOLD', reason: 'No MACD trigger condition.', indicators };
  }
}

/**
 * STRATEGY 5: 3-Minute Scalper Strategy (SCALPER_3M)
 * Fast micro-momentum execution every 3 minutes.
 * - Fast EMA (3) + Slow EMA (8) + Micro RSI (7)
 * - Quick Take-Profit: +0.50%
 * - Micro Stop-Loss: -0.40%
 * - Time-based Auto-Exit: 180 seconds (3 minutes) to guarantee continuous 3m trade cycle
 */
class Scalper3MStrategy extends BaseStrategy {
  constructor(options = {}) {
    super('SCALPER_3M', '3-Minute Scalper: Micro-momentum entries with unified exit engine.');
    this.fastPeriod = options.fastPeriod || 3;
    this.slowPeriod = options.slowPeriod || 8;
    this.rsiPeriod = options.rsiPeriod || 7;
  }

  evaluate(context) {
    return this.generateSignal(context);
  }

  generateSignal({ candles = [], currentPrice = null, position = null, config = {} }) {
    const minNeeded = this.slowPeriod + 2;
    if (!candles || candles.length < minNeeded) {
      return {
        signal: 'HOLD',
        reason: `3M Scalper: Refreshing micro candles (${candles?.length || 0}/${minNeeded})...`,
        indicators: null,
      };
    }

    const closePrices = candles.map((c) => parseFloat(c.close));
    const effectivePrice = currentPrice !== null ? currentPrice : closePrices[closePrices.length - 1];

    const fastEmaArray = calculateEMA(closePrices, this.fastPeriod);
    const slowEmaArray = calculateEMA(closePrices, this.slowPeriod);
    const rsiArray = calculateRSI(closePrices, this.rsiPeriod);

    const len = closePrices.length;
    const currentFast = fastEmaArray[len - 1];
    const currentSlow = slowEmaArray[len - 1];
    const currentRsi = rsiArray[len - 1] !== null ? rsiArray[len - 1] : 50;

    const indicators = {
      price: effectivePrice,
      fastEma: currentFast !== null ? parseFloat(currentFast.toFixed(2)) : null,
      slowEma: currentSlow !== null ? parseFloat(currentSlow.toFixed(2)) : null,
      rsi: parseFloat(currentRsi.toFixed(1)),
      strategyType: 'SCALPER_3M',
    };

    // 1. POSITION MANAGEMENT (Delegated to Unified Exit Engine)
    if (position && position.side === 'buy') {
      const exitResult = evaluateExit(position, effectivePrice, config);
      return {
        signal: exitResult.action === 'SELL' ? 'SELL' : 'HOLD',
        reason: exitResult.reason,
        indicators,
        exitState: exitResult.state,
      };
    }

    // 2. ENTRY EVALUATION (When searching for next 3M trade)
    // Micro momentum: fast EMA >= slow EMA OR normal RSI (avoid extreme overbought > 78)
    const isMicroBullish = currentFast !== null && currentSlow !== null && currentFast >= currentSlow;
    const isRsiSafe = currentRsi >= 32 && currentRsi <= 76;

    if (isMicroBullish && isRsiSafe) {
      return {
        signal: 'BUY',
        reason: `3M Scalp Momentum Trigger: Fast EMA (${currentFast?.toFixed(1)}) >= Slow EMA (${currentSlow?.toFixed(1)}) with RSI (${currentRsi.toFixed(1)})`,
        indicators,
      };
    }

    // Dip entry
    if (currentRsi <= 35) {
      return {
        signal: 'BUY',
        reason: `3M Scalp Dip Trigger: Micro RSI Oversold (${currentRsi.toFixed(1)} <= 35)`,
        indicators,
      };
    }

    // Steady trading range entry
    if (currentRsi >= 38 && currentRsi <= 68) {
      return {
        signal: 'BUY',
        reason: `3M Scalp Range Trigger: Healthy momentum zone (RSI: ${currentRsi.toFixed(1)})`,
        indicators,
      };
    }

    return {
      signal: 'HOLD',
      reason: `3M Scalper: Waiting for momentum confirmation (RSI: ${currentRsi.toFixed(1)})`,
      indicators,
    };
  }
}

/**
 * STRATEGY 6: 15-Minute Scalper Strategy (SCALPER_15M)
 * Active momentum cycle execution within 15 minutes.
 * - Fast EMA (9) + Slow EMA (21) + RSI (14)
 * - Dynamic Trailing Profit: Activates at +0.60%, locks on 0.25% giveback
 * - Strict Fixed Stop-Loss: -0.80%
 * - Breakeven Protection: locks at 0% once peak >= +0.40%
 * - Time-based Auto-Exit: 900 seconds (15 minutes) to guarantee continuous 15m trade cycle
 */
class Scalper15MStrategy extends BaseStrategy {
  constructor(options = {}) {
    super('SCALPER_15M', '15-Minute Scalper: Momentum execution with unified exit engine.');
    this.fastPeriod = options.fastPeriod || 9;
    this.slowPeriod = options.slowPeriod || 21;
    this.rsiPeriod = options.rsiPeriod || 14;
  }

  evaluate(context) {
    return this.generateSignal(context);
  }

  generateSignal({ candles = [], currentPrice = null, position = null, config = {} }) {
    const minNeeded = this.slowPeriod + 2;
    if (!candles || candles.length < minNeeded) {
      return {
        signal: 'HOLD',
        reason: `15M Scalper: Refreshing market candles (${candles?.length || 0}/${minNeeded})...`,
        indicators: null,
      };
    }

    const closePrices = candles.map((c) => parseFloat(c.close));
    const effectivePrice = currentPrice !== null ? currentPrice : closePrices[closePrices.length - 1];

    const fastEmaArray = calculateEMA(closePrices, this.fastPeriod);
    const slowEmaArray = calculateEMA(closePrices, this.slowPeriod);
    const rsiArray = calculateRSI(closePrices, this.rsiPeriod);

    const len = closePrices.length;
    const currentFast = fastEmaArray[len - 1];
    const prevFast = fastEmaArray[len - 2];
    const currentSlow = slowEmaArray[len - 1];
    const prevSlow = slowEmaArray[len - 2];
    const currentRsi = rsiArray[len - 1] !== null ? rsiArray[len - 1] : 50;

    const indicators = {
      price: effectivePrice,
      fastEma: currentFast !== null ? parseFloat(currentFast.toFixed(2)) : null,
      slowEma: currentSlow !== null ? parseFloat(currentSlow.toFixed(2)) : null,
      rsi: parseFloat(currentRsi.toFixed(1)),
      strategyType: 'SCALPER_15M',
    };

    // 1. POSITION MANAGEMENT (Delegated to Unified Exit Engine)
    if (position && position.side === 'buy') {
      const exitResult = evaluateExit(position, effectivePrice, config);
      return {
        signal: exitResult.action === 'SELL' ? 'SELL' : 'HOLD',
        reason: exitResult.reason,
        indicators,
        exitState: exitResult.state,
      };
    }

    // 2. ENTRY EVALUATION (Active 15M cycle buying)
    const isBullishCrossover = prevFast <= prevSlow && currentFast > currentSlow;
    const isTrendBullish = currentFast !== null && currentSlow !== null && currentFast >= currentSlow;
    const isRsiSafe = currentRsi >= 32 && currentRsi <= 76;

    if (isBullishCrossover && isRsiSafe) {
      return {
        signal: 'BUY',
        reason: `15M Golden Crossover: Fast EMA crossed above Slow EMA with RSI (${currentRsi.toFixed(1)})`,
        indicators,
      };
    }

    if (isTrendBullish && isRsiSafe) {
      return {
        signal: 'BUY',
        reason: `15M Momentum Trigger: Fast EMA (${currentFast?.toFixed(1)}) >= Slow EMA (${currentSlow?.toFixed(1)}) with RSI (${currentRsi.toFixed(1)})`,
        indicators,
      };
    }

    if (currentRsi <= 38) {
      return {
        signal: 'BUY',
        reason: `15M Dip Trigger: RSI Oversold (${currentRsi.toFixed(1)} <= 38)`,
        indicators,
      };
    }

    if (currentRsi >= 38 && currentRsi <= 68) {
      return {
        signal: 'BUY',
        reason: `15M Range Trigger: Healthy momentum zone (RSI: ${currentRsi.toFixed(1)})`,
        indicators,
      };
    }

    return {
      signal: 'HOLD',
      reason: `15M Scalper: Monitoring market momentum (RSI: ${currentRsi.toFixed(1)})`,
      indicators,
    };
  }
}

/**
 * STRATEGY 7: 4-Hour Trend & Swing Strategy (TREND_4H)
 * Higher timeframe swing trading strategy on 4-hour candles.
 * - Macro Fast EMA (20) + Slow EMA (50) + RSI (14)
 * - Designed for multi-hour and multi-day trend following with high conviction
 * - Fully integrated with Unified Exit Engine, dynamic profit-locking & strict stop-loss
 */
class Trend4HStrategy extends BaseStrategy {
  constructor(options = {}) {
    super('TREND_4H', '4-Hour Trend & Swing: Macro EMA (20/50) + RSI (14) with unified exit engine.');
    this.fastPeriod = options.fastPeriod || 20;
    this.slowPeriod = options.slowPeriod || 50;
    this.rsiPeriod = options.rsiPeriod || 14;
  }

  evaluate(context) {
    return this.generateSignal(context);
  }

  generateSignal({ candles = [], currentPrice = null, position = null, config = {} }) {
    const minNeeded = this.slowPeriod + 2;
    if (!candles || candles.length < minNeeded) {
      return {
        signal: 'HOLD',
        reason: `4H Trend: Loading sufficient historical candles (${candles?.length || 0}/${minNeeded})...`,
        indicators: null,
      };
    }

    const closePrices = candles.map((c) => parseFloat(c.close));
    const effectivePrice = currentPrice !== null ? currentPrice : closePrices[closePrices.length - 1];

    const fastEmaArray = calculateEMA(closePrices, this.fastPeriod);
    const slowEmaArray = calculateEMA(closePrices, this.slowPeriod);
    const rsiArray = calculateRSI(closePrices, this.rsiPeriod);

    const len = closePrices.length;
    const currentFast = fastEmaArray[len - 1];
    const prevFast = fastEmaArray[len - 2];
    const currentSlow = slowEmaArray[len - 1];
    const prevSlow = slowEmaArray[len - 2];
    const currentRsi = rsiArray[len - 1] !== null ? rsiArray[len - 1] : 50;

    const indicators = {
      price: effectivePrice,
      fastEma: currentFast !== null ? parseFloat(currentFast.toFixed(2)) : null,
      slowEma: currentSlow !== null ? parseFloat(currentSlow.toFixed(2)) : null,
      rsi: parseFloat(currentRsi.toFixed(1)),
      strategyType: 'TREND_4H',
      timeframe: '4h',
    };

    // 1. POSITION MANAGEMENT (Delegated to Unified Exit Engine)
    if (position && position.side === 'buy') {
      const exitResult = evaluateExit(position, effectivePrice, config);
      return {
        signal: exitResult.action === 'SELL' ? 'SELL' : 'HOLD',
        reason: exitResult.reason,
        indicators,
        exitState: exitResult.state,
      };
    }

    // 2. ENTRY EVALUATION (4H Swing Trend Confirmation)
    const isBullishCrossover = prevFast <= prevSlow && currentFast > currentSlow;
    const isTrendBullish = currentFast !== null && currentSlow !== null && currentFast >= currentSlow;
    const isRsiSafe = currentRsi >= 35 && currentRsi <= 72;

    if (isBullishCrossover && isRsiSafe) {
      return {
        signal: 'BUY',
        reason: `4H Golden Cross: Fast EMA (20) crossed above Slow EMA (50) with RSI (${currentRsi.toFixed(1)})`,
        indicators,
      };
    }

    if (isTrendBullish && isRsiSafe && currentRsi >= 45) {
      return {
        signal: 'BUY',
        reason: `4H Trend Momentum: Fast EMA (${currentFast?.toFixed(1)}) >= Slow EMA (${currentSlow?.toFixed(1)}) with RSI (${currentRsi.toFixed(1)})`,
        indicators,
      };
    }

    if (currentRsi <= 35) {
      return {
        signal: 'BUY',
        reason: `4H Oversold Dip: Macro RSI (${currentRsi.toFixed(1)} <= 35) in established market`,
        indicators,
      };
    }

    return {
      signal: 'HOLD',
      reason: `4H Trend: Waiting for trend alignment (RSI: ${currentRsi.toFixed(1)})`,
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
    this.register(new BollingerBandsStrategy());
    this.register(new GridStrategy());
    this.register(new MACDRSIStrategy());
    this.register(new Scalper3MStrategy());
    this.register(new Scalper15MStrategy());
    this.register(new Trend4HStrategy());
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

  listDetails() {
    return Array.from(this.strategies.values()).map((s) => ({
      name: s.name,
      description: s.description,
    }));
  }
}

const strategyRegistry = new StrategyRegistry();

module.exports = {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateBollingerBands,
  calculateMACD,
  BaseStrategy,
  EMARSIStrategy,
  BollingerBandsStrategy,
  GridStrategy,
  MACDRSIStrategy,
  Scalper3MStrategy,
  Scalper15MStrategy,
  Trend4HStrategy,
  strategyRegistry,
};
