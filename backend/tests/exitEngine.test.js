const {
  evaluateExit,
  calculateLadderLock,
  parseProfitLockLevels,
} = require('../src/risk/exitEngine');

describe('ExitEngine - Stepped Profit-Lock Ladder & Hard Stop-Loss', () => {
  const defaultCfg = {
    maxLossPercent: 0.75,
    profitLockLevels: [0.5, 1, 2, 3, 4, 5],
    profitLockStepAfterLast: 1,
    lockBufferPercent: 0,
    breakevenTriggerPercent: 0,
  };

  describe('Ladder Level Calculation', () => {
    const levels = [0.5, 1, 2, 3, 4, 5];

    it('should return 0 for peak below first level (peak < 0.5)', () => {
      expect(calculateLadderLock(0, levels)).toBe(0);
      expect(calculateLadderLock(0.49, levels)).toBe(0);
    });

    it('should lock 0.5 when peak reaches 0.5 up to 0.99', () => {
      expect(calculateLadderLock(0.5, levels)).toBe(0.5);
      expect(calculateLadderLock(0.9, levels)).toBe(0.5);
      expect(calculateLadderLock(0.99, levels)).toBe(0.5);
    });

    it('should lock 1 when peak reaches 1.0 up to 1.99', () => {
      expect(calculateLadderLock(1.0, levels)).toBe(1);
      expect(calculateLadderLock(1.2, levels)).toBe(1);
      expect(calculateLadderLock(1.99, levels)).toBe(1);
    });

    it('should calculate peak 2.5 -> lock 2', () => {
      expect(calculateLadderLock(2.5, levels)).toBe(2);
    });

    it('should lock 3, 4, 5 at respective thresholds', () => {
      expect(calculateLadderLock(3.2, levels)).toBe(3);
      expect(calculateLadderLock(4.8, levels)).toBe(4);
      expect(calculateLadderLock(5.0, levels)).toBe(5);
      expect(calculateLadderLock(5.99, levels)).toBe(5);
    });

    it('should calculate peak 7.3 -> lock 7 with +1% steps after last level', () => {
      expect(calculateLadderLock(7.3, levels, 1)).toBe(7);
      expect(calculateLadderLock(6.0, levels, 1)).toBe(6);
      expect(calculateLadderLock(8.9, levels, 1)).toBe(8);
      expect(calculateLadderLock(12.5, levels, 1)).toBe(12);
    });
  });

  describe('Rule 1: Hard Stop-Loss (-0.74 holds, -0.75 sells)', () => {
    it('should HOLD when profit is -0.74% (entry 100, price 99.26)', () => {
      const pos = { entryPrice: 100, peakProfitPercent: 0, lockedProfitPercent: 0 };
      const res = evaluateExit(pos, 99.26, defaultCfg);

      expect(res.action).toBe('HOLD');
      expect(res.state.currentProfitPercent).toBeCloseTo(-0.74, 2);
      expect(res.state.lockedProfitPercent).toBe(0);
    });

    it('should SELL when profit is -0.75% (entry 100, price 99.25)', () => {
      const pos = { entryPrice: 100, peakProfitPercent: 0, lockedProfitPercent: 0 };
      const res = evaluateExit(pos, 99.25, defaultCfg);

      expect(res.action).toBe('SELL');
      expect(res.reason).toContain('Hard Stop-Loss');
      expect(res.state.currentProfitPercent).toBeCloseTo(-0.75, 2);
    });

    it('should SELL when loss exceeds -0.75% (e.g. -0.85%)', () => {
      const pos = { entryPrice: 100, peakProfitPercent: 0, lockedProfitPercent: 0 };
      const res = evaluateExit(pos, 99.15, defaultCfg);

      expect(res.action).toBe('SELL');
      expect(res.reason).toContain('Hard Stop-Loss');
    });
  });

  describe('Rule 2 & 3: Profit-Lock Ladder Transitions', () => {
    it('peak 0.5 then 0.49 sells', () => {
      // Step 1: Price reaches 100.50 (+0.50% peak)
      const pos = { entryPrice: 100, peakProfitPercent: 0, lockedProfitPercent: 0 };
      const step1 = evaluateExit(pos, 100.50, defaultCfg);

      expect(step1.action).toBe('HOLD');
      expect(step1.state.peakProfitPercent).toBeCloseTo(0.50, 2);
      expect(step1.state.lockedProfitPercent).toBe(0.50);

      // Step 2: Price pulls back to 100.49 (+0.49%), below lock of 0.50%
      const updatedPos = { ...pos, ...step1.state };
      const step2 = evaluateExit(updatedPos, 100.49, defaultCfg);

      expect(step2.action).toBe('SELL');
      expect(step2.reason).toContain('Profit-Lock');
      expect(step2.state.peakProfitPercent).toBeCloseTo(0.50, 2);
      expect(step2.state.lockedProfitPercent).toBe(0.50);
    });

    it('peak 0.9 then 0.6 holds', () => {
      // Step 1: Price reaches 100.90 (+0.90% peak) -> lock is 0.5%
      const pos = { entryPrice: 100, peakProfitPercent: 0, lockedProfitPercent: 0 };
      const step1 = evaluateExit(pos, 100.90, defaultCfg);

      expect(step1.action).toBe('HOLD');
      expect(step1.state.peakProfitPercent).toBeCloseTo(0.90, 2);
      expect(step1.state.lockedProfitPercent).toBe(0.50);

      // Step 2: Price pulls back to 100.60 (+0.60%) -> 0.60% >= 0.50% lock -> holds
      const updatedPos = { ...pos, ...step1.state };
      const step2 = evaluateExit(updatedPos, 100.60, defaultCfg);

      expect(step2.action).toBe('HOLD');
      expect(step2.state.peakProfitPercent).toBeCloseTo(0.90, 2);
      expect(step2.state.lockedProfitPercent).toBe(0.50);
    });

    it('peak 1.2 then 0.99 sells', () => {
      // Step 1: Price reaches 101.20 (+1.20% peak) -> lock is 1.0%
      const pos = { entryPrice: 100, peakProfitPercent: 0, lockedProfitPercent: 0 };
      const step1 = evaluateExit(pos, 101.20, defaultCfg);

      expect(step1.action).toBe('HOLD');
      expect(step1.state.peakProfitPercent).toBeCloseTo(1.20, 2);
      expect(step1.state.lockedProfitPercent).toBe(1.0);

      // Step 2: Price pulls back to 100.99 (+0.99%) -> 0.99% < 1.0% lock -> sells
      const updatedPos = { ...pos, ...step1.state };
      const step2 = evaluateExit(updatedPos, 100.99, defaultCfg);

      expect(step2.action).toBe('SELL');
      expect(step2.reason).toContain('Profit-Lock');
      expect(step2.state.lockedProfitPercent).toBe(1.0);
    });

    it('peak 2.5 -> lock 2', () => {
      const pos = { entryPrice: 100, peakProfitPercent: 0, lockedProfitPercent: 0 };
      const res = evaluateExit(pos, 102.50, defaultCfg);

      expect(res.action).toBe('HOLD');
      expect(res.state.peakProfitPercent).toBeCloseTo(2.50, 2);
      expect(res.state.lockedProfitPercent).toBe(2.0);
    });

    it('lock never decreases', () => {
      // Start with a position that already has lockedProfitPercent: 2.0 and peak: 2.5
      const pos = {
        entryPrice: 100,
        peakProfitPercent: 2.5,
        lockedProfitPercent: 2.0,
      };

      // Current price drops to 102.10 (+2.10%)
      const res = evaluateExit(pos, 102.10, defaultCfg);

      expect(res.action).toBe('HOLD');
      expect(res.state.lockedProfitPercent).toBe(2.0);
      expect(res.state.peakProfitPercent).toBe(2.5);

      // Even if evaluated at a lower price that triggers sell (e.g. 101.90), lock remains 2.0
      const sellRes = evaluateExit(pos, 101.90, defaultCfg);
      expect(sellRes.action).toBe('SELL');
      expect(sellRes.state.lockedProfitPercent).toBe(2.0);
      expect(sellRes.state.peakProfitPercent).toBe(2.5);
    });

    it('peak 7.3 -> lock 7', () => {
      const pos = { entryPrice: 100, peakProfitPercent: 0, lockedProfitPercent: 0 };
      const res = evaluateExit(pos, 107.30, defaultCfg);

      expect(res.action).toBe('HOLD');
      expect(res.state.peakProfitPercent).toBeCloseTo(7.30, 2);
      expect(res.state.lockedProfitPercent).toBe(7.0);

      // Drops to 106.95 (+6.95%) -> sells because < 7.0%
      const updatedPos = { ...pos, ...res.state };
      const sellRes = evaluateExit(updatedPos, 106.95, defaultCfg);
      expect(sellRes.action).toBe('SELL');
      expect(sellRes.state.lockedProfitPercent).toBe(7.0);
    });
  });

  describe('Rule 4: State Restore After Restart', () => {
    it('restores state accurately after bot restart without losing lock', () => {
      // Position simulated as loaded from MongoDB / PaperEngine after a bot restart:
      const restoredPosition = {
        positionId: 'POS_RESTORED_123',
        entryPrice: 50000,
        peakProfitPercent: 1.25,
        lockedProfitPercent: 1.0,
      };

      // Immediately upon restart, current price is $50,520 (+1.04%)
      // Above lock 1.0% -> should HOLD
      const tick1 = evaluateExit(restoredPosition, 50520, defaultCfg);
      expect(tick1.action).toBe('HOLD');
      expect(tick1.state.peakProfitPercent).toBeCloseTo(1.25, 2);
      expect(tick1.state.lockedProfitPercent).toBe(1.0);

      // Price drops to $50,490 (+0.98%)
      // Below lock 1.0% -> should immediately SELL
      const tick2 = evaluateExit(restoredPosition, 50490, defaultCfg);
      expect(tick2.action).toBe('SELL');
      expect(tick2.reason).toContain('Profit-Lock');
      expect(tick2.state.lockedProfitPercent).toBe(1.0);
    });
  });

  describe('Custom Configuration Options', () => {
    it('respects lockBufferPercent (sell threshold = level - buffer)', () => {
      const cfgWithBuffer = {
        ...defaultCfg,
        lockBufferPercent: 0.1, // lock 1.0% with 0.1% buffer -> sells at < 0.9%
      };
      const pos = { entryPrice: 100, peakProfitPercent: 1.2, lockedProfitPercent: 1.0 };

      // At 100.95 (+0.95%) -> 0.95% >= (1.0 - 0.1 = 0.90%) -> should HOLD
      const holdRes = evaluateExit(pos, 100.95, cfgWithBuffer);
      expect(holdRes.action).toBe('HOLD');

      // At 100.89 (+0.89%) -> 0.89% < 0.90% -> should SELL
      const sellRes = evaluateExit(pos, 100.89, cfgWithBuffer);
      expect(sellRes.action).toBe('SELL');
    });

    it('respects breakevenTriggerPercent when enabled', () => {
      const cfgWithBE = {
        ...defaultCfg,
        breakevenTriggerPercent: 0.40, // Exit if peaked >= 0.40% and falls to <= 0%
      };
      const pos = { entryPrice: 100, peakProfitPercent: 0.45, lockedProfitPercent: 0 };

      // Price at 100.10 (+0.10%) -> holds
      const holdRes = evaluateExit(pos, 100.10, cfgWithBE);
      expect(holdRes.action).toBe('HOLD');

      // Price at 100.00 (0.00%) -> sells
      const sellRes = evaluateExit(pos, 100.00, cfgWithBE);
      expect(sellRes.action).toBe('SELL');
      expect(sellRes.reason).toContain('Breakeven');
    });

    it('safely handles missing or invalid inputs', () => {
      expect(evaluateExit(null, 100).action).toBe('HOLD');
      expect(evaluateExit({ entryPrice: 0 }, 100).action).toBe('HOLD');
      expect(evaluateExit({ entryPrice: 100 }, 0).action).toBe('HOLD');
    });
  });

  describe('Short Position Support (Futures/Derivatives)', () => {
    it('calculates positive profit when price falls for SHORT positions', () => {
      const pos = {
        side: 'short',
        entryPrice: 100,
        peakProfitPercent: 0,
        lockedProfitPercent: 0,
      };
      // Price falls to 99.50 -> +0.50% profit
      const res = evaluateExit(pos, 99.50, defaultCfg);
      expect(res.action).toBe('HOLD');
      expect(res.state.currentProfitPercent).toBeCloseTo(0.50, 2);
      expect(res.state.peakProfitPercent).toBeCloseTo(0.50, 2);
      expect(res.state.lockedProfitPercent).toBe(0.50);
    });

    it('triggers EXIT for SHORT when price pulls back up below locked profit', () => {
      const pos = {
        side: 'short',
        entryPrice: 100,
        peakProfitPercent: 0.50,
        lockedProfitPercent: 0.50,
      };
      // Price bounces to 99.51 -> +0.49% profit -> drops below 0.50% lock
      const res = evaluateExit(pos, 99.51, defaultCfg);
      expect(res.action).toBe('SELL');
      expect(res.reason).toContain('Profit-Lock');
    });

    it('triggers Hard Stop-Loss for SHORT when price rises by >= 0.75%', () => {
      const pos = {
        side: 'short',
        entryPrice: 100,
        peakProfitPercent: 0,
        lockedProfitPercent: 0,
      };
      // Price rises to 100.75 -> -0.75% profit
      const res = evaluateExit(pos, 100.75, defaultCfg);
      expect(res.action).toBe('SELL');
      expect(res.reason).toContain('Hard Stop-Loss');
      expect(res.state.currentProfitPercent).toBeCloseTo(-0.75, 2);
    });
  });

  describe('Rule #47: Fee-Aware Net Profit Locking', () => {
    const feeCfg = {
      ...defaultCfg,
      feeAware: true,
      feeDeductionPercent: 0.20, // 0.20% round-trip fee
    };

    it('does NOT lock 0.5% when gross is +0.60% because net is only +0.40%', () => {
      const pos = { entryPrice: 100, peakProfitPercent: 0, lockedProfitPercent: 0 };
      // Price reaches 100.60 -> gross +0.60%, net = +0.40%
      const res = evaluateExit(pos, 100.60, feeCfg);
      expect(res.action).toBe('HOLD');
      expect(res.state.netProfitPercent).toBeCloseTo(0.40, 2);
      expect(res.state.peakProfitPercent).toBeCloseTo(0.40, 2);
      expect(res.state.lockedProfitPercent).toBe(0); // 0.40% < 0.50% lock level
    });

    it('locks 0.50% NET when gross reaches +0.75% (net +0.55%)', () => {
      const pos = { entryPrice: 100, peakProfitPercent: 0, lockedProfitPercent: 0 };
      // Price reaches 100.75 -> gross +0.75%, net = +0.55%
      const res = evaluateExit(pos, 100.75, feeCfg);
      expect(res.action).toBe('HOLD');
      expect(res.state.netProfitPercent).toBeCloseTo(0.55, 2);
      expect(res.state.peakProfitPercent).toBeCloseTo(0.55, 2);
      expect(res.state.lockedProfitPercent).toBe(0.50);
    });

    it('triggers exit when price pulls back and net profit drops below locked level', () => {
      const pos = {
        entryPrice: 100,
        peakProfitPercent: 0.55, // net peak
        lockedProfitPercent: 0.50, // net lock
      };
      // Price drops to 100.68 -> gross +0.68%, net = +0.48% (below 0.50% lock)
      const res = evaluateExit(pos, 100.68, feeCfg);
      expect(res.action).toBe('SELL');
      expect(res.reason).toContain('Profit-Lock');
      expect(res.reason).toContain('Net after 0.2% fee');
    });
  });
});
