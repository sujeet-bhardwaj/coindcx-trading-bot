const {
  calculateEMA,
  calculateRSI,
  EMARSIStrategy,
  strategyRegistry,
} = require('../src/strategy/tradingStrategy');

describe('TradingStrategy Engine - Technical Indicators & Signals', () => {
  it('should accurately compute Exponential Moving Average (EMA)', () => {
    const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const ema = calculateEMA(prices, 5);

    expect(ema[3]).toBeNull();
    expect(ema[4]).toBe(12); // Initial SMA of first 5 numbers
    expect(ema[10]).toBeGreaterThanOrEqual(18);
  });

  it('should accurately compute Relative Strength Index (RSI)', () => {
    const prices = [44, 44.5, 45, 44.8, 45.2, 45.8, 46, 46.5, 47, 46.8, 47.5, 48, 48.5, 49, 49.5, 50];
    const rsi = calculateRSI(prices, 14);
    const lastRsi = rsi[rsi.length - 1];

    expect(lastRsi).toBeGreaterThan(70);
    expect(lastRsi).toBeLessThanOrEqual(100);
  });

  it('should generate BUY signal on Bullish Crossover when RSI is acceptable', () => {
    const strategy = new EMARSIStrategy({
      fastPeriod: 5,
      slowPeriod: 10,
      rsiPeriod: 5,
      rsiOverbought: 70,
    });

    const prices = [
      100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 90, 89.5, 90.5, 90, 91, 90.5, 91.5, 91, 92, 91.8, 92.5,
    ];
    const candles = prices.map((price, i) => ({
      open: price - 0.2,
      high: price + 0.5,
      low: price - 0.5,
      close: price,
      volume: 100,
      time: 1600000000000 + i * 60000,
    }));

    const signal = strategy.generateSignal({
      candles,
      currentPrice: 92.5,
      position: null,
    });

    expect(signal.signal).toBe('BUY');
    expect(signal.reason).toContain('Bullish Crossover');
    expect(signal.indicators.rsi).toBeLessThan(70);
  });

  it('should trigger SELL signal when Stop-Loss threshold is breached', () => {
    const strategy = new EMARSIStrategy();
    const position = {
      pair: 'BTCUSDT',
      side: 'buy',
      entryPrice: 80000,
      stopLossPrice: 78400, // 2% Stop Loss
      takeProfitPrice: 83200, // 4% Take Profit
    };

    const dummyCandles = new Array(60).fill({
      open: 78000,
      high: 78500,
      low: 77500,
      close: 78000,
      volume: 10,
    });

    const signal = strategy.generateSignal({
      candles: dummyCandles,
      currentPrice: 77900, // Breached below 78400
      position,
    });

    expect(signal.signal).toBe('SELL');
    expect(signal.reason).toContain('Stop-Loss');
  });

  it('should trigger SELL signal when Take-Profit threshold is reached', () => {
    const strategy = new EMARSIStrategy();
    const position = {
      pair: 'BTCUSDT',
      side: 'buy',
      entryPrice: 80000,
      stopLossPrice: 78400,
      takeProfitPrice: 83200,
    };

    const dummyCandles = new Array(60).fill({
      open: 83500,
      high: 84000,
      low: 83000,
      close: 83500,
      volume: 10,
    });

    const signal = strategy.generateSignal({
      candles: dummyCandles,
      currentPrice: 83500, // Reached above 83200
      position,
    });

    expect(signal.signal).toBe('SELL');
    expect(signal.reason).toContain('Take-Profit');
  });

  it('should support swapping and retrieving modular strategies from registry', () => {
    const strategy = strategyRegistry.get('EMA_RSI');
    expect(strategy).toBeDefined();
    expect(strategy.name).toBe('EMA_RSI');
    expect(strategyRegistry.list()).toContain('EMA_RSI');
  });
});
