const {
  validateCandleStructure,
  getCompletedCandles,
  validateCandleSeries,
  CandleTracker,
} = require('../src/utils/candleValidator');

describe('15-Minute Candle Validation & Duplicate Protection (Rules #31, #32, #41)', () => {
  const baseTime = 1700000000000; // Fixed reference timestamp
  const fifteenMinMs = 15 * 60 * 1000;

  describe('validateCandleStructure', () => {
    it('should validate a normal positive OHLCV candle', () => {
      const candle = {
        time: baseTime,
        open: 100,
        high: 105,
        low: 99,
        close: 103,
        volume: 50,
      };
      const result = validateCandleStructure(candle);
      expect(result.valid).toBe(true);
    });

    it('should reject malformed candle where high < low', () => {
      const candle = {
        time: baseTime,
        open: 100,
        high: 95, // High less than low
        low: 99,
        close: 100,
        volume: 10,
      };
      const result = validateCandleStructure(candle);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('high (95) is less than low (99)');
    });

    it('should reject candles with non-positive prices', () => {
      const candle = {
        time: baseTime,
        open: 0,
        high: 10,
        low: 0,
        close: 5,
        volume: 1,
      };
      const result = validateCandleStructure(candle);
      expect(result.valid).toBe(false);
    });
  });

  describe('getCompletedCandles (Incomplete candle filtering)', () => {
    it('should filter out the currently forming candle whose close time > now', () => {
      // Candle 1: 10:00:00 - 10:15:00 (Open: baseTime)
      // Candle 2: 10:15:00 - 10:30:00 (Open: baseTime + 15m)
      const c1 = { time: baseTime, open: 100, high: 105, low: 98, close: 104, volume: 20 };
      const c2 = { time: baseTime + fifteenMinMs, open: 104, high: 106, low: 103, close: 105, volume: 10 };

      // Current time is 10:20:00 (halfway through Candle 2)
      const now = baseTime + fifteenMinMs + (5 * 60 * 1000);

      const completed = getCompletedCandles([c1, c2], '15m', now);

      // Candle 2 is still forming and MUST be dropped!
      expect(completed.length).toBe(1);
      expect(completed[0].time).toBe(baseTime);
    });

    it('should include candle once the 15-minute period is completely closed', () => {
      const c1 = { time: baseTime, open: 100, high: 105, low: 98, close: 104, volume: 20 };
      const c2 = { time: baseTime + fifteenMinMs, open: 104, high: 106, low: 103, close: 105, volume: 10 };

      // Current time is 10:30:01 (Candle 2 has now completed)
      const now = baseTime + (2 * fifteenMinMs) + 1000;

      const completed = getCompletedCandles([c1, c2], '15m', now);
      expect(completed.length).toBe(2);
    });
  });

  describe('validateCandleSeries', () => {
    it('should reject series with insufficient candle count for reliable EMA/RSI', () => {
      const mockCandles = Array.from({ length: 30 }, (_, i) => ({
        time: baseTime + i * fifteenMinMs,
        open: 100 + i,
        high: 105 + i,
        low: 99 + i,
        close: 102 + i,
        volume: 10,
      }));

      const check = validateCandleSeries(mockCandles, 52);
      expect(check.valid).toBe(false);
      expect(check.reason).toContain('Insufficient historical candles');
    });

    it('should approve valid series with >= 52 candles', () => {
      const mockCandles = Array.from({ length: 55 }, (_, i) => ({
        time: baseTime + i * fifteenMinMs,
        open: 100 + i,
        high: 105 + i,
        low: 99 + i,
        close: 102 + i,
        volume: 10,
      }));

      const check = validateCandleSeries(mockCandles, 52);
      expect(check.valid).toBe(true);
      expect(check.count).toBe(55);
    });
  });

  describe('CandleTracker (Duplicate Candle Protection - Rule #41)', () => {
    it('should allow first completed candle and block duplicate on next cycle', () => {
      const tracker = new CandleTracker();
      const candle = { time: baseTime, open: 100, high: 102, low: 98, close: 101, volume: 10 };

      // Cycle 1: First time seeing this candle
      const firstCheck = tracker.checkCandle(candle);
      expect(firstCheck.canProcess).toBe(true);

      // Record processed
      tracker.recordProcessed(candle);

      // Cycle 2 (e.g. 1 minute later, candle timestamp is still the same)
      const secondCheck = tracker.checkCandle(candle);
      expect(secondCheck.canProcess).toBe(false);
      expect(secondCheck.reason).toContain('DUPLICATE_CANDLE_SKIPPED');

      // Cycle 3: Next completed candle arrives (timestamp moves forward)
      const nextCandle = { time: baseTime + fifteenMinMs, open: 101, high: 104, low: 100, close: 103, volume: 15 };
      const nextCheck = tracker.checkCandle(nextCandle);
      expect(nextCheck.canProcess).toBe(true);
    });
  });
});
