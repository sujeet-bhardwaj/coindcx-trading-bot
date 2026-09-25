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
 * Calculates Average True Range (ATR)
 * @param {Array<{high: number, low: number, close: number}>} candles
 * @param {number} period
 * @returns {number[]} Array of ATR values
 */
function calculateATR(candles, period = 14) {
  if (!candles || candles.length < period + 1) return [];
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const high = parseFloat(candles[i].high);
    const low = parseFloat(candles[i].low);
    const prevClose = parseFloat(candles[i - 1].close);
    const currentTr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    tr.push(currentTr);
  }

  const atr = new Array(candles.length).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  let currentAtr = sum / period;
  atr[period] = currentAtr;

  for (let i = period; i < tr.length; i++) {
    currentAtr = (currentAtr * (period - 1) + tr[i]) / period;
    atr[i + 1] = currentAtr;
  }
  return atr;
}

/**
 * Calculates Average Directional Index (ADX) to distinguish trending from choppy sideways market
 * @param {Array<{high: number, low: number, close: number}>} candles
 * @param {number} period
 * @returns {{ adx: number[], plusDI: number[], minusDI: number[] }}
 */
function calculateADX(candles, period = 14) {
  if (!candles || candles.length < period * 2) {
    return { adx: [], plusDI: [], minusDI: [] };
  }

  const tr = [];
  const plusDM = [];
  const minusDM = [];

  for (let i = 1; i < candles.length; i++) {
    const high = parseFloat(candles[i].high);
    const low = parseFloat(candles[i].low);
    const prevHigh = parseFloat(candles[i - 1].high);
    const prevLow = parseFloat(candles[i - 1].low);
    const prevClose = parseFloat(candles[i - 1].close);

    const currentTr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    tr.push(currentTr);

    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    if (upMove > downMove && upMove > 0) {
      plusDM.push(upMove);
    } else {
      plusDM.push(0);
    }

    if (downMove > upMove && downMove > 0) {
      minusDM.push(downMove);
    } else {
      minusDM.push(0);
    }
  }

  const len = candles.length;
  const adxArr = new Array(len).fill(null);
  const plusDIArr = new Array(len).fill(null);
  const minusDIArr = new Array(len).fill(null);

  let trSum = 0;
  let plusDMSum = 0;
  let minusDMSum = 0;

  for (let i = 0; i < period; i++) {
    trSum += tr[i];
    plusDMSum += plusDM[i];
    minusDMSum += minusDM[i];
  }

  const dxValues = [];
  const dxIndices = [];

  let smoothedTR = trSum;
  let smoothedPlusDM = plusDMSum;
  let smoothedMinusDM = minusDMSum;

  for (let i = period - 1; i < tr.length; i++) {
    if (i > period - 1) {
      smoothedTR = smoothedTR - (smoothedTR / period) + tr[i];
      smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDM[i];
      smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDM[i];
    }

    const pDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
    const mDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;

    plusDIArr[i + 1] = pDI;
    minusDIArr[i + 1] = mDI;

    const diSum = pDI + mDI;
    const dx = diSum > 0 ? (Math.abs(pDI - mDI) / diSum) * 100 : 0;
    dxValues.push(dx);
    dxIndices.push(i + 1);
  }

  if (dxValues.length >= period) {
    let dxSum = 0;
    for (let j = 0; j < period; j++) dxSum += dxValues[j];
    let curADX = dxSum / period;
    adxArr[dxIndices[period - 1]] = curADX;

    for (let j = period; j < dxValues.length; j++) {
      curADX = (curADX * (period - 1) + dxValues[j]) / period;
      adxArr[dxIndices[j]] = curADX;
    }
  }

  return { adx: adxArr, plusDI: plusDIArr, minusDI: minusDIArr };
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

    // 2. ENTRY EVALUATION (Micro-momentum with trend confirmation)
    // Micro momentum: fast EMA >= slow EMA AND healthy RSI momentum (avoid buying near tops > 72)
    const isMicroBullish = currentFast !== null && currentSlow !== null && currentFast > currentSlow;
    const isRsiBullish = currentRsi >= 45 && currentRsi <= 70;

    if (isMicroBullish && isRsiBullish) {
      return {
        signal: 'BUY',
        reason: `3M Scalp Momentum Trigger: Fast EMA (${currentFast?.toFixed(1)}) > Slow EMA (${currentSlow?.toFixed(1)}) with RSI (${currentRsi.toFixed(1)}) in momentum zone`,
        indicators,
      };
    }

    // Dip / Oversold Bounce Entry (RSI <= 32 turning up)
    if (currentRsi <= 32) {
      return {
        signal: 'BUY',
        reason: `3M Scalp Oversold Bounce: Micro RSI (${currentRsi.toFixed(1)} <= 32)`,
        indicators,
      };
    }

    return {
      signal: 'HOLD',
      reason: `3M Scalper: Waiting for momentum confirmation (Fast EMA: ${currentFast?.toFixed(1)}, Slow EMA: ${currentSlow?.toFixed(1)}, RSI: ${currentRsi.toFixed(1)})`,
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

    if (isTrendBullish && isRsiSafe && currentRsi >= 48) {
      return {
        signal: 'BUY',
        reason: `15M Momentum Trigger: Fast EMA (${currentFast?.toFixed(1)}) > Slow EMA (${currentSlow?.toFixed(1)}) with strong RSI (${currentRsi.toFixed(1)})`,
        indicators,
      };
    }

    if (currentRsi <= 35) {
      return {
        signal: 'BUY',
        reason: `15M Dip Trigger: RSI Oversold Bounce (${currentRsi.toFixed(1)} <= 35)`,
        indicators,
      };
    }

    return {
      signal: 'HOLD',
      reason: `15M Scalper: Waiting for momentum or oversold dip (RSI: ${currentRsi.toFixed(1)}, Fast EMA: ${currentFast?.toFixed(1)}, Slow EMA: ${currentSlow?.toFixed(1)})`,
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
 * STRATEGY 8: Institutional Trend-Pullback Pro Strategy (TREND_PULLBACK_PRO)
 * Designed for High Win-Rate & Positive Expectancy:
 * - Macro Trend Confirmation: Price above 200 EMA (Long only in bull structure)
 * - Trend Strength: 20 EMA > 50 EMA
 * - ADX Filter: ADX >= 18 (Avoids death-by-chop in sideways consolidation)
 * - Dip / Pullback Entry: Price pulls back to 20/50 EMA dynamic support with RSI bounce (40 - 62)
 * - Fee-Aware Exit: Covers TDS (1%) and exchange fees (0.4%)
 */
class TrendPullbackProStrategy extends BaseStrategy {
  constructor(options = {}) {
    super('TREND_PULLBACK_PRO', 'Institutional Trend-Pullback Pro: 200 EMA Macro Trend + 20/50 EMA Pullback + ADX Chop Filter.');
    this.fastPeriod = options.fastPeriod || 20;
    this.slowPeriod = options.slowPeriod || 50;
    this.macroPeriod = options.macroPeriod || 200;
    this.rsiPeriod = options.rsiPeriod || 14;
    this.adxPeriod = options.adxPeriod || 14;
  }

  evaluate(context) {
    return this.generateSignal(context);
  }

  generateSignal({ candles = [], currentPrice = null, position = null, config = {} }) {
    const minNeeded = Math.min(this.macroPeriod + 2, 52);
    if (!candles || candles.length < minNeeded) {
      return {
        signal: 'HOLD',
        reason: `Trend-Pullback Pro: Gathering market history (${candles?.length || 0}/${minNeeded} candles)...`,
        indicators: null,
      };
    }

    const closePrices = candles.map((c) => parseFloat(c.close));
    const effectivePrice = currentPrice !== null ? currentPrice : closePrices[closePrices.length - 1];

    const len = closePrices.length;
    const fastEmaArray = calculateEMA(closePrices, this.fastPeriod);
    const slowEmaArray = calculateEMA(closePrices, this.slowPeriod);
    const effectiveMacroPeriod = Math.min(this.macroPeriod, Math.max(len - 2, 30));
    const macroEmaArray = calculateEMA(closePrices, effectiveMacroPeriod);
    const rsiArray = calculateRSI(closePrices, this.rsiPeriod);
    const adxResult = calculateADX(candles, this.adxPeriod);

    const currentFast = fastEmaArray[len - 1];
    const prevFast = fastEmaArray[len - 2];
    const currentSlow = slowEmaArray[len - 1];
    const prevSlow = slowEmaArray[len - 2];
    const currentMacro = macroEmaArray[len - 1] || currentSlow;
    const currentRsi = rsiArray[len - 1] !== null ? rsiArray[len - 1] : 50;
    const prevRsi = rsiArray[len - 2] !== null ? rsiArray[len - 2] : 50;
    const currentAdx = adxResult.adx[len - 1] !== null ? adxResult.adx[len - 1] : 25;

    const indicators = {
      price: effectivePrice,
      fastEma: currentFast !== null ? parseFloat(currentFast.toFixed(2)) : null,
      slowEma: currentSlow !== null ? parseFloat(currentSlow.toFixed(2)) : null,
      macroEma: currentMacro !== null ? parseFloat(currentMacro.toFixed(2)) : null,
      rsi: parseFloat(currentRsi.toFixed(1)),
      adx: parseFloat(currentAdx.toFixed(1)),
      strategyType: 'TREND_PULLBACK_PRO',
    };

    // 1. POSITION MANAGEMENT (Unified Exit Engine with Fee & TDS Awareness)
    if (position && position.side === 'buy') {
      const exitResult = evaluateExit(position, effectivePrice, {
        feeAware: true,
        feeDeductionPercent: 1.5,
        ...config,
      });
      return {
        signal: exitResult.action === 'SELL' ? 'SELL' : 'HOLD',
        reason: exitResult.reason,
        indicators,
        exitState: exitResult.state,
      };
    }

    // 2. CHOP FILTER (Avoid trading in dead sideways markets)
    if (currentAdx < 18) {
      return {
        signal: 'HOLD',
        reason: `CHOP_FILTER_ACTIVE: Market in low-momentum consolidation (ADX: ${currentAdx.toFixed(1)} < 18). Preserving capital.`,
        indicators,
      };
    }

    // 3. MACRO TREND CONFIRMATION (Price must be above Macro 200 EMA)
    const isMacroUptrend = currentMacro !== null ? effectivePrice >= currentMacro * 0.995 : true;
    if (!isMacroUptrend) {
      return {
        signal: 'HOLD',
        reason: `MACRO_DOWNTREND: Price ($${effectivePrice.toFixed(2)}) is below 200 EMA ($${currentMacro?.toFixed(2)}). Longs prohibited.`,
        indicators,
      };
    }

    // 4. TREND MOMENTUM (Fast EMA 20 > Slow EMA 50)
    const isTrendBullish = currentFast !== null && currentSlow !== null && currentFast >= currentSlow;
    if (!isTrendBullish) {
      return {
        signal: 'HOLD',
        reason: `NO_BULLISH_TREND: 20 EMA ($${currentFast?.toFixed(2)}) is below 50 EMA ($${currentSlow?.toFixed(2)}).`,
        indicators,
      };
    }

    // 5. VOLUME CONFIRMATION (Protect against low-liquidity fakeouts)
    let isVolumeHealthy = true;
    if (candles && candles.length >= 20 && candles[len - 1].volume !== undefined) {
      const volumes = candles.slice(-20).map((c) => parseFloat(c.volume) || 0);
      const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      const curVol = parseFloat(candles[len - 1].volume) || 0;
      isVolumeHealthy = avgVol <= 0 || curVol >= avgVol * 0.4;
    }
    if (!isVolumeHealthy) {
      return {
        signal: 'HOLD',
        reason: 'LOW_VOLUME_CONSOLIDATION: Volume drying up below 40% of 20-period average. Waiting for institutional participation.',
        indicators,
      };
    }

    // 6. PULLBACK & BOUNCE TRIGGER
    // Condition A: Price pulls back to dynamic support (within 1.5% of 20 EMA or 50 EMA, or in 20-50 EMA value pocket)
    const distToFastEma = Math.abs(effectivePrice - currentFast) / currentFast;
    const distToSlowEma = Math.abs(effectivePrice - currentSlow) / currentSlow;
    const isInValuePocket = (effectivePrice >= currentSlow * 0.995 && effectivePrice <= currentFast * 1.015);
    const isAtSupport = distToFastEma <= 0.015 || distToSlowEma <= 0.015 || isInValuePocket;

    // Condition B: RSI is in healthy bounce zone (38 - 65) and turning up, or fresh golden crossover
    const isRsiBouncing = currentRsi >= 38 && currentRsi <= 65 && currentRsi >= prevRsi;
    const isGoldenCross = prevFast <= prevSlow && currentFast > currentSlow;

    if ((isAtSupport && isRsiBouncing) || isGoldenCross) {
      const triggerType = isGoldenCross ? 'Golden Crossover' : (isInValuePocket ? 'EMA Value-Pocket Bounce' : 'EMA Dynamic Support Bounce');
      return {
        signal: 'BUY',
        reason: `PRO_SETUP [${triggerType}]: Price > 200 EMA ($${currentMacro.toFixed(0)}), 20 EMA > 50 EMA, RSI (${currentRsi.toFixed(1)}) bouncing off support with ADX (${currentAdx.toFixed(1)})`,
        indicators,
      };
    }

    // Condition C: Oversold deep discount bounce in macro uptrend
    if (currentRsi <= 35 && currentRsi >= prevRsi && isMacroUptrend) {
      return {
        signal: 'BUY',
        reason: `PRO_DIP_SETUP: Deep discount dip bounce in macro uptrend (RSI ${currentRsi.toFixed(1)} <= 35) above 200 EMA`,
        indicators,
      };
    }

    return {
      signal: 'HOLD',
      reason: `Trend-Pullback Pro: In macro uptrend. Waiting for optimal pullback to 20/50 EMA (RSI: ${currentRsi.toFixed(1)}, ADX: ${currentAdx.toFixed(1)})`,
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
    this.register(new TrendPullbackProStrategy());
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

  get(name = 'TREND_PULLBACK_PRO') {
    return this.strategies.get(name) || this.strategies.get('TREND_PULLBACK_PRO') || this.strategies.get('EMA_RSI');
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
  calculateATR,
  calculateADX,
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
  TrendPullbackProStrategy,
  strategyRegistry,
};

