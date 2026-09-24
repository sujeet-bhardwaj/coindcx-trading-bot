const backtestService = require('../src/services/backtestService');

describe('BacktestService - Advanced Historical Simulation Engine', () => {
  let originalGetCandles;

  beforeAll(() => {
    originalGetCandles = backtestService.marketService.getCandles;
  });

  afterAll(() => {
    backtestService.marketService.getCandles = originalGetCandles;
  });

  // Helper to generate realistic oscillating/trending candle data
  function generateCandles(count = 100, startPrice = 100, trend = 'up') {
    const candles = [];
    let price = startPrice;

    for (let i = 0; i < count; i++) {
      if (i < 30) {
        // Flat consolidation
        price += Math.sin(i) * 0.15;
      } else if (trend === 'up') {
        // Gentle bullish expansion then pullback
        if (i < 65) price += 0.2 + (i % 2 === 0 ? 0.2 : -0.2);
        else price -= 0.35;
      } else if (trend === 'down') {
        // Gentle bearish contraction then bounce
        if (i < 65) price -= 0.2 + (i % 2 === 0 ? 0.2 : -0.2);
        else price += 0.35;
      }

      candles.push({
        open: price - (trend === 'down' ? -0.1 : 0.1),
        high: price + 0.25,
        low: price - 0.25,
        close: price,
        volume: 100 + i * 2,
        time: 1600000000000 + i * 900000, // 15m intervals
      });
    }
    return candles;
  }

  it('runs backtest simulation and computes comprehensive risk & fee metrics', async () => {
    const mockCandles = generateCandles(100, 100, 'up');
    backtestService.marketService.getCandles = jest.fn().mockResolvedValue(mockCandles);

    const result = await backtestService.runBacktest({
      pair: 'BTCUSDT',
      strategyName: 'EMA_RSI',
      initialBalance: 10000,
      tradeAmount: 200,
      feePercent: 0.1,
      slippagePercent: 0.05,
    });

    expect(result.success).toBe(true);
    expect(result.summary).toBeDefined();
    expect(result.summary.pair).toBe('BTCUSDT');
    expect(result.summary.candleCount).toBe(100);
    expect(result.summary.totalTrades).toBeGreaterThanOrEqual(1);
    expect(result.summary.winRatePercent).toBeGreaterThanOrEqual(0);
    expect(result.summary.profitFactor).toBeDefined();
    expect(result.summary.expectancy).toBeDefined();
    expect(result.summary.totalFeesPaid).toBeGreaterThan(0);
    expect(result.summary.totalSlippagePaid).toBeGreaterThan(0);
    expect(Array.isArray(result.trades)).toBe(true);
  });

  it('supports Fee-Aware Net Profit Locking in backtest simulation (Rule #47)', async () => {
    const mockCandles = generateCandles(100, 100, 'up');
    backtestService.marketService.getCandles = jest.fn().mockResolvedValue(mockCandles);

    const result = await backtestService.runBacktest({
      pair: 'BTCUSDT',
      strategyName: 'EMA_RSI',
      initialBalance: 10000,
      tradeAmount: 200,
      feeAware: true,
      feeDeductionPercent: 0.2,
    });

    expect(result.success).toBe(true);
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
  });

  it('supports SHORT trades when allowShort is enabled in backtest (Rule #44)', async () => {
    // Generate downtrend candles
    const mockCandles = generateCandles(100, 100, 'down');
    backtestService.marketService.getCandles = jest.fn().mockResolvedValue(mockCandles);

    const result = await backtestService.runBacktest({
      pair: 'BTCUSDT',
      strategyName: 'EMA_RSI',
      initialBalance: 10000,
      tradeAmount: 200,
      allowShort: true,
    });

    expect(result.success).toBe(true);
    expect(result.summary.shortTradesCount).toBeGreaterThanOrEqual(1);
    const shortTrade = result.trades.find((t) => t.side === 'SHORT');
    expect(shortTrade).toBeDefined();
  });

  it('supports 0.5% capital risk dynamic position sizing in backtest (Rules #3, #58)', async () => {
    const mockCandles = generateCandles(100, 100, 'up');
    backtestService.marketService.getCandles = jest.fn().mockResolvedValue(mockCandles);

    const result = await backtestService.runBacktest({
      pair: 'BTCUSDT',
      strategyName: 'EMA_RSI',
      initialBalance: 10000,
      useRiskSizing: true,
      riskPerTradePercent: 0.5, // 0.5% max risk
      maxLossPercent: 0.75,
    });

    expect(result.success).toBe(true);
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
    // Margin allocated must be strictly bounded
    for (const t of result.trades) {
      expect(t.margin).toBeLessThanOrEqual(10000);
    }
  });

  it('throws descriptive error if candles are insufficient', async () => {
    backtestService.marketService.getCandles = jest.fn().mockResolvedValue([
      { open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
    ]);

    await expect(
      backtestService.runBacktest({ pair: 'BTCUSDT', limit: 10 })
    ).rejects.toThrow('Insufficient historical candles');
  });
});
