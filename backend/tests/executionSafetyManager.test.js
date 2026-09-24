const {
  generateTradeId,
  OrderLifecycleStates,
  handleOrderFill,
  RejectionReasons,
  handleOrderRejection,
  verifyProtectionOrder,
  recordExitSlippage,
  applyPrecisionAndVerifyRisk,
} = require('../src/trading/executionSafetyManager');

describe('Execution & Fill Safety Manager (Rules #67, #68, #69, #72, #76, #87)', () => {
  describe('Rule #87: Correlation ID / Trade ID Generator', () => {
    it('generates sequential Trade IDs with YYYYMMDD and prefix', () => {
      const fixedDate = new Date('2026-09-25T10:00:00Z');
      const id1 = generateTradeId('TRADE', fixedDate);
      const id2 = generateTradeId('TRADE', fixedDate);

      expect(id1).toMatch(/^TRADE-\d{8}-\d{4}$/);
      expect(id2).toMatch(/^TRADE-\d{8}-\d{4}$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('Rule #67: Partial Order Fill Handling', () => {
    it('handles full fill accurately (requested 1.5, filled 1.5)', () => {
      const result = handleOrderFill({
        requestedQuantity: 1.5,
        filledQuantity: 1.5,
        fillPrice: 80000,
        entryPrice: 80000,
        stopLossPrice: 79400,
      });

      expect(result.orderStatus).toBe(OrderLifecycleStates.FILLED);
      expect(result.remainingQuantity).toBe(0);
      expect(result.shouldCancelRemaining).toBe(false);
      expect(result.averageFillPrice).toBe(80000);
      expect(result.actualMonetaryRisk).toBe(900); // 1.5 * 600
    });

    it('handles partial fill correctly (requested 5000, filled 3000, remaining 2000)', () => {
      const result = handleOrderFill({
        requestedQuantity: 5000,
        filledQuantity: 3000,
        fillPrice: 100,
        entryPrice: 100,
        stopLossPrice: 99.25,
        policy: 'CANCEL_REMAINING',
      });

      expect(result.orderStatus).toBe(OrderLifecycleStates.PARTIALLY_FILLED);
      expect(result.remainingQuantity).toBe(2000);
      expect(result.shouldCancelRemaining).toBe(true);
      expect(result.log.REQUESTED_QUANTITY).toBe(5000);
      expect(result.log.FILLED_QUANTITY).toBe(3000);
      expect(result.log.REMAINING_QUANTITY).toBe(2000);
      expect(result.actualMonetaryRisk).toBe(2250); // 3000 * 0.75
    });

    it('calculates accurate weighted average price for multi-leg fills', () => {
      const fills = [
        { price: 100, quantity: 1000 },
        { price: 103, quantity: 2000 },
      ]; // (100000 + 206000) / 3000 = 102

      const result = handleOrderFill({
        requestedQuantity: 3000,
        filledQuantity: 3000,
        fills,
      });

      expect(result.averageFillPrice).toBe(102);
      expect(result.orderStatus).toBe(OrderLifecycleStates.FILLED);
    });
  });

  describe('Rule #68: Order Rejection Handling', () => {
    it('categorizes insufficient balance rejection and forbids blind retries', () => {
      const res = handleOrderRejection({
        error: new Error('Insufficient balance to execute market order'),
        orderPayload: { pair: 'BTCUSDT', quantity: 0.1, side: 'buy' },
        accountBalance: 50,
      });

      expect(res.orderStatus).toBe(OrderLifecycleStates.REJECTED);
      expect(res.rejectionCategory).toBe(RejectionReasons.INSUFFICIENT_BALANCE);
      expect(res.allowRetry).toBe(false);
      expect(res.auditEntry.category).toBe('INSUFFICIENT_BALANCE');
    });

    it('categorizes precision and minimum order requirement errors', () => {
      const res1 = handleOrderRejection({
        error: new Error('Precision error: decimal places exceed limit'),
      });
      expect(res1.rejectionCategory).toBe(RejectionReasons.PRECISION_ERROR);

      const res2 = handleOrderRejection({
        error: new Error('Minimum notional value must be at least 5 USDT'),
      });
      expect(res2.rejectionCategory).toBe(RejectionReasons.MIN_ORDER_REQUIREMENT);
    });
  });

  describe('Rule #69: Stop-Loss & Protection Order Failure Handling', () => {
    it('confirms PROTECTION_ACTIVE when exchange returns active protective order', () => {
      const mockOrder = {
        id: 'SL_ORD_123',
        status: 'open',
        quantity: 0.05,
      };

      const res = verifyProtectionOrder({
        protectionOrder: mockOrder,
        expectedPrice: 79400,
        expectedQuantity: 0.05,
      });

      expect(res.status).toBe('PROTECTION_ACTIVE');
      expect(res.protectionActive).toBe(true);
      expect(res.recommendedAction).toBe('CONTINUE_MONITORING');
    });

    it('returns PROTECTION_FAILED and emergency action when protection fails', () => {
      const res = verifyProtectionOrder({
        protectionOrder: null,
        expectedPrice: 79400,
        expectedQuantity: 0.05,
      });

      expect(res.status).toBe('PROTECTION_FAILED');
      expect(res.protectionActive).toBe(false);
      expect(res.recommendedAction).toBe('EMERGENCY_CLOSE_OR_RETRY');
    });
  });

  describe('Rule #72: Price Gap & Slippage Accounting', () => {
    it('records slippage on sudden market gaps and enforces planned risk disclaimer', () => {
      // Entry 100, Stop 99.50, Sudden market crash exits at 98.00
      const res = recordExitSlippage({
        expectedExitPrice: 99.50,
        actualExitPrice: 98.00,
        quantity: 100,
        side: 'buy',
      });

      expect(res.EXPECTED_EXIT_PRICE).toBe(99.50);
      expect(res.ACTUAL_EXIT_PRICE).toBe(98.00);
      expect(res.SLIPPAGE).toBe(1.50);
      expect(res.SLIPPAGE_LOSS).toBe(150.00);
      expect(res.statement).toBe('Maximum planned risk was 0.5%, subject to execution risk.');
    });
  });

  describe('Rule #76: Precision & Rounding Verification', () => {
    it('rounds down to step size and verifies risk remains within 0.5% cap', () => {
      const res = applyPrecisionAndVerifyRisk({
        theoreticalQuantity: 0.0987654,
        entryPrice: 100000,
        stopLossPrice: 99250, // 0.75% stop
        accountBalance: 20000, // 0.5% risk = 100 USDT max
        marketDetails: {
          target_currency_precision: 4,
          step: 0.0001,
          min_quantity: 0.001,
        },
        maxRiskPercent: 0.5,
      });

      expect(res.valid).toBe(true);
      expect(res.roundedQuantity).toBe(0.0987);
      expect(res.actualRiskPercent).toBeLessThanOrEqual(0.5);
    });

    it('rejects order if rounded quantity violates 0.5% risk limit', () => {
      const res = applyPrecisionAndVerifyRisk({
        theoreticalQuantity: 2.0,
        entryPrice: 100,
        stopLossPrice: 90, // 10 point stop loss
        accountBalance: 1000, // 0.5% of 1000 = 5 max risk
        marketDetails: { step: 1, min_quantity: 1 },
        maxRiskPercent: 0.5, // Max $5 risk, but 2 units * $10 = $20 risk (2%)
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain('violates risk limit');
    });

    it('rejects order if rounded quantity is below exchange minimum quantity', () => {
      const res = applyPrecisionAndVerifyRisk({
        theoreticalQuantity: 0.00005,
        entryPrice: 100000,
        stopLossPrice: 99000,
        accountBalance: 1000,
        marketDetails: { min_quantity: 0.001, step: 0.0001 },
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain('below exchange minimum');
    });
  });
});
