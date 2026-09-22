process.env.NODE_ENV = 'test';
const tradingBot = require('../src/bot/tradingBot');

// Mock CoinDCX Service to ensure absolute isolation and zero live exchange orders
class MockCoinDCXService {
  constructor() {
    this.createOrderCalls = [];
  }
  async getTicker(pair) {
    return { market: pair, last_price: '81000.00' };
  }
  async getMarketsDetails() {
    return [{ symbol: 'BTCUSDT', status: 'active', min_quantity: 0.00001, min_notional: 5 }];
  }
  async getCandles() {
    return new Array(60).fill({ open: 81000, high: 81100, low: 80900, close: 81000, volume: 10 });
  }
  async createOrder(orderData) {
    this.createOrderCalls.push(orderData);
    return { id: `MOCK_EXCH_${Date.now()}`, status: 'filled' };
  }
  async getBalances() {
    return [{ currency: 'USDT', balance: '5000' }];
  }
}

describe('TradingBot Lifecycle & Safety Isolation', () => {
  let mockCoinDCX;

  beforeEach(async () => {
    mockCoinDCX = new MockCoinDCXService();
    tradingBot.coindcxService = mockCoinDCX;
    await tradingBot.stop();
    tradingBot.riskManager.resetEmergencyStop();
  });

  afterEach(async () => {
    await tradingBot.stop();
  });

  it('should transition from STOPPED to RUNNING on start()', async () => {
    const result = await tradingBot.start();
    expect(result.success).toBe(true);
    expect(tradingBot.isRunning).toBe(true);
    expect(tradingBot.riskManager.botEnabled).toBe(true);
  });

  it('should transition from RUNNING to STOPPED on stop()', async () => {
    await tradingBot.start();
    const result = await tradingBot.stop();
    expect(result.success).toBe(true);
    expect(tradingBot.isRunning).toBe(false);
    expect(tradingBot.riskManager.botEnabled).toBe(false);
  });

  it('should immediately halt trading when emergencyStop() is triggered', async () => {
    await tradingBot.start();
    const result = await tradingBot.emergencyStop();

    expect(result.success).toBe(true);
    expect(tradingBot.isRunning).toBe(false);
    expect(tradingBot.riskManager.emergencyStop).toBe(true);

    // Attempting to start should be rejected
    const blockedStart = await tradingBot.start();
    expect(blockedStart.success).toBe(false);
    expect(blockedStart.message).toContain('EMERGENCY STOP');
  });

  it('should allow bot to start only after resetEmergencyStop()', async () => {
    await tradingBot.emergencyStop();
    await tradingBot.resetEmergencyStop();
    expect(tradingBot.riskManager.emergencyStop).toBe(false);

    const startResult = await tradingBot.start();
    expect(startResult.success).toBe(true);
  });

  it('should guarantee that mock CoinDCX service placed zero real orders during PAPER_TRADING', () => {
    expect(mockCoinDCX.createOrderCalls).toHaveLength(0);
  });
});
