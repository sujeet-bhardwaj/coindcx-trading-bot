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

  it('should trigger SELL signal when price falls below locked profit level', () => {
    const strategy = new EMARSIStrategy();
    const position = {
      pair: 'BTCUSDT',
      side: 'buy',
      entryPrice: 80000,
      peakProfitPercent: 1.2,
      lockedProfitPercent: 1.0,
    };

    const dummyCandles = new Array(60).fill({
      open: 80700,
      high: 80800,
      low: 80600,
      close: 80700,
      volume: 10,
    });

    const signal = strategy.generateSignal({
      candles: dummyCandles,
      currentPrice: 80700, // +0.875%, dropped below 1.0% lock
      position,
    });

    expect(signal.signal).toBe('SELL');
    expect(signal.reason).toContain('Profit-Lock');
  });

  it('should support swapping and retrieving modular strategies from registry', () => {
    const strategy = strategyRegistry.get('EMA_RSI');
    expect(strategy).toBeDefined();
    expect(strategy.name).toBe('EMA_RSI');
    expect(strategyRegistry.list()).toContain('EMA_RSI');
  });

  it('should generate SHORT signal on Bearish Crossover when allowShort is true and RSI is 30-50', () => {
    const strategy = new EMARSIStrategy({
      fastPeriod: 5,
      slowPeriod: 10,
      rsiPeriod: 5,
      rsiOversold: 30,
      rsiOverbought: 70,
      allowShort: true,
    });

    // Alternating prices with downward slope ensuring RSI is in 30-50 range
    const prices = [
      100, 101, 100, 101, 100, 101, 100, 99.5, 100, 99.2, 99.8, 99.0, 99.5, 98.8, 99.2, 98.5, 98.9, 98.2, 98.6, 98.0, 98.4, 97.9,
    ];
    const candles = prices.map((price, i) => ({
      open: price + 0.1,
      high: price + 0.2,
      low: price - 0.2,
      close: price,
      volume: 100,
      time: 1600000000000 + i * 60000,
    }));

    const signal = strategy.generateSignal({
      candles,
      currentPrice: 97.9,
      position: null,
    });

    expect(signal.signal).toBe('SHORT');
    expect(signal.reason).toContain('Bearish');
    expect(signal.indicators.rsi).toBeLessThanOrEqual(50);
    expect(signal.indicators.rsi).toBeGreaterThanOrEqual(30);
  });

  it('should trigger SELL for long position when technical indicator exit is breached (EMA bearish or RSI < 45)', () => {
    const strategy = new EMARSIStrategy({
      fastPeriod: 5,
      slowPeriod: 10,
      rsiPeriod: 5,
    });

    const position = {
      pair: 'BTCUSDT',
      side: 'buy',
      entryPrice: 80,
    };

    // Bearish down-trend
    const prices = [
      90, 90, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78, 77, 76, 75, 74, 73, 72, 71, 70,
    ];
    const candles = prices.map((price, i) => ({
      open: price + 0.2,
      high: price + 0.5,
      low: price - 0.5,
      close: price,
      volume: 100,
      time: 1600000000000 + i * 60000,
    }));

    const signal = strategy.generateSignal({
      candles,
      currentPrice: 80.2, // Still slightly positive price, but indicator broke down
      position,
    });

    expect(signal.signal).toBe('SELL');
    expect(signal.reason).toMatch(/EMA_EXIT|RSI_EXIT/);
  });
});
