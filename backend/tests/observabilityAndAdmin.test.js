const { AuditLogService } = require('../src/services/auditLogService');
const { NotificationService, AlertTypes, BaseNotificationProvider } = require('../src/services/notificationService');
const DailySummaryService = require('../src/services/dailySummaryService');
const BotHealthMonitor = require('../src/trading/botHealthMonitor');
const path = require('path');
const fs = require('fs');

describe('Observability, Audit, Notifications, Health & Admin Controls Suite (Rules #86, #88, #89, #90, #91, #92, #93)', () => {
  const testLogsDir = path.join(__dirname, '.test_logs');

  afterAll(() => {
    if (fs.existsSync(testLogsDir)) {
      try {
        fs.rmSync(testLogsDir, { recursive: true, force: true });
      } catch {}
    }
  });

  describe('Rule #86: Permanent Audit Log', () => {
    it('should format and store complete trade audit record with all mandatory fields', () => {
      const audit = new AuditLogService({ logsDir: testLogsDir });
      const tradeData = {
        TRADE_ID: 'TRADE-20260925-001',
        BOT_INSTANCE_ID: 'BOT-INST-999',
        SYMBOL: 'BTCUSDT',
        SIDE: 'buy',
        SIGNAL: 'EMA_CROSSOVER',
        ENTRY_PRICE: 65000,
        EXIT_PRICE: 65650,
        REQUESTED_QUANTITY: 0.05,
        FILLED_QUANTITY: 0.05,
        AVERAGE_FILL_PRICE: 65000,
        STOP_LOSS: 64512.5,
        HIGHEST_PRICE: 65800,
        HIGHEST_PROFIT: 1.23,
        LOCKED_PROFIT: 1.0,
        EXIT_REASON: 'PROFIT_LOCK_1.0%',
        FEES: 6.5,
        SLIPPAGE: 5.0,
        GROSS_PNL: 32.5,
        NET_PNL: 26.0,
        DAILY_PNL: 26.0,
      };

      const record = audit.recordTradeAudit(tradeData);
      expect(record.TRADE_ID).toBe('TRADE-20260925-001');
      expect(record.BOT_INSTANCE_ID).toBe('BOT-INST-999');
      expect(record.ENTRY_PRICE).toBe(65000);
      expect(record.NET_PNL).toBe(26.0);
      expect(record.FEES).toBe(6.5);
      expect(record.SLIPPAGE).toBe(5.0);

      const recent = audit.getRecentTrades();
      expect(recent.length).toBeGreaterThan(0);
      expect(recent[0].TRADE_ID).toBe('TRADE-20260925-001');
    });

    it('should record critical system events in audit log', () => {
      const audit = new AuditLogService({ logsDir: testLogsDir });
      const evt = audit.recordEventAudit('STATE_MISMATCH_DETECTED', { local: 0, exchange: 1 });
      expect(evt.EVENT_TYPE).toBe('STATE_MISMATCH_DETECTED');
      expect(evt.DETAILS.exchange).toBe(1);

      const events = audit.getRecentEvents();
      expect(events[0].EVENT_TYPE).toBe('STATE_MISMATCH_DETECTED');
    });
  });

  describe('Rules #88 & #89: Multi-Channel Notifications & Important Alerts', () => {
    it('should broadcast alerts to registered custom providers without throwing', async () => {
      const notify = new NotificationService();
      const mockCalls = [];

      class MockProvider extends BaseNotificationProvider {
        constructor() {
          super('mock_test');
        }
        async send(alert) {
          mockCalls.push(alert);
          return { success: true };
        }
      }

      notify.addProvider(new MockProvider());

      // Send critical alert
      await notify.sendAlert(AlertTypes.STOP_LOSS_TRIGGERED, {
        title: 'Stop Loss Hit',
        message: 'Position closed at stop loss',
        severity: 'WARN',
      });

      expect(mockCalls.length).toBe(1);
      expect(mockCalls[0].type).toBe(AlertTypes.STOP_LOSS_TRIGGERED);
      expect(mockCalls[0].severity).toBe('WARN');

      const recent = notify.getRecentAlerts();
      expect(recent.length).toBe(1);
      expect(recent[0].type).toBe(AlertTypes.STOP_LOSS_TRIGGERED);
    });
  });

  describe('Rule #90: Daily Summary Report', () => {
    it('should compile daily performance metrics and include disclaimer', () => {
      const sampleTrades = [
        { profit: 50, fee: 2, slippage: 1, reason: 'PROFIT_LOCK_1.0%' },
        { profit: -20, fee: 2, slippage: 2, reason: 'STOP_LOSS' },
        { profit: 30, fee: 2, slippage: 0.5, reason: 'SIGNAL_EXIT' },
      ];

      const report = DailySummaryService.generateReport({
        trades: sampleTrades,
        startingBalance: 1000,
        endingBalance: 1060,
        tradesSkipped: 4,
        riskActivations: 1,
        consecutiveLosses: 0,
        date: '2026-09-25',
      });

      expect(report.totalTrades).toBe(3);
      expect(report.winningTrades).toBe(2);
      expect(report.losingTrades).toBe(1);
      expect(report.winRate).toBe(66.67);
      expect(report.netPnL).toBe(60);
      expect(report.profitLockExits).toBe(1);
      expect(report.stopLossExits).toBe(1);
      expect(report.indicatorExits).toBe(1);
      expect(report.disclaimer).toContain('does not constitute a guarantee of future performance');
    });
  });

  describe('Rule #91: Bot Health Monitor & Heartbeat Liveness', () => {
    it('should record heartbeats and detect BOT_DOWN if heartbeat goes stale', () => {
      const monitor = new BotHealthMonitor({ heartbeatTimeoutMs: 500 }); // 500ms timeout for test

      monitor.recordHeartbeat({
        botRunning: true,
        apiStatus: 'HEALTHY',
        currentPnL: 1.5,
      });

      // Immediate check should be alive
      const liveCheck = monitor.checkLiveness(Date.now());
      expect(liveCheck.isAlive).toBe(true);

      // Check after timeout elapsed
      const downCheck = monitor.checkLiveness(Date.now() + 1000);
      expect(downCheck.isAlive).toBe(false);
      expect(downCheck.alertType).toBe('BOT_DOWN');
      expect(downCheck.reason).toContain('BOT_DOWN');
    });
  });

  describe('Rule #92: System Health Dashboard Payload', () => {
    it('should format all mandatory fields in dashboard payload', () => {
      const monitor = new BotHealthMonitor();
      const mockBot = {
        isRunning: true,
        exchangeHealthMonitor: { status: 'HEALTHY' },
        lastPriceUpdate: Date.now(),
        currentPrice: 65000,
        activePositions: [
          {
            pair: 'BTCUSDT',
            side: 'buy',
            quantity: 0.05,
            entryPrice: 64000,
            lockedProfitPercent: 1.0,
            peakProfitPercent: 1.5,
          },
        ],
        riskManager: {
          currentDailyLoss: 15,
          maxDailyLoss: 100,
          dailyTradesCount: 3,
          consecutiveLosses: 1,
          emergencyStop: false,
        },
        candleTracker: { lastProcessedCandleTimeStr: '2026-09-25T00:00:00.000Z' },
        lastBuy: { time: Date.now() },
        lastError: null,
      };

      const dashboard = monitor.getHealthDashboard(mockBot);
      expect(dashboard.BOT_STATUS).toBe('RUNNING');
      expect(dashboard.API_STATUS).toBe('HEALTHY');
      expect(dashboard.MARKET_DATA_STATUS).toBe('LIVE');
      expect(dashboard.CURRENT_POSITION.pair).toBe('BTCUSDT');
      expect(dashboard.PROFIT_LOCK_STATUS).toContain('LOCKED_AT_1.00%');
      expect(dashboard.EMERGENCY_STOP_STATUS).toBe('INACTIVE');
      expect(dashboard.CONSECUTIVE_LOSSES).toBe(1);
    });
  });
});
