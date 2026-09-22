const { RiskManager } = require('../src/risk/riskManager');

describe('RiskManager - Pre-Order Validation Pipeline', () => {
  let risk;
  const mockMarket = {
    symbol: 'BTCUSDT',
    status: 'active',
    min_quantity: 0.00001,
    min_notional: 5,
  };

  beforeEach(() => {
    risk = new RiskManager({
      botEnabled: true,
      emergencyStop: false,
      tradingMode: 'PAPER_TRADING',
      maxTradeAmount: 100,
      maxDailyLoss: 50,
      maxOpenPositions: 1,
      cooldownSeconds: 30,
    });
  });

  it('should block orders when EMERGENCY STOP is active (Highest priority check)', () => {
    risk.triggerEmergencyStop();
    const result = risk.validateOrderPreCheck({
      pair: 'BTCUSDT',
      side: 'buy',
      amountQuote: 50,
      currentPrice: 80000,
      marketDetails: mockMarket,
    });
    expect(result.passed).toBe(false);
    expect(result.rule).toBe('EMERGENCY_STOP_CHECK');
  });

  it('should block orders when the bot is stopped/disabled', () => {
    risk.setBotEnabled(false);
    const result = risk.validateOrderPreCheck({
      pair: 'BTCUSDT',
      side: 'buy',
      amountQuote: 50,
      currentPrice: 80000,
      marketDetails: mockMarket,
    });
    expect(result.passed).toBe(false);
    expect(result.rule).toBe('BOT_ENABLED_CHECK');
  });

  it('should block orders exceeding max trade amount limit', () => {
    const result = risk.validateOrderPreCheck({
      pair: 'BTCUSDT',
      side: 'buy',
      amountQuote: 250, // Limit is 100
      currentPrice: 80000,
      marketDetails: mockMarket,
    });
    expect(result.passed).toBe(false);
    expect(result.rule).toBe('MAX_TRADE_AMOUNT_CHECK');
  });

  it('should block new buy orders when maximum open positions is reached', () => {
    const result = risk.validateOrderPreCheck({
      pair: 'BTCUSDT',
      side: 'buy',
      amountQuote: 50,
      currentPrice: 80000,
      marketDetails: mockMarket,
      openPositionsCount: 1, // Max is 1
    });
    expect(result.passed).toBe(false);
    expect(result.rule).toBe('MAX_OPEN_POSITIONS_CHECK');
  });

  it('should block new buy orders during cooldown period', () => {
    risk.recordTradeExecution(Date.now() - 5000); // 5s ago, cooldown is 30s
    const result = risk.validateOrderPreCheck({
      pair: 'BTCUSDT',
      side: 'buy',
      amountQuote: 50,
      currentPrice: 80000,
      marketDetails: mockMarket,
      openPositionsCount: 0,
    });
    expect(result.passed).toBe(false);
    expect(result.rule).toBe('COOLDOWN_CHECK');
  });

  it('should block orders when daily loss limit is reached', () => {
    risk.recordRealizedPnL(-60); // Loss of $60 exceeds maxDailyLoss of $50
    const result = risk.validateOrderPreCheck({
      pair: 'BTCUSDT',
      side: 'buy',
      amountQuote: 50,
      currentPrice: 80000,
      marketDetails: mockMarket,
      openPositionsCount: 0,
    });
    expect(result.passed).toBe(false);
    expect(result.rule).toBe('MAX_DAILY_LOSS_CHECK');
  });

  it('should block orders when market status is suspended or inactive', () => {
    const result = risk.validateOrderPreCheck({
      pair: 'BTCUSDT',
      side: 'buy',
      amountQuote: 50,
      currentPrice: 80000,
      marketDetails: { ...mockMarket, status: 'suspended' },
    });
    expect(result.passed).toBe(false);
    expect(result.rule).toBe('MARKET_STATUS_CHECK');
  });

  it('should block orders below minimum order quantity', () => {
    const result = risk.validateOrderPreCheck({
      pair: 'BTCUSDT',
      side: 'buy',
      quantity: 0.000001, // Below min_quantity of 0.00001
      amountQuote: 5,
      currentPrice: 80000,
      marketDetails: mockMarket,
    });
    expect(result.passed).toBe(false);
    expect(result.rule).toBe('MIN_QUANTITY_CHECK');
  });

  it('should block orders below exchange minimum notional value', () => {
    const result = risk.validateOrderPreCheck({
      pair: 'BTCUSDT',
      side: 'buy',
      amountQuote: 2, // Below min_notional of 5
      currentPrice: 80000,
      marketDetails: mockMarket,
    });
    expect(result.passed).toBe(false);
    expect(result.rule).toBe('MIN_NOTIONAL_CHECK');
  });

  it('should allow orders to pass when all risk conditions are met', () => {
    const result = risk.validateOrderPreCheck({
      pair: 'BTCUSDT',
      side: 'buy',
      amountQuote: 50,
      currentPrice: 80000,
      marketDetails: mockMarket,
      openPositionsCount: 0,
    });
    expect(result.passed).toBe(true);
    expect(result.rule).toBe('NONE');
  });
});
