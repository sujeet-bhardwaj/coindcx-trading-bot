const { ExchangeHealthMonitor, StateReconciler, CrashRecoveryManager } = require('../src/trading/reconciliationManager');
const { handleOrderFill, handleOrderRejection, recordExitSlippage } = require('../src/trading/executionSafetyManager');
const { CandleTracker } = require('../src/utils/candleValidator');
const { DataAnomalyProtector } = require('../src/trading/dataAnomalyManager');
const { validateConfiguration, verifyLiveTradingEligibility, maskSecret, sanitizeForLogging } = require('../src/config/envValidator');

describe('Chaos & Failure Testing Suite (Rule #100 & Final Master Flow)', () => {
  describe('Chaos 1: Exchange API goes offline / 502 / ECONNREFUSED', () => {
    it('should transition to UNAVAILABLE, set STOP_NEW_ENTRIES = true, and fail safely', () => {
      const monitor = new ExchangeHealthMonitor({ errorThreshold: 2 });
      expect(monitor.canOpenNewEntries()).toBe(true);

      // Simulate network disconnect / 502 error
      monitor.recordError({ message: 'connect ECONNREFUSED 127.0.0.1:443', response: { status: 502 } });
      expect(monitor.status).toBe('UNAVAILABLE');
      expect(monitor.stopNewEntries).toBe(true);
      expect(monitor.canOpenNewEntries()).toBe(false);

      // When recovered, requires reconciliation before trading
      const rec = monitor.recordSuccess();
      expect(rec.needsReconciliation).toBe(true);
      expect(monitor.canOpenNewEntries()).toBe(false);
    });
  });

  describe('Chaos 2: API returns HTTP 429 Too Many Requests', () => {
    it('should log rate-limit failure and halt order submission', () => {
      const monitor = new ExchangeHealthMonitor();
      const err429 = { message: 'Too Many Requests', response: { status: 429 } };

      const res = monitor.recordError(err429);
      expect(res.lastError.statusCode).toBe(429);
      expect(monitor.status).toBe('DEGRADED');
    });
  });

  describe('Chaos 3: Order partially filled', () => {
    it('should store actual filled quantity and cancel hanging unfilled balance', () => {
      const fillResult = handleOrderFill({
        requestedQuantity: 0.10,
        filledQuantity: 0.06,
        fillPrice: 65000,
        policy: 'CANCEL_REMAINING',
      });

      expect(fillResult.filledQuantity).toBe(0.06);
      expect(fillResult.remainingQuantity).toBe(0.04);
      expect(fillResult.orderStatus).toBe('PARTIALLY_FILLED');
      expect(fillResult.shouldCancelRemaining).toBe(true);
    });
  });

  describe('Chaos 4: Order rejected by exchange', () => {
    it('should record rejection reason and forbid blind retries', () => {
      const rejection = handleOrderRejection({
        error: { message: 'Insufficient balance to place order' },
        orderPayload: { pair: 'BTCUSDT', quantity: 0.05 },
      });

      expect(rejection.rejectionCategory).toBe('INSUFFICIENT_BALANCE');
      expect(rejection.allowRetry).toBe(false);
      expect(rejection.orderStatus).toBe('REJECTED');
    });
  });

  describe('Chaos 5: Extreme market price crash (Slippage beyond stop-loss)', () => {
    it('should record expected vs actual exit price and maintain non-guarantee statement', () => {
      // Entry: 100, Stop: 99.50, Sudden gap to 98
      const slippage = recordExitSlippage({
        expectedExitPrice: 99.50,
        actualExitPrice: 98.00,
        quantity: 10,
        side: 'buy',
      });

      expect(slippage.EXPECTED_EXIT_PRICE).toBe(99.50);
      expect(slippage.ACTUAL_EXIT_PRICE).toBe(98.00);
      expect(slippage.SLIPPAGE).toBe(1.50);
      expect(slippage.statement).toContain('Maximum planned risk was 0.5%, subject to execution risk.');
    });
  });

  describe('Chaos 6: Duplicate candles and duplicate responses received', () => {
    it('should reject duplicate completed candles safely', () => {
      const tracker = new CandleTracker();
      const candle = { time: 1727200000000, open: 100, high: 105, low: 95, close: 102 };

      const first = tracker.checkCandle(candle);
      expect(first.canProcess).toBe(true);
      tracker.recordProcessed(candle);

      // Same candle arrives again
      const second = tracker.checkCandle(candle);
      expect(second.canProcess).toBe(false);
      expect(second.reason).toContain('DUPLICATE_CANDLE_SKIPPED');
    });
  });

  describe('Chaos 7: Exchange position differs from local state (Manual trade / desync)', () => {
    it('should detect mismatch, treat exchange as source of truth, and halt new entries', () => {
      const localPositions = []; // Local thinks 0
      const exchangePositions = [{ pair: 'BTCUSDT', quantity: 0.05, side: 'buy' }]; // Exchange has 1

      const recon = StateReconciler.reconcilePositions(localPositions, exchangePositions);
      expect(recon.inSync).toBe(false);
      expect(recon.mismatchDetected).toBe(true);
      expect(recon.pauseNewEntries).toBe(true);
      expect(recon.mismatches[0].type).toBe('UNEXPECTED_POSITION_DETECTED');
    });
  });

  describe('Chaos 8: Corrupted market data (NaN / Negative / Inverted)', () => {
    it('should reject invalid market data with SKIP_CYCLE and DATA_VALIDATION_FAILED', () => {
      const corrupted = DataAnomalyProtector.validateMarketData({
        ticker: { last_price: -50 },
      });
      expect(corrupted.valid).toBe(false);
      expect(corrupted.action).toBe('SKIP_CYCLE');
      expect(corrupted.reason).toBe('DATA_VALIDATION_FAILED');
    });
  });

  describe('Chaos 9: Profit-lock state is missing / corrupted on crash restart', () => {
    it('should apply emergency fallback stop loss and halt new entries without inventing state', () => {
      const corruptState = [{ pair: 'BTCUSDT', quantity: 0.05, entryPrice: 0, currentPrice: 65000 }];
      const recovery = CrashRecoveryManager.restoreAndReconcile({
        persistentPositions: corruptState,
        exchangePositions: corruptState,
        defaultStopLossPercent: 0.75,
      });

      expect(recovery.pauseNewEntries).toBe(true);
      expect(recovery.restoredPositions[0].profitLockRecovered).toBe(false);
      expect(recovery.warnings[0]).toContain('PROFIT_LOCK_UNRECOVERABLE');
    });
  });

  describe('Chaos 10: Secret masking & Live Mode Confirmation Gate', () => {
    it('should mask sensitive credentials in logs and prevent unconfirmed live trading', () => {
      const secret = 'coindcx_secret_api_key_12345';
      const masked = maskSecret(secret);
      expect(masked).toBe('coi...345');

      const sanitized = sanitizeForLogging({ apiKey: 'my_secret_token_abcdef', publicPair: 'BTCUSDT' });
      expect(sanitized.apiKey).toBe('my_...def');
      expect(sanitized.publicPair).toBe('BTCUSDT');

      // Attempt live trading without explicit confirmation
      const liveCheck = verifyLiveTradingEligibility({
        tradingMode: 'LIVE_TRADING',
        apiKey: 'key',
        apiSecret: 'secret',
        emergencyStop: false,
        liveConfirmation: '', // Missing confirmation!
      });
      expect(liveCheck.eligible).toBe(false);
      expect(liveCheck.errors[0]).toContain("Explicit confirmation 'YES_I_UNDERSTAND' is required");
    });
  });
});
