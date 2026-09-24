const {
  validateDataFreshness,
  validatePriceSpike,
  validateSpread,
  validateLiquidityAndSlippage,
  validateMarketVolatility,
  validateTradeFrequencyLimits,
  runComprehensivePreTradeValidation,
} = require('../src/risk/preTradeValidator');

describe('Pre-Trade Safety Firewall Engine (Rules #33, #34, #35, #36, #37, #38, #50)', () => {
  const now = 1700000000000;

  describe('1. Stale Price Protection (Rule #34)', () => {
    it('should pass when price is fresh (< 5s)', () => {
      const res = validateDataFreshness({ priceTimestamp: now - 2000, now, maxPriceAgeMs: 5000 });
      expect(res.passed).toBe(true);
    });

    it('should reject when price is stale (> 5s)', () => {
      const res = validateDataFreshness({ priceTimestamp: now - 8000, now, maxPriceAgeMs: 5000 });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('STALE_PRICE_DATA');
    });
  });

  describe('2. Price Spike Protection (Rule #35)', () => {
    it('should pass when price move is within limit (e.g. 1% move)', () => {
      const res = validatePriceSpike({ currentPrice: 101, referencePrice: 100, maxPriceMovePercent: 3.0 });
      expect(res.passed).toBe(true);
    });

    it('should reject when sudden spike exceeds limit (e.g. 5% move vs 3% max)', () => {
      const res = validatePriceSpike({ currentPrice: 105, referencePrice: 100, maxPriceMovePercent: 3.0 });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('PRICE_SPIKE_PROTECTION');
    });
  });

  describe('3. Spread Protection (Rule #36)', () => {
    it('should pass when spread is tight (0.05%)', () => {
      // Bid: 100.00, Ask: 100.05 -> Spread: 0.05%
      const res = validateSpread({ bid: 100.00, ask: 100.05, maxAllowedSpread: 0.25 });
      expect(res.passed).toBe(true);
    });

    it('should reject when spread is too wide (0.50% vs 0.25% max)', () => {
      // Bid: 100.00, Ask: 100.50 -> Spread = 0.50%
      const res = validateSpread({ bid: 100.00, ask: 100.50, maxAllowedSpread: 0.25 });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('HIGH_SPREAD');
    });
  });

  describe('4. Liquidity & Slippage Protection (Rules #37 & #38)', () => {
    const mockOrderBook = {
      asks: [
        [100.0, 10], // level 1: 10 units @ 100
        [100.1, 10], // level 2: 10 units @ 100.1
        [100.2, 10], // level 3: 10 units @ 100.2
      ],
      bids: [
        [99.9, 10],
        [99.8, 10],
      ],
    };

    it('should pass when order quantity is small relative to orderbook liquidity', () => {
      // 1 unit out of 30 available depth = 3.3% (< 5% max ratio)
      const res = validateLiquidityAndSlippage({
        quantity: 1,
        orderBook: mockOrderBook,
        side: 'buy',
        maxPositionToLiquidityRatio: 0.05,
        maxAllowedSlippage: 0.15,
      });
      expect(res.passed).toBe(true);
    });

    it('should reject when order quantity is too large for book depth', () => {
      // 5 units out of 30 available = 16.7% (> 5% max ratio)
      const res = validateLiquidityAndSlippage({
        quantity: 5,
        orderBook: mockOrderBook,
        side: 'buy',
        maxPositionToLiquidityRatio: 0.05,
      });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('INSUFFICIENT_LIQUIDITY');
    });
  });

  describe('5. Volatility Filter (Rule #50)', () => {
    it('should pass when candle range is within normal bounds', () => {
      const candle = { high: 102, low: 100 }; // 2% range
      const res = validateMarketVolatility({ candle, maxAllowedVolatility: 5.0 });
      expect(res.passed).toBe(true);
    });

    it('should reject when candle range is excessively high', () => {
      const candle = { high: 110, low: 100 }; // 10% range (> 5% max)
      const res = validateMarketVolatility({ candle, maxAllowedVolatility: 5.0 });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('VOLATILITY_TOO_HIGH');
    });
  });

  describe('6. Trade Frequency & Consecutive Losses (Rules #15, #16, #17)', () => {
    it('should pause trading when 3 consecutive losses are reached', () => {
      const res = validateTradeFrequencyLimits({ consecutiveLosses: 3, maxConsecutiveLosses: 3 });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('CONSECUTIVE_LOSS_LIMIT');
    });

    it('should skip trading when daily trade limit is reached', () => {
      const res = validateTradeFrequencyLimits({ dailyTradesCount: 10, maxDailyTrades: 10 });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('DAILY_TRADE_LIMIT_REACHED');
    });
  });

  describe('7. Master Pre-Trade Firewall (Rule #33)', () => {
    it('should approve trade when all safety checks pass', () => {
      const res = runComprehensivePreTradeValidation({
        currentPrice: 100.5,
        priceTimestamp: now - 1000,
        now,
        referencePrice: 100.0,
        latestCandle: { high: 101, low: 99.5 },
        bid: 100.4,
        ask: 100.5,
        consecutiveLosses: 0,
        dailyTradesCount: 2,
      });
      expect(res.passed).toBe(true);
      expect(res.reason).toContain('passed successfully');
    });
  });
});
