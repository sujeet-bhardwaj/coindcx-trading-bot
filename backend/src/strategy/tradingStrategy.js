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

/**
 * Base Abstract Strategy Interface
 */
class BaseStrategy {
  constructor(name, description = '') {
    this.name = name;
    this.description = description;
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
    this.rsiOverbought = options.rsiOverbought || 68;
    this.rsiOversold = options.rsiOversold || 38;
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

    // 1. POSITION MANAGEMENT: Check Stop-Loss, Take-Profit, Trailing, and 15M Auto-Exit
    if (position && position.side === 'buy') {
      const entryPrice = position.entryPrice || effectivePrice;
      const profitPercent = ((effectivePrice - entryPrice) / entryPrice) * 100;
      const createdAt = position.createdAt ? new Date(position.createdAt).getTime() : Date.now();
      const openTimeMs = Date.now() - createdAt;
      const elapsedSeconds = Math.floor(openTimeMs / 1000);

      if (position.peakProfitPercent === undefined) position.peakProfitPercent = 0;
      if (profitPercent > position.peakProfitPercent) {
        position.peakProfitPercent = profitPercent;
      }
      const peak = position.peakProfitPercent;
      indicators.elapsedSeconds = elapsedSeconds;
      indicators.remainingSeconds = Math.max(0, 900 - elapsedSeconds);
      indicators.peakProfit = parseFloat(peak.toFixed(2));

      // Rule a: Stop-Loss
      if (position.stopLossPrice && effectivePrice <= position.stopLossPrice) {
        return {
          signal: 'SELL',
          reason: `Stop-Loss triggered: Current price (${effectivePrice}) <= Stop-Loss (${position.stopLossPrice.toFixed(2)})`,
          indicators,
        };
      }

      // Rule b: Take-Profit
      if (position.takeProfitPrice && effectivePrice >= position.takeProfitPrice) {
        return {
          signal: 'SELL',
          reason: `Take-Profit triggered: Current price (${effectivePrice}) >= Take-Profit (${position.takeProfitPrice.toFixed(2)})`,
          indicators,
        };
      }

      // Rule c: Dynamic Trailing Take-Profit (Peaked >= +0.60%, locked on 0.25% pullback)
      if (peak >= 0.60 && (peak - profitPercent) >= 0.25) {
        return {
          signal: 'SELL',
          reason: `15M Trailing Profit Locked: Peaked at +${peak.toFixed(2)}% | Locked at +${profitPercent.toFixed(2)}%`,
          indicators,
        };
      }

      // Rule d: Breakeven Protection (peaked >= +0.40%, drop back to 0%)
      if (peak >= 0.40 && profitPercent <= 0) {
        return {
          signal: 'SELL',
          reason: `Breakeven Exit: Trade was in profit (+${peak.toFixed(2)}%), closed at 0% to prevent loss!`,
          indicators,
        };
      }

      // Rule e: 15-Minute Cycle Auto-Exit (900 seconds)
      if (openTimeMs >= 900000) {
        return {
          signal: 'SELL',
          reason: `15M Cycle Complete: 15-Minute hold reached (${elapsedSeconds}s). Auto-closing to start next trade. Net: ${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%`,
          indicators,
        };
      }

      // Rule f: Check Bearish Crossover to exit early
      if (prevFastEma >= prevSlowEma && currentFastEma < currentSlowEma) {
        return {
          signal: 'SELL',
          reason: `Bearish Crossover: Fast EMA (${currentFastEma.toFixed(2)}) crossed below Slow EMA (${currentSlowEma.toFixed(2)})`,
          indicators,
        };
      }

      return {
        signal: 'HOLD',
        reason: `15M Trade Active (${elapsedSeconds}s/900s) | P&L: ${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(2)}% | Peak: +${peak.toFixed(2)}%`,
        indicators,
      };
    }

    // 2. ENTRY SIGNAL EVALUATION (Active 15M cycle buying)
    const isBullishCrossover = prevFastEma <= prevSlowEma && currentFastEma > currentSlowEma;
    const isTrendBullish = currentFastEma !== null && currentSlowEma !== null && currentFastEma >= currentSlowEma;
    const isRsiSafe = currentRsi !== null && currentRsi >= 30 && currentRsi <= 76;
    const isRsiAcceptable = currentRsi !== null && currentRsi < this.rsiOverbought;

    // Trigger A: Bullish Golden Crossover
    if (isBullishCrossover && isRsiAcceptable) {
      return {
        signal: 'BUY',
        reason: `Bullish Crossover: Fast EMA (${currentFastEma.toFixed(2)}) crossed above Slow EMA (${currentSlowEma.toFixed(2)}) with RSI (${currentRsi.toFixed(1)})`,
        indicators,
      };
    }

    // Trigger B: 15M Trend Momentum (Fast EMA >= Slow EMA in healthy RSI zone)
    if (isTrendBullish && isRsiSafe) {
      return {
        signal: 'BUY',
        reason: `15M Trend Momentum Trigger: Fast EMA (${currentFastEma.toFixed(2)}) >= Slow EMA (${currentSlowEma.toFixed(2)}) with RSI (${currentRsi.toFixed(1)})`,
        indicators,
      };
    }

    // Trigger C: Oversold Reversal Dip
    if (currentRsi !== null && currentRsi <= this.rsiOversold) {
      return {
        signal: 'BUY',
        reason: `15M Oversold Dip Trigger: RSI (${currentRsi.toFixed(1)} <= ${this.rsiOversold}) in buying zone`,
        indicators,
      };
    }

    // Trigger D: Healthy Trading Range
    if (currentRsi !== null && currentRsi >= 38 && currentRsi <= 68) {
      return {
        signal: 'BUY',
        reason: `15M Range Momentum Trigger: RSI (${currentRsi.toFixed(1)}) in active buying zone`,
        indicators,
      };
    }

    return {
      signal: 'HOLD',
      reason: `15M Monitoring: Waiting for momentum confirmation (RSI: ${currentRsi !== null ? currentRsi.toFixed(1) : 'N/A'})`,
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

    // Position risk & exit checks
    if (position && position.side === 'buy') {
      if (position.stopLossPrice && effectivePrice <= position.stopLossPrice) {
        return {
          signal: 'SELL',
          reason: `Stop-Loss hit: Price (${effectivePrice}) <= Stop-Loss (${position.stopLossPrice.toFixed(2)})`,
          indicators,
        };
      }
      if (position.takeProfitPrice && effectivePrice >= position.takeProfitPrice) {
        return {
          signal: 'SELL',
          reason: `Take-Profit hit: Price (${effectivePrice}) >= Take-Profit (${position.takeProfitPrice.toFixed(2)})`,
          indicators,
        };
      }
      if (upper !== null && effectivePrice >= upper) {
        return {
          signal: 'SELL',
          reason: `Upper Bollinger Band reached ($${effectivePrice} >= $${upper.toFixed(2)}). Mean reversion profit target reached.`,
          indicators,
        };
      }
      if (currentRsi !== null && currentRsi >= this.rsiOverbought) {
        return {
          signal: 'SELL',
          reason: `Overbought RSI (${currentRsi.toFixed(1)} >= ${this.rsiOverbought}). Exiting position safely.`,
          indicators,
        };
      }
      return { signal: 'HOLD', reason: 'Holding position inside Bollinger channel.', indicators };
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

    if (position && position.side === 'buy') {
      if (position.stopLossPrice && effectivePrice <= position.stopLossPrice) {
        return { signal: 'SELL', reason: `Grid Stop-Loss hit at $${effectivePrice}`, indicators };
      }
      // Target hit at upper grid step
      if (effectivePrice >= upperStep || (position.entryPrice && effectivePrice >= position.entryPrice * (1 + stepPercent / 100))) {
        return { signal: 'SELL', reason: `Grid Target Step hit ($${effectivePrice} >= $${upperStep.toFixed(2)})`, indicators };
      }
      return { signal: 'HOLD', reason: 'Holding grid position waiting for target exit.', indicators };
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

    if (position && position.side === 'buy') {
      if (position.stopLossPrice && effectivePrice <= position.stopLossPrice) {
        return { signal: 'SELL', reason: `Stop-Loss triggered at $${effectivePrice}`, indicators };
      }
      if (position.takeProfitPrice && effectivePrice >= position.takeProfitPrice) {
        return { signal: 'SELL', reason: `Take-Profit reached at $${effectivePrice}`, indicators };
      }
      // Exit if MACD histogram flips negative
      if (prevHist >= 0 && currentHist < 0) {
        return { signal: 'SELL', reason: 'Bearish MACD crossover (Histogram turned negative)', indicators };
      }
      return { signal: 'HOLD', reason: 'Holding MACD position.', indicators };
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
    super('SCALPER_3M', '3-Minute Scalper: Dynamic trailing profit with fixed micro stop-loss (-0.35%) and 3m cycle exit.');
    this.fastPeriod = options.fastPeriod || 3;
    this.slowPeriod = options.slowPeriod || 8;
    this.rsiPeriod = options.rsiPeriod || 7;
    this.trailingActivation = options.trailingActivation || 0.30; // Activate trailing at +0.30%
    this.trailingGiveback = options.trailingGiveback || 0.15; // 0.15% drop from peak locks profit
    this.fixedStopLoss = options.fixedStopLoss || 0.35; // Strict fixed stop loss: -0.35%
    this.maxHoldMs = 180000; // 3 minutes in milliseconds
  }

  generateSignal({ candles = [], currentPrice = null, position = null }) {
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
      maxHoldMs: this.maxHoldMs,
    };

    // 1. POSITION MANAGEMENT (When trade is active)
    if (position && position.side === 'buy') {
      const entryPrice = position.entryPrice || effectivePrice;
      const profitPercent = ((effectivePrice - entryPrice) / entryPrice) * 100;

      // Track peak profit reached since entry for Dynamic Trailing
      if (position.peakProfitPercent === undefined) position.peakProfitPercent = 0;
      if (profitPercent > position.peakProfitPercent) {
        position.peakProfitPercent = profitPercent;
      }
      const peak = position.peakProfitPercent;

      const createdAt = position.createdAt ? new Date(position.createdAt).getTime() : Date.now();
      const openTimeMs = Date.now() - createdAt;
      const elapsedSeconds = Math.floor(openTimeMs / 1000);
      indicators.elapsedSeconds = elapsedSeconds;
      indicators.remainingSeconds = Math.max(0, 180 - elapsedSeconds);
      indicators.peakProfit = parseFloat(peak.toFixed(2));

      // Rule a: STRICT FIXED STOP LOSS (-0.35% — Fixed minimum loss)
      if (profitPercent <= -this.fixedStopLoss) {
        return {
          signal: 'SELL',
          reason: `Fixed Stop-Loss Hit: Loss (${profitPercent.toFixed(2)}%) <= -${this.fixedStopLoss}%. Minimum loss strictly capped!`,
          indicators,
        };
      }

      // Rule b: DYNAMIC TRAILING TAKE-PROFIT (UNLIMITED PROFIT POTENTIAL)
      // Once profit reaches +0.30%, if price drops 0.15% from its highest peak -> LOCK IN PROFIT!
      if (peak >= this.trailingActivation && (peak - profitPercent) >= this.trailingGiveback) {
        return {
          signal: 'SELL',
          reason: `Dynamic Trailing Profit Locked: Peaked at +${peak.toFixed(2)}% | Sold at +${profitPercent.toFixed(2)}% (Drop: ${(peak - profitPercent).toFixed(2)}%)`,
          indicators,
        };
      }

      // Rule c: BREAKEVEN PROTECTION (Guaranteed zero loss if trade was in profit)
      if (peak >= 0.25 && profitPercent <= 0) {
        return {
          signal: 'SELL',
          reason: `Breakeven Exit: Trade was in profit (+${peak.toFixed(2)}%), exited at 0% to prevent loss!`,
          indicators,
        };
      }

      // Rule d: 3-MINUTE CYCLE AUTO-EXIT (180s)
      if (openTimeMs >= this.maxHoldMs) {
        return {
          signal: 'SELL',
          reason: `3M Cycle Complete: 3-Minute hold reached (${elapsedSeconds}s). Auto-closing to start next trade. Net: ${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%`,
          indicators,
        };
      }

      return {
        signal: 'HOLD',
        reason: `3M Scalp Active (${elapsedSeconds}s/180s) | Current: ${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(2)}% | Peak: +${peak.toFixed(2)}% (Dynamic Trailing)`,
        indicators,
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
    super('SCALPER_15M', '15-Minute Scalper: Dynamic trailing profit with fixed stop-loss (-0.80%) and 15m cycle auto-exit.');
    this.fastPeriod = options.fastPeriod || 9;
    this.slowPeriod = options.slowPeriod || 21;
    this.rsiPeriod = options.rsiPeriod || 14;
    this.trailingActivation = options.trailingActivation || 0.60;
    this.trailingGiveback = options.trailingGiveback || 0.25;
    this.fixedStopLoss = options.fixedStopLoss || 0.80;
    this.maxHoldMs = 900000; // 15 minutes in milliseconds
  }

  generateSignal({ candles = [], currentPrice = null, position = null }) {
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
      maxHoldMs: this.maxHoldMs,
    };

    // 1. POSITION MANAGEMENT (When trade is active)
    if (position && position.side === 'buy') {
      const entryPrice = position.entryPrice || effectivePrice;
      const profitPercent = ((effectivePrice - entryPrice) / entryPrice) * 100;

      if (position.peakProfitPercent === undefined) position.peakProfitPercent = 0;
      if (profitPercent > position.peakProfitPercent) {
        position.peakProfitPercent = profitPercent;
      }
      const peak = position.peakProfitPercent;

      const createdAt = position.createdAt ? new Date(position.createdAt).getTime() : Date.now();
      const openTimeMs = Date.now() - createdAt;
      const elapsedSeconds = Math.floor(openTimeMs / 1000);
      indicators.elapsedSeconds = elapsedSeconds;
      indicators.remainingSeconds = Math.max(0, 900 - elapsedSeconds);
      indicators.peakProfit = parseFloat(peak.toFixed(2));

      // Rule a: STRICT FIXED STOP LOSS
      if (profitPercent <= -this.fixedStopLoss) {
        return {
          signal: 'SELL',
          reason: `Fixed Stop-Loss Hit: Loss (${profitPercent.toFixed(2)}%) <= -${this.fixedStopLoss}%. Minimum loss strictly capped!`,
          indicators,
        };
      }

      // Rule b: DYNAMIC TRAILING TAKE-PROFIT
      if (peak >= this.trailingActivation && (peak - profitPercent) >= this.trailingGiveback) {
        return {
          signal: 'SELL',
          reason: `Dynamic Trailing Profit Locked: Peaked at +${peak.toFixed(2)}% | Sold at +${profitPercent.toFixed(2)}% (Drop: ${(peak - profitPercent).toFixed(2)}%)`,
          indicators,
        };
      }

      // Rule c: BREAKEVEN PROTECTION
      if (peak >= 0.40 && profitPercent <= 0) {
        return {
          signal: 'SELL',
          reason: `Breakeven Exit: Trade was in profit (+${peak.toFixed(2)}%), exited at 0% to prevent loss!`,
          indicators,
        };
      }

      // Rule d: 15-MINUTE CYCLE AUTO-EXIT (900s)
      if (openTimeMs >= this.maxHoldMs) {
        return {
          signal: 'SELL',
          reason: `15M Cycle Complete: 15-Minute hold reached (${elapsedSeconds}s). Auto-closing to start next trade. Net: ${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%`,
          indicators,
        };
      }

      // Rule e: Bearish Crossover exit
      if (prevFast >= prevSlow && currentFast < currentSlow) {
        return {
          signal: 'SELL',
          reason: `Bearish Crossover Exit: Fast EMA (${currentFast.toFixed(2)}) crossed below Slow EMA (${currentSlow.toFixed(2)})`,
          indicators,
        };
      }

      return {
        signal: 'HOLD',
        reason: `15M Scalp Active (${elapsedSeconds}s/900s) | Current: ${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(2)}% | Peak: +${peak.toFixed(2)}% (Dynamic Trailing)`,
        indicators,
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
  strategyRegistry,
};
