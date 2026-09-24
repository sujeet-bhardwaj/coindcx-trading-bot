process.env.NODE_ENV = 'test';
const tradingBot = require('../src/bot/tradingBot');

// Mock CoinDCX Service to ensure absolute isolation and zero live exchange orders
class MockCoinDCXService {
  constructor() {
    this.createOrderCalls = [];
  }
  hasApiKey() {
    return this._hasKey !== undefined ? this._hasKey : true;
  }
  hasApiSecret() {
    return this._hasSecret !== undefined ? this._hasSecret : true;
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
    await tradingBot.switchTradingMode({ mode: 'PAPER_TRADING' });
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

  describe('Rule #20: Live Safety Confirmation Gate', () => {
    it('rejects switch to LIVE_TRADING without explicit confirmLiveRisk', async () => {
      await expect(
        tradingBot.switchTradingMode({ mode: 'LIVE_TRADING', confirmLiveRisk: false })
      ).rejects.toThrow('SAFETY GATE REJECTION: Switching to LIVE_TRADING requires explicit confirmation');
    });

    it('rejects switch to LIVE_TRADING when emergency stop is active', async () => {
      await tradingBot.emergencyStop();
      await expect(
        tradingBot.switchTradingMode({ mode: 'LIVE_TRADING', confirmLiveRisk: true })
      ).rejects.toThrow('Cannot switch to LIVE_TRADING while Emergency Stop is active');
    });

    it('rejects switch to LIVE_TRADING when CoinDCX credentials are missing', async () => {
      mockCoinDCX._hasKey = false;
      await expect(
        tradingBot.switchTradingMode({ mode: 'LIVE_TRADING', confirmLiveRisk: true })
      ).rejects.toThrow('CoinDCX API Key or API Secret is missing');
    });

    it('successfully switches to LIVE_TRADING when all 4 safety conditions pass', async () => {
      const res = await tradingBot.switchTradingMode({ mode: 'LIVE_TRADING', confirmLiveRisk: true });
      expect(res.success).toBe(true);
      expect(res.mode).toBe('LIVE_TRADING');
    });

    it('safely reverts back to PAPER_TRADING without restrictions', async () => {
      const res = await tradingBot.switchTradingMode({ mode: 'PAPER_TRADING' });
      expect(res.success).toBe(true);
      expect(res.mode).toBe('PAPER_TRADING');
    });
  });
});
