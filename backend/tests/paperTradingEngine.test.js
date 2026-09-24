const { PaperTradingEngine } = require('../src/services/paperTradingEngine');

describe('PaperTradingEngine - Virtual Execution & Accounting', () => {
  let engine;

  beforeEach(() => {
    engine = new PaperTradingEngine({
      initialBalanceUSDT: 10000,
      initialBalanceINR: 100000,
      feePercent: 0.1,
      slippagePercent: 0.05,
    });
  });

  it('should initialize with correct virtual balances', () => {
    const balances = engine.getBalances();
    expect(balances.USDT).toBe(10000);
    expect(balances.INR).toBe(100000);
    expect(balances.BTC).toBe(0);
  });

  it('should execute BUY orders, deduct quote, credit base, and record filled order', async () => {
    const buyResult = await engine.executeBuy({
      pair: 'BTCUSDT',
      amountQuote: 2000,
      currentPrice: 80000,
      stopLossPercent: 2.0,
      takeProfitPercent: 4.0,
    });

    expect(engine.getBalances().USDT).toBe(8000);
    expect(engine.getBalances().BTC).toBeGreaterThan(0);
    expect(buyResult.order.status).toBe('filled');
    expect(buyResult.order.side).toBe('buy');
    expect(buyResult.position.stopLossPrice).toBeLessThan(buyResult.position.entryPrice);
    expect(buyResult.position.takeProfitPrice).toBeGreaterThan(buyResult.position.entryPrice);
  });

  it('should execute SELL orders, calculate accurate net P&L with fees', async () => {
    const buyResult = await engine.executeBuy({
      pair: 'BTCUSDT',
      amountQuote: 2000,
      currentPrice: 80000,
    });

    const sellResult = await engine.executeSell({
      pair: 'BTCUSDT',
      positionId: buyResult.position.positionId,
      currentPrice: 83000, // Sold higher
      reason: 'TAKE_PROFIT_TRIGGERED',
    });

    expect(sellResult.trade.profit).toBeGreaterThan(0);
    expect(sellResult.trade.fee).toBeGreaterThan(0);
    expect(engine.getBalances().USDT).toBeGreaterThan(10000);
    expect(engine.getPositionsWithPnL()).toHaveLength(0);
  });

  it('should calculate live unrealized P&L against market price', async () => {
    await engine.executeBuy({
      pair: 'BTCUSDT',
      amountQuote: 1000,
      currentPrice: 80000,
    });

    const positions = engine.getPositionsWithPnL({ BTCUSDT: 82000 });
    expect(positions).toHaveLength(1);
    expect(positions[0].unrealizedPnL).toBeGreaterThan(0);
  });

  it('should reject BUY orders exceeding available virtual balance', async () => {
    await expect(
      engine.executeBuy({
        pair: 'BTCUSDT',
        amountQuote: 50000, // Only 10,000 available
        currentPrice: 80000,
      })
    ).rejects.toThrow('Insufficient simulated USDT balance');
  });

  it('should reject SELL orders when no position or holdings exist', async () => {
    await expect(
      engine.executeSell({
        pair: 'ETHUSDT',
        currentPrice: 3000,
      })
    ).rejects.toThrow('No matching open position');
  });

  it('should execute SHORT order and calculate profitable cover with fees and slippage (Rule #44)', async () => {
    const shortResult = await engine.executeShort({
      pair: 'BTCUSDT',
      amountQuote: 2000,
      currentPrice: 80000,
      stopLossPercent: 1.5,
      takeProfitPercent: 3.0,
      leverage: 2,
    });

    expect(shortResult.order.side).toBe('short');
    expect(shortResult.position.side).toBe('short');
    expect(engine.getBalances().USDT).toBe(8000); // 10000 - 2000 margin

    // Price drops to 78000 -> profitable for short
    const coverResult = await engine.executeSell({
      pair: 'BTCUSDT',
      positionId: shortResult.position.positionId,
      currentPrice: 78000,
      reason: 'PROFIT_LOCK_TRIGGERED',
    });

    expect(coverResult.trade.side).toBe('short_then_cover');
    expect(coverResult.trade.profit).toBeGreaterThan(0);
    expect(coverResult.trade.fee).toBeGreaterThan(0);
    expect(engine.getBalances().USDT).toBeGreaterThan(10000); // Initial 10000 + profit
    expect(engine.getPositionsWithPnL()).toHaveLength(0);
  });

  it('should calculate live unrealized P&L correctly for SHORT positions', async () => {
    await engine.executeShort({
      pair: 'BTCUSDT',
      amountQuote: 1000,
      currentPrice: 80000,
    });

    // Market price drops to 78000 -> Short is in profit
    const profitableCheck = engine.getPositionsWithPnL({ BTCUSDT: 78000 });
    expect(profitableCheck[0].unrealizedPnL).toBeGreaterThan(0);

    // Market price rises to 82000 -> Short is in loss
    const lossCheck = engine.getPositionsWithPnL({ BTCUSDT: 82000 });
    expect(lossCheck[0].unrealizedPnL).toBeLessThan(0);
  });
});
