const fs = require('fs');
const path = require('path');
const {
  BotInstanceManager,
  ExchangeHealthMonitor,
  SymbolHealthMonitor,
  BalanceReconciliationEngine,
  StateReconciler,
  CrashRecoveryManager,
} = require('../src/trading/reconciliationManager');

describe('Reconciliation, Exchange Health & Instance Safety Manager (Rules #70, #71, #73, #74, #75, #77, #78, #79)', () => {
  const testLockFile = path.join(__dirname, '.test_bot_instance.lock');

  afterEach(() => {
    if (fs.existsSync(testLockFile)) {
      try {
        fs.unlinkSync(testLockFile);
      } catch {}
    }
  });

  describe('Rule #77: Multiple Bot Instance Protection', () => {
    it('should generate unique instance ID and acquire exclusive lock', () => {
      const manager = new BotInstanceManager({ lockFilePath: testLockFile });
      expect(manager.instanceId).toMatch(/^BOT-INST-/);

      const result = manager.acquireLock({ pair: 'BTCUSDT', mode: 'PAPER_TRADING' });
      expect(result.acquired).toBe(true);
      expect(manager.hasLock).toBe(true);
      expect(fs.existsSync(testLockFile)).toBe(true);

      manager.releaseLock();
      expect(manager.hasLock).toBe(false);
      expect(fs.existsSync(testLockFile)).toBe(false);
    });

    it('should prevent second bot instance from trading while first is active', () => {
      const instanceA = new BotInstanceManager({ lockFilePath: testLockFile });
      const instanceB = new BotInstanceManager({ lockFilePath: testLockFile });

      const resA = instanceA.acquireLock({ pair: 'BTCUSDT' });
      expect(resA.acquired).toBe(true);

      // Instance B tries to acquire lock while A is active
      const resB = instanceB.acquireLock({ pair: 'BTCUSDT' });
      expect(resB.acquired).toBe(false);
      expect(resB.reason).toBe('ANOTHER_ACTIVE_BOT_INSTANCE_RUNNING');
      expect(resB.activeInstanceId).toBe(instanceA.instanceId);

      // Clean up
      instanceA.releaseLock();
    });

    it('should renew heartbeat and update lockfile', () => {
      const manager = new BotInstanceManager({ lockFilePath: testLockFile });
      manager.acquireLock();
      const initialHeartbeat = manager.lockMetadata.lastHeartbeat;

      const renewed = manager.renewHeartbeat();
      expect(renewed).toBe(true);
      expect(manager.lockMetadata.lastHeartbeat).toBeGreaterThanOrEqual(initialHeartbeat);

      manager.releaseLock();
    });
  });

  describe('Rule #70: Exchange Maintenance & Health Monitor', () => {
    it('should track errors, detect maintenance, and halt new entries', () => {
      const monitor = new ExchangeHealthMonitor({ errorThreshold: 3 });
      expect(monitor.canOpenNewEntries()).toBe(true);

      // Record 1st error
      monitor.recordError(new Error('Connection timed out'));
      expect(monitor.status).toBe('DEGRADED');

      // Record 503 maintenance error
      const maintRes = monitor.recordError({
        message: 'Exchange under scheduled maintenance',
        response: { status: 503 }
      });

      expect(maintRes.status).toBe('MAINTENANCE');
      expect(maintRes.stopNewEntries).toBe(true);
      expect(monitor.canOpenNewEntries()).toBe(false);
    });

    it('should require reconciliation upon recovery before allowing new trades', () => {
      const monitor = new ExchangeHealthMonitor();
      monitor.recordError({ message: 'API Unavailable', response: { status: 502 } });
      expect(monitor.status).toBe('UNAVAILABLE');
      expect(monitor.canOpenNewEntries()).toBe(false);

      // Exchange comes back online
      const recovery = monitor.recordSuccess();
      expect(recovery.recovered).toBe(true);
      expect(recovery.needsReconciliation).toBe(true);
      // Invariant: Must NOT allow new entries yet
      expect(monitor.canOpenNewEntries()).toBe(false);

      // Complete reconciliation
      monitor.completeReconciliation();
      expect(monitor.status).toBe('HEALTHY');
      expect(monitor.canOpenNewEntries()).toBe(true);
    });
  });

  describe('Rule #71: Market Halt / Symbol Unavailable', () => {
    it('should halt new entries when trading pair is halted or inactive', () => {
      const activeCheck = SymbolHealthMonitor.checkSymbolAvailability('BTCUSDT', { status: 'active' });
      expect(activeCheck.available).toBe(true);
      expect(activeCheck.stopNewEntries).toBe(false);

      const haltedCheck = SymbolHealthMonitor.checkSymbolAvailability('BTCUSDT', { status: 'halted' });
      expect(haltedCheck.available).toBe(false);
      expect(haltedCheck.stopNewEntries).toBe(true);
      expect(haltedCheck.rule).toBe('MARKET_HALT_OR_UNAVAILABLE');
    });

    it('should handle missing market details safely', () => {
      const check = SymbolHealthMonitor.checkSymbolAvailability('ETHUSDT', null);
      expect(check.available).toBe(false);
      expect(check.stopNewEntries).toBe(true);
      expect(check.rule).toBe('SYMBOL_DETAILS_MISSING');
    });
  });

  describe('Rule #75: Balance Reconciliation', () => {
    it('should differentiate total vs available balance and account for locked/order margin', () => {
      const res = BalanceReconciliationEngine.reconcileBalance({
        totalBalance: 10000,
        availableBalance: 4000,
        lockedBalance: 3000,
        openOrderMargin: 1000,
        currentPositionValue: 2000,
        requiredMargin: 3500
      });

      // Total (10000) - Locked (3000) - Margin (1000) = 6000 unencumbered, but available is 4000
      // Usable capital = min(4000, 6000) = 4000 >= 3500 required -> PASS
      expect(res.passed).toBe(true);
      expect(res.usableCapital).toBe(4000);
      expect(res.breakdown.TOTAL_BALANCE).toBe(10000);
      expect(res.breakdown.AVAILABLE_BALANCE).toBe(4000);
      expect(res.breakdown.LOCKED_BALANCE).toBe(3000);
    });

    it('should reject trade if usable capital after accounting for locked funds is insufficient', () => {
      const res = BalanceReconciliationEngine.reconcileBalance({
        totalBalance: 10000,
        availableBalance: 1500, // Only 1500 freely available
        lockedBalance: 8000,
        openOrderMargin: 500,
        requiredMargin: 2000
      });

      expect(res.passed).toBe(false);
      expect(res.usableCapital).toBe(1500);
      expect(res.reason).toContain('Insufficient available funds');
    });
  });

  describe('Rules #73 & #74: State Reconciler & Manual Intervention Detection', () => {
    it('should detect unexpected position on exchange (Manual BUY / Rule #74)', () => {
      const localPositions = [];
      const exchangePositions = [{ pair: 'BTCUSDT', quantity: 0.05, side: 'buy', entryPrice: 65000 }];

      const recon = StateReconciler.reconcilePositions(localPositions, exchangePositions);
      expect(recon.inSync).toBe(false);
      expect(recon.mismatchDetected).toBe(true);
      expect(recon.pauseNewEntries).toBe(true);
      expect(recon.mismatches[0].type).toBe('UNEXPECTED_POSITION_DETECTED');
      // Exchange is source of truth
      expect(recon.reconciledPositions.length).toBe(1);
    });

    it('should detect manual close/sell on exchange (Rule #73)', () => {
      const localPositions = [{ positionId: 'POS-1', pair: 'BTCUSDT', quantity: 0.05, side: 'buy' }];
      const exchangePositions = []; // Closed on CoinDCX directly by user

      const recon = StateReconciler.reconcilePositions(localPositions, exchangePositions);
      expect(recon.inSync).toBe(false);
      expect(recon.pauseNewEntries).toBe(true);
      expect(recon.mismatches[0].type).toBe('MANUAL_CLOSE_DETECTED');
      expect(recon.reconciledPositions.length).toBe(0);
    });

    it('should detect manual stop loss modification on exchange', () => {
      const localPositions = [{ positionId: 'POS-1', pair: 'BTCUSDT', quantity: 0.05, stopLossPrice: 64000 }];
      const exchangePositions = [{ positionId: 'POS-1', pair: 'BTCUSDT', quantity: 0.05, stopLossPrice: 63500 }];

      const recon = StateReconciler.reconcilePositions(localPositions, exchangePositions);
      expect(recon.mismatchDetected).toBe(true);
      expect(recon.mismatches[0].type).toBe('MANUAL_STOP_MODIFICATION');
    });

    it('should report inSync when local matches exchange state perfectly', () => {
      const localPositions = [{ positionId: 'POS-1', pair: 'BTCUSDT', quantity: 0.05, stopLossPrice: 64000 }];
      const exchangePositions = [{ positionId: 'POS-1', pair: 'BTCUSDT', quantity: 0.05, stopLossPrice: 64000 }];

      const recon = StateReconciler.reconcilePositions(localPositions, exchangePositions);
      expect(recon.inSync).toBe(true);
      expect(recon.mismatches.length).toBe(0);
      expect(recon.pauseNewEntries).toBe(false);
    });
  });

  describe('Rules #78 & #79: Crash Recovery & Profit-Lock State Recovery', () => {
    it('should safely restore open position, peak profit, and profit lock ladder', () => {
      const persistentPositions = [
        {
          positionId: 'POS-101',
          pair: 'BTCUSDT',
          quantity: 0.02,
          entryPrice: 60000,
          highestPrice: 61800,
          peakProfitPercent: 3.0,
          lockedProfitPercent: 2.0,
          stopLossPrice: 61200,
        }
      ];

      const exchangePositions = [
        {
          pair: 'BTCUSDT',
          quantity: 0.02,
          entryPrice: 60000,
        }
      ];

      const persistentRisk = {
        currentDailyLoss: 45,
        dailyTradesCount: 3,
        consecutiveLosses: 1
      };

      const recovery = CrashRecoveryManager.restoreAndReconcile({
        persistentPositions,
        exchangePositions,
        persistentRiskState: persistentRisk,
        lastProcessedCandle: 1727200000000
      });

      expect(recovery.success).toBe(true);
      expect(recovery.pauseNewEntries).toBe(false);
      expect(recovery.restoredPositions.length).toBe(1);
      // Peak and lock preserved!
      expect(recovery.restoredPositions[0].peakProfitPercent).toBe(3.0);
      expect(recovery.restoredPositions[0].lockedProfitPercent).toBe(2.0);
      expect(recovery.restoredPositions[0].profitLockRecovered).toBe(true);
      // Risk restored
      expect(recovery.restoredRiskState.currentDailyLoss).toBe(45);
      expect(recovery.restoredRiskState.dailyTradesCount).toBe(3);
    });

    it('should pause entries and apply protective stop if profit lock state is corrupted (Rule #79)', () => {
      const corruptPositions = [
        {
          pair: 'BTCUSDT',
          quantity: 0.02,
          entryPrice: 0, // Corrupted entry price!
          currentPrice: 60000
        }
      ];

      const recovery = CrashRecoveryManager.restoreAndReconcile({
        persistentPositions: corruptPositions,
        exchangePositions: corruptPositions,
        defaultStopLossPercent: 0.75
      });

      expect(recovery.pauseNewEntries).toBe(true);
      expect(recovery.restoredPositions[0].profitLockRecovered).toBe(false);
      expect(recovery.restoredPositions[0].stopLossPrice).toBe(60000 * (1 - 0.0075));
      expect(recovery.warnings.length).toBeGreaterThan(0);
      expect(recovery.warnings[0]).toContain('PROFIT_LOCK_UNRECOVERABLE');
    });
  });
});
