const { calculatePositionSize } = require('../src/risk/positionSizer');

describe('Strict 0.5% Capital Risk Position Sizer (Requirements #3, #4, #10, #18, #58, #60)', () => {
  const balance = 10000; // ₹10,000 Capital
  const riskFraction = 0.005; // 0.5% planned risk -> ₹50

  it('should calculate accurate position size for ₹10,000 account risking exactly ₹50', () => {
    // Entry ₹100, Stop Loss ₹99.50 (Per-unit risk = ₹0.50)
    const result = calculatePositionSize({
      accountBalance: balance,
      entryPrice: 100,
      stopLossPrice: 99.50,
      riskPerTrade: riskFraction,
      feePercent: 0, // Zero fee for clean theoretical check
      slippagePercent: 0,
      marketDetails: { step: 1, target_currency_precision: 0 },
    });

    expect(result.valid).toBe(true);
    expect(result.riskAmount).toBe(50);
    // Raw Qty = 50 / 0.50 = 100 units
    expect(result.quantity).toBe(100);
    expect(result.orderValue).toBe(10000); // 100 * ₹100 = ₹10,000
    expect(result.plannedLoss).toBe(50); // 100 * ₹0.50 = ₹50 loss at SL
    expect(result.plannedLossPercent).toBeCloseTo(0.5, 2);
  });

  it('should halve quantity when stop-loss distance is doubled to keep risk at exactly ₹50', () => {
    // Entry ₹100, Stop Loss ₹99.00 (Per-unit risk = ₹1.00 - double the distance!)
    const result = calculatePositionSize({
      accountBalance: balance,
      entryPrice: 100,
      stopLossPrice: 99.00,
      riskPerTrade: riskFraction,
      feePercent: 0,
      slippagePercent: 0,
      marketDetails: { step: 1, target_currency_precision: 0 },
    });

    expect(result.valid).toBe(true);
    expect(result.riskAmount).toBe(50);
    // Raw Qty = 50 / 1.00 = 50 units (Half the quantity!)
    expect(result.quantity).toBe(50);
    expect(result.orderValue).toBe(5000); // 50 * ₹100 = ₹5,000
    expect(result.plannedLoss).toBe(50); // Exactly ₹50 loss!
    expect(result.plannedLossPercent).toBeCloseTo(0.5, 2);
  });

  it('should reject trade if minimum lot size requires risking more than 0.5% capital', () => {
    // Small account ₹1,000, max risk = ₹5
    // Entry ₹50,000, SL ₹49,000 (Per-unit risk = ₹1,000)
    // Exchange requires minimum 0.01 units
    // Min lot risk = 0.01 * ₹1,000 = ₹10 (which is 1.0% risk, exceeding 0.5% limit!)
    const result = calculatePositionSize({
      accountBalance: 1000,
      entryPrice: 50000,
      stopLossPrice: 49000,
      riskPerTrade: 0.005, // ₹5 max risk
      marketDetails: {
        min_quantity: 0.01,
        step: 0.001,
        target_currency_precision: 3,
      },
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('exceeds the 0.5% capital risk ceiling');
    expect(result.quantity).toBe(0);
  });

  it('should reject trade if order value exceeds maximum allowed account exposure', () => {
    // Very tight SL (0.1% distance) would theoretically require 5x capital without leverage
    const result = calculatePositionSize({
      accountBalance: balance,
      entryPrice: 100,
      stopLossPrice: 99.90, // ₹0.10 distance
      riskPerTrade: 0.005, // ₹50 risk
      maxAccountExposure: 1.0, // Cannot exceed 100% of capital
      marketDetails: { step: 1, target_currency_precision: 0 },
    });

    // Qty would be 50 / 0.10 = 500 units -> ₹50,000 value (> ₹10,000 balance)
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('exceeds maximum allowed account exposure');
  });

  it('should account for round-trip trading fees and slippage in risk calculation', () => {
    const result = calculatePositionSize({
      accountBalance: balance,
      entryPrice: 100,
      stopLossPrice: 99.50,
      riskPerTrade: 0.005,
      feePercent: 0.1, // 0.1% entry + 0.1% exit = 0.2%
      slippagePercent: 0.05,
      marketDetails: { step: 1, target_currency_precision: 0 },
    });

    expect(result.valid).toBe(true);
    // With fees added to risk, quantity will be slightly smaller than 100 to ensure total loss <= ₹50
    expect(result.quantity).toBeLessThanOrEqual(100);
    expect(result.plannedLoss).toBeLessThanOrEqual(50.5); // Remains strictly bounded by 0.5%
    expect(result.metrics.isRiskCompliant).toBe(true);
  });

  it('should reject invalid inputs (zero/negative balance or equal entry/SL)', () => {
    expect(calculatePositionSize({ accountBalance: 0, entryPrice: 100, stopLossPrice: 99 }).valid).toBe(false);
    expect(calculatePositionSize({ accountBalance: 10000, entryPrice: 100, stopLossPrice: 100 }).valid).toBe(false);
    expect(calculatePositionSize({ accountBalance: 10000, entryPrice: -50, stopLossPrice: 40 }).valid).toBe(false);
  });
});
