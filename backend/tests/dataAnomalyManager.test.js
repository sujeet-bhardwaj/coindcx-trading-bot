const {
  DataAnomalyProtector,
  CandleGapDetector,
  LossCooldownManager,
  AntiMartingaleValidator,
} = require('../src/trading/dataAnomalyManager');
const { RiskManager } = require('../src/risk/riskManager');

describe('Data Anomaly, Candle Gap, UTC Daily Reset & Anti-Martingale Suite (Rules #80, #81, #82, #83, #84, #85)', () => {
  describe('Rule #80: Data Anomaly Protection', () => {
    it('should reject non-positive or NaN ticker prices (Action: SKIP_CYCLE)', () => {
      const resZero = DataAnomalyProtector.validateMarketData({ ticker: { last_price: 0 } });
      expect(resZero.valid).toBe(false);
      expect(resZero.action).toBe('SKIP_CYCLE');
      expect(resZero.reason).toBe('DATA_VALIDATION_FAILED');

      const resNaN = DataAnomalyProtector.validateMarketData({ ticker: { last_price: 'NaN' } });
      expect(resNaN.valid).toBe(false);
      expect(resNaN.action).toBe('SKIP_CYCLE');
    });

    it('should reject candles where High < Low or Close <= 0', () => {
      const corruptHighLow = [
        { time: 1000, open: 100, high: 90, low: 110, close: 95, volume: 10 },
      ];
      const resHL = DataAnomalyProtector.validateMarketData({ candles: corruptHighLow });
      expect(resHL.valid).toBe(false);
      expect(resHL.action).toBe('SKIP_CYCLE');
      expect(resHL.details).toContain('High (90) < Low (110)');

      const corruptClose = [
        { time: 1000, open: 100, high: 105, low: 95, close: 0, volume: 10 },
      ];
      const resClose = DataAnomalyProtector.validateMarketData({ candles: corruptClose });
      expect(resClose.valid).toBe(false);
      expect(resClose.action).toBe('SKIP_CYCLE');
    });

    it('should reject duplicate candle timestamps and out-of-sequence timestamps', () => {
      const duplicateCandles = [
        { time: 1000, open: 100, high: 105, low: 95, close: 100, volume: 10 },
        { time: 1000, open: 101, high: 106, low: 96, close: 101, volume: 12 }, // Duplicate!
      ];
      const resDup = DataAnomalyProtector.validateMarketData({ candles: duplicateCandles });
      expect(resDup.valid).toBe(false);
      expect(resDup.action).toBe('SKIP_CYCLE');
      expect(resDup.details).toContain('Duplicate candle detected');

      const outOfOrderCandles = [
        { time: 2000, open: 100, high: 105, low: 95, close: 100, volume: 10 },
        { time: 1000, open: 101, high: 106, low: 96, close: 101, volume: 12 }, // Earlier time!
      ];
      const resSeq = DataAnomalyProtector.validateMarketData({ candles: outOfOrderCandles });
      expect(resSeq.valid).toBe(false);
      expect(resSeq.action).toBe('SKIP_CYCLE');
      expect(resSeq.details).toContain('out of sequence');
    });

    it('should reject technical indicators when EMA or RSI is NaN', () => {
      const resEmaNaN = DataAnomalyProtector.validateMarketData({ indicators: { ema: NaN, rsi: 50 } });
      expect(resEmaNaN.valid).toBe(false);
      expect(resEmaNaN.action).toBe('SKIP_CYCLE');
      expect(resEmaNaN.details).toContain('EMA is NaN');

      const resRsiNaN = DataAnomalyProtector.validateMarketData({ indicators: { ema: 100, rsi: NaN } });
      expect(resRsiNaN.valid).toBe(false);
      expect(resRsiNaN.action).toBe('SKIP_CYCLE');
      expect(resRsiNaN.details).toContain('RSI is NaN');

      const resValid = DataAnomalyProtector.validateMarketData({ indicators: { ema: 100, rsi: 55 } });
      expect(resValid.valid).toBe(true);
      expect(resValid.action).toBe('PROCEED');
    });
  });

  describe('Rule #81: Candle Gap Detection', () => {
    it('should detect missing 15-minute candles and halt evaluation (Action: WAIT_FOR_VALID_DATA)', () => {
      const baseTime = 1727200000000;
      const interval15m = 15 * 60 * 1000; // 900,000 ms

      // 10:00, 10:15, [10:30 missing!], 10:45
      const candlesWithGap = [
        { time: baseTime, open: 100, high: 105, low: 95, close: 102 },
        { time: baseTime + interval15m, open: 102, high: 107, low: 101, close: 106 },
        { time: baseTime + (interval15m * 3), open: 106, high: 110, low: 104, close: 108 }, // Gap!
      ];

      const gapCheck = CandleGapDetector.detectGaps(candlesWithGap, '15m');
      expect(gapCheck.hasGap).toBe(true);
      expect(gapCheck.action).toBe('WAIT_FOR_VALID_DATA');
      expect(gapCheck.gaps.length).toBe(1);
      expect(gapCheck.gaps[0].missingCount).toBe(1);
      expect(gapCheck.reason).toContain('Candle gap detected: 1 missing candle');
    });

    it('should pass cleanly when candles are continuous and regular', () => {
      const baseTime = 1727200000000;
      const interval15m = 15 * 60 * 1000;

      const continuousCandles = [
        { time: baseTime, open: 100, high: 105, low: 95, close: 102 },
        { time: baseTime + interval15m, open: 102, high: 107, low: 101, close: 106 },
        { time: baseTime + (interval15m * 2), open: 106, high: 110, low: 104, close: 108 },
      ];

      const gapCheck = CandleGapDetector.detectGaps(continuousCandles, '15m');
      expect(gapCheck.hasGap).toBe(false);
      expect(gapCheck.action).toBe('PROCEED');
    });
  });

  describe('Rule #82: Daily Risk Reset in UTC', () => {
    it('should reset daily P&L and trade counter on UTC day rollover, but PRESERVE emergencyStop and consecutive losses', () => {
      const risk = new RiskManager({
        emergencyStop: true,
        consecutiveLosses: 2,
        consecutiveLossPause: true,
      });

      risk.currentDailyLoss = 80;
      risk.dailyTradesCount = 5;
      risk.dailyLossResetDateUtc = '2020-01-01'; // Past day to trigger rollover

      // Run internal reset check
      risk._checkDailyReset();

      const todayUtc = new Date().toISOString().slice(0, 10);
      expect(risk.dailyLossResetDateUtc).toBe(todayUtc);
      // Daily counters reset
      expect(risk.currentDailyLoss).toBe(0);
      expect(risk.dailyTradesCount).toBe(0);

      // Invariant: Emergency stop & consecutive loss pause are strictly PRESERVED
      expect(risk.emergencyStop).toBe(true);
      expect(risk.consecutiveLosses).toBe(2);
      expect(risk.consecutiveLossPause).toBe(true);
    });
  });

  describe('Rule #83: Consecutive Loss Persistence & Manual Reset', () => {
    it('should trigger consecutiveLossPause after 3 losses and require manual reset', () => {
      const risk = new RiskManager({
        botEnabled: true,
        maxConsecutiveLosses: 3,
        maxDailyLoss: 500,
      });

      // 1st Loss
      risk.recordRealizedPnL(-10, 0.01);
      expect(risk.consecutiveLosses).toBe(1);
      expect(risk.consecutiveLossPause).toBe(false);

      // 2nd Loss
      risk.recordRealizedPnL(-10, 0.01);
      expect(risk.consecutiveLosses).toBe(2);
      expect(risk.consecutiveLossPause).toBe(false);

      // 3rd Loss -> Limit reached!
      risk.recordRealizedPnL(-10, 0.01);
      expect(risk.consecutiveLosses).toBe(3);
      expect(risk.consecutiveLossPause).toBe(true);

      // Pre-trade check MUST block new trades
      const preCheck = risk.validateOrderPreCheck({ pair: 'BTCUSDT', side: 'buy', currentPrice: 50000, quantity: 0.01 });
      expect(preCheck.passed).toBe(false);
      expect(preCheck.rule).toBe('CONSECUTIVE_LOSS_LIMIT_CHECK');

      // Manual reset clears pause
      risk.resetConsecutiveLossPause();
      expect(risk.consecutiveLossPause).toBe(false);
      expect(risk.consecutiveLosses).toBe(0);
    });
  });

  describe('Rule #84: Cooldown After Loss', () => {
    it('should block new entries during loss cooldown period (e.g. 15 minutes)', () => {
      const risk = new RiskManager({
        botEnabled: true,
        lossCooldownMinutes: 15,
        maxDailyLoss: 500,
      });

      // Trade exits with loss
      risk.recordRealizedPnL(-25, 0.02);
      expect(risk.lastLossTime).toBeGreaterThan(0);

      // Attempt immediate new entry (revenge trading)
      const preCheck = risk.validateOrderPreCheck({ pair: 'BTCUSDT', side: 'buy', currentPrice: 50000, quantity: 0.01 });
      expect(preCheck.passed).toBe(false);
      expect(preCheck.rule).toBe('LOSS_COOLDOWN_CHECK');
      expect(preCheck.reason).toContain('Loss cooldown active');

      // Reset cooldown
      risk.resetLossCooldown();
      const postReset = risk.validateOrderPreCheck({ pair: 'BTCUSDT', side: 'buy', currentPrice: 50000, quantity: 0.01 });
      expect(postReset.passed).toBe(true);
    });
  });

  describe('Rule #85: No Martingale / Anti-Martingale Invariant', () => {
    it('should strictly prohibit increasing position size after a losing trade', () => {
      // Previous trade was a loss with quantity = 0.05
      const violation = AntiMartingaleValidator.validateTradeIndependence({
        plannedQuantity: 0.10, // Double position size!
        previousQuantity: 0.05,
        previousTradePnL: -50, // Loss
        plannedRiskPercent: 0.005,
      });

      expect(violation.valid).toBe(false);
      expect(violation.reason).toContain('ANTI_MARTINGALE_VIOLATION');
      expect(violation.reason).toContain('Position sizing scaled up from previous losing trade');
    });

    it('should allow normal or reduced position sizing after a loss', () => {
      const validSameSize = AntiMartingaleValidator.validateTradeIndependence({
        plannedQuantity: 0.05,
        previousQuantity: 0.05,
        previousTradePnL: -50,
        plannedRiskPercent: 0.005,
      });
      expect(validSameSize.valid).toBe(true);

      const validReducedSize = AntiMartingaleValidator.validateTradeIndependence({
        plannedQuantity: 0.03,
        previousQuantity: 0.05,
        previousTradePnL: -50,
        plannedRiskPercent: 0.005,
      });
      expect(validReducedSize.valid).toBe(true);
    });

    it('should strictly reject risk expansion beyond 0.5% ceiling', () => {
      const riskBreach = AntiMartingaleValidator.validateTradeIndependence({
        plannedQuantity: 0.05,
        previousQuantity: 0.05,
        previousTradePnL: 20,
        plannedRiskPercent: 0.01, // 1% risk!
        maxRiskCeiling: 0.005,
      });

      expect(riskBreach.valid).toBe(false);
      expect(riskBreach.reason).toContain('exceeds configured ceiling (0.50%)');
    });
  });
});
