/**
 * Pre-Trade Safety Firewall Engine
 * Implements Requirements #33, #34, #35, #36, #37, #38, #50
 * Pure function: No I/O, completely deterministic and unit-testable.
 */

/**
 * 1. Stale Price Protection (Rule #34)
 * Rejects trade if market price is older than MAX_PRICE_AGE_MS (default 5000ms)
 */
function validateDataFreshness({ priceTimestamp, now = Date.now(), maxPriceAgeMs = 5000 }) {
  if (priceTimestamp === null || priceTimestamp === undefined) {
    return { passed: true, rule: 'STALE_PRICE_CHECK', note: 'Price timestamp not provided, skipped' };
  }
  const ageMs = now - Number(priceTimestamp);
  if (isNaN(ageMs) || ageMs > maxPriceAgeMs) {
    return {
      passed: false,
      reason: `STALE_PRICE_DATA — TRADE SKIPPED: Price data is ${(ageMs / 1000).toFixed(1)}s old (max allowed: ${(maxPriceAgeMs / 1000).toFixed(1)}s)`,
      rule: 'STALE_PRICE_CHECK',
      metrics: { ageMs, maxPriceAgeMs },
    };
  }
  return { passed: true, rule: 'STALE_PRICE_CHECK', metrics: { ageMs } };
}

/**
 * 2. Price Spike Protection (Rule #35)
 * Compares current price against previous candle close or reference price.
 * Rejects trade if price moved beyond MAX_PRICE_MOVE_PERCENT (default 3.0%).
 */
function validatePriceSpike({ currentPrice, referencePrice, maxPriceMovePercent = 3.0 }) {
  const current = Number(currentPrice);
  const ref = Number(referencePrice);
  if (isNaN(current) || current <= 0 || isNaN(ref) || ref <= 0) {
    return { passed: false, reason: 'PRICE_SPIKE_PROTECTION: Invalid price for spike comparison', rule: 'PRICE_SPIKE_CHECK' };
  }
  const movePercent = Math.abs((current - ref) / ref) * 100;
  if (movePercent > maxPriceMovePercent) {
    return {
      passed: false,
      reason: `PRICE_SPIKE_PROTECTION — TRADE SKIPPED: Sudden price move of ${movePercent.toFixed(2)}% exceeds max allowed ${maxPriceMovePercent.toFixed(2)}%`,
      rule: 'PRICE_SPIKE_CHECK',
      metrics: { movePercent, maxPriceMovePercent, current, ref },
    };
  }
  return { passed: true, rule: 'PRICE_SPIKE_CHECK', metrics: { movePercent } };
}

/**
 * 3. Spread Protection (Rule #36)
 * Calculates Spread % = (Ask - Bid) / Mid * 100.
 * Rejects trade if spread > MAX_ALLOWED_SPREAD (default 0.25%).
 */
function validateSpread({ bid, ask, maxAllowedSpread = 0.25 }) {
  const bestBid = Number(bid);
  const bestAsk = Number(ask);
  if (isNaN(bestBid) || bestBid <= 0 || isNaN(bestAsk) || bestAsk <= 0) {
    return { passed: true, rule: 'SPREAD_CHECK', note: 'Spread check skipped (orderbook bid/ask not provided)' };
  }
  if (bestAsk <= bestBid) {
    return { passed: false, reason: 'HIGH_SPREAD: Crossed orderbook detected (ask <= bid)', rule: 'SPREAD_CHECK' };
  }
  const midPrice = (bestAsk + bestBid) / 2;
  const spreadPercent = ((bestAsk - bestBid) / midPrice) * 100;
  if (spreadPercent > maxAllowedSpread) {
    return {
      passed: false,
      reason: `HIGH_SPREAD — TRADE SKIPPED: Current spread of ${spreadPercent.toFixed(3)}% exceeds max allowed ${maxAllowedSpread.toFixed(3)}%`,
      rule: 'SPREAD_CHECK',
      metrics: { spreadPercent, maxAllowedSpread, bestBid, bestAsk },
    };
  }
  return { passed: true, rule: 'SPREAD_CHECK', metrics: { spreadPercent } };
}

/**
 * 4. Slippage & Liquidity Protection (Rules #37 & #38)
 * Checks top order book depth against requested order quantity.
 * Rejects trade if order quantity exceeds liquidity ratio or expected slippage is too high.
 */
function validateLiquidityAndSlippage({
  quantity,
  orderBook,
  side = 'buy',
  maxAllowedSlippage = 0.15, // 0.15% max slippage
  maxPositionToLiquidityRatio = 0.05, // Order cannot exceed 5% of top 5 depth
}) {
  const qty = Number(quantity);
  if (isNaN(qty) || qty <= 0) {
    return { passed: false, reason: 'Invalid order quantity for liquidity validation', rule: 'LIQUIDITY_CHECK' };
  }
  if (!orderBook || (!orderBook.bids && !orderBook.asks)) {
    // If orderbook is not available on this stream/API call, gracefully pass
    return { passed: true, rule: 'LIQUIDITY_CHECK', note: 'Order book not available, skipped' };
  }

  // For a BUY order, we consume ASKS; for a SELL/SHORT order, we consume BIDS
  const levels = side === 'buy' ? (orderBook.asks || []) : (orderBook.bids || []);
  if (!Array.isArray(levels) || levels.length === 0) {
    return { passed: true, rule: 'LIQUIDITY_CHECK', note: 'Order book empty, skipped' };
  }

  // Calculate available depth across top 5 price levels
  const topLevels = levels.slice(0, 5);
  let availableVolume = 0;
  let weightedPriceSum = 0;
  let accumulatedQty = 0;

  for (const level of topLevels) {
    const price = Array.isArray(level) ? Number(level[0]) : Number(level.price);
    const volume = Array.isArray(level) ? Number(level[1]) : Number(level.quantity || level.volume);
    if (!isNaN(price) && !isNaN(volume) && volume > 0) {
      availableVolume += volume;
      const takeQty = Math.min(volume, Math.max(0, qty - accumulatedQty));
      weightedPriceSum += takeQty * price;
      accumulatedQty += takeQty;
    }
  }

  // 1. Liquidity Ratio Check (Rule #38)
  if (availableVolume > 0) {
    const liquidityRatio = qty / availableVolume;
    if (liquidityRatio > maxPositionToLiquidityRatio) {
      return {
        passed: false,
        reason: `INSUFFICIENT_LIQUIDITY — TRADE SKIPPED: Position (${qty}) represents ${(liquidityRatio * 100).toFixed(1)}% of top book liquidity (max ${(maxPositionToLiquidityRatio * 100).toFixed(1)}%)`,
        rule: 'LIQUIDITY_CHECK',
        metrics: { qty, availableVolume, liquidityRatio },
      };
    }
  }

  // 2. Slippage Check (Rule #37)
  const bestLevelPrice = Array.isArray(topLevels[0]) ? Number(topLevels[0][0]) : Number(topLevels[0]?.price);
  if (accumulatedQty > 0 && bestLevelPrice > 0) {
    const estimatedExecutionPrice = weightedPriceSum / accumulatedQty;
    const slippagePercent = Math.abs((estimatedExecutionPrice - bestLevelPrice) / bestLevelPrice) * 100;
    if (slippagePercent > maxAllowedSlippage) {
      return {
        passed: false,
        reason: `HIGH_SLIPPAGE — TRADE SKIPPED: Estimated slippage of ${slippagePercent.toFixed(3)}% exceeds max allowed ${maxAllowedSlippage.toFixed(3)}%`,
        rule: 'SLIPPAGE_CHECK',
        metrics: { slippagePercent, maxAllowedSlippage, estimatedExecutionPrice, bestLevelPrice },
      };
    }
  }

  return { passed: true, rule: 'LIQUIDITY_AND_SLIPPAGE_CHECK' };
}

/**
 * 5. Volatility Filter (Rule #50)
 * Evaluates the completed candle high-low range.
 * Rejects trade if recent volatility is abnormally high.
 */
function validateMarketVolatility({ candle, maxAllowedVolatility = 5.0 }) {
  if (!candle || !candle.high || !candle.low) {
    return { passed: true, rule: 'VOLATILITY_CHECK' };
  }
  const high = Number(candle.high);
  const low = Number(candle.low);
  if (isNaN(high) || isNaN(low) || low <= 0) {
    return { passed: true, rule: 'VOLATILITY_CHECK' };
  }
  const rangePercent = ((high - low) / low) * 100;
  if (rangePercent > maxAllowedVolatility) {
    return {
      passed: false,
      reason: `VOLATILITY_TOO_HIGH — TRADE SKIPPED: Candle range of ${rangePercent.toFixed(2)}% exceeds max allowed volatility ${maxAllowedVolatility.toFixed(2)}%`,
      rule: 'VOLATILITY_CHECK',
      metrics: { rangePercent, maxAllowedVolatility },
    };
  }
  return { passed: true, rule: 'VOLATILITY_CHECK', metrics: { rangePercent } };
}

/**
 * 6. Consecutive Loss & Daily Trade Limits (Rules #15, #16, #17)
 */
function validateTradeFrequencyLimits({
  consecutiveLosses = 0,
  maxConsecutiveLosses = 3,
  dailyTradesCount = 0,
  maxDailyTrades = 10,
}) {
  if (consecutiveLosses >= maxConsecutiveLosses) {
    return {
      passed: false,
      reason: `CONSECUTIVE_LOSS_LIMIT — TRADE PAUSED: ${consecutiveLosses} consecutive losses reached (limit: ${maxConsecutiveLosses}). Manual reset required.`,
      rule: 'CONSECUTIVE_LOSS_CHECK',
      metrics: { consecutiveLosses, maxConsecutiveLosses },
    };
  }

  if (dailyTradesCount >= maxDailyTrades) {
    return {
      passed: false,
      reason: `DAILY_TRADE_LIMIT_REACHED — TRADE SKIPPED: Daily trade limit of ${maxDailyTrades} trades reached today (${dailyTradesCount}/${maxDailyTrades}).`,
      rule: 'MAX_DAILY_TRADES_CHECK',
      metrics: { dailyTradesCount, maxDailyTrades },
    };
  }

  return { passed: true, rule: 'FREQUENCY_LIMITS_CHECK' };
}

/**
 * Master Pre-Trade Validation Firewall (Rule #33)
 * Runs all pre-trade safety filters sequentially before order creation.
 */
function runComprehensivePreTradeValidation({
  // Price and Freshness
  currentPrice,
  priceTimestamp,
  maxPriceAgeMs = 5000,
  now = Date.now(),
  // Spike & Volatility
  referencePrice,
  maxPriceMovePercent = 3.0,
  latestCandle,
  maxAllowedVolatility = 5.0,
  // Spread & Orderbook
  bid,
  ask,
  maxAllowedSpread = 0.25,
  quantity,
  orderBook,
  side = 'buy',
  maxAllowedSlippage = 0.15,
  maxPositionToLiquidityRatio = 0.05,
  // Frequency & Risk limits
  consecutiveLosses = 0,
  maxConsecutiveLosses = 3,
  dailyTradesCount = 0,
  maxDailyTrades = 10,
}) {
  // 1. Data Freshness
  const freshCheck = validateDataFreshness({ priceTimestamp, now, maxPriceAgeMs });
  if (!freshCheck.passed) return freshCheck;

  // 2. Price Spike
  if (referencePrice) {
    const spikeCheck = validatePriceSpike({ currentPrice, referencePrice, maxPriceMovePercent });
    if (!spikeCheck.passed) return spikeCheck;
  }

  // 3. Volatility
  if (latestCandle) {
    const volCheck = validateMarketVolatility({ candle: latestCandle, maxAllowedVolatility });
    if (!volCheck.passed) return volCheck;
  }

  // 4. Spread Check
  const spreadCheck = validateSpread({ bid, ask, maxAllowedSpread });
  if (!spreadCheck.passed) return spreadCheck;

  // 5. Liquidity & Slippage
  if (quantity && orderBook) {
    const liqCheck = validateLiquidityAndSlippage({
      quantity,
      orderBook,
      side,
      maxAllowedSlippage,
      maxPositionToLiquidityRatio,
    });
    if (!liqCheck.passed) return liqCheck;
  }

  // 6. Frequency Limits
  const freqCheck = validateTradeFrequencyLimits({
    consecutiveLosses,
    maxConsecutiveLosses,
    dailyTradesCount,
    maxDailyTrades,
  });
  if (!freqCheck.passed) return freqCheck;

  return {
    passed: true,
    reason: 'All pre-trade safety firewall checks passed successfully',
    rule: 'NONE',
  };
}

module.exports = {
  validateDataFreshness,
  validatePriceSpike,
  validateSpread,
  validateLiquidityAndSlippage,
  validateMarketVolatility,
  validateTradeFrequencyLimits,
  runComprehensivePreTradeValidation,
};
