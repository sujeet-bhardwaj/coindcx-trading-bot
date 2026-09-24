/**
 * Unified Exit Engine: Hard Max-Loss + Stepped Profit-Lock Ladder
 * Pure function: No I/O, fully unit-testable.
 */

/**
 * Parses profit lock levels from an array or comma-separated string
 * @param {number[]|string} levels
 * @returns {number[]} Sorted ascending array of unique positive numbers
 */
function parseProfitLockLevels(levels) {
  if (Array.isArray(levels)) {
    return [...levels].map(Number).filter((n) => !isNaN(n) && n > 0).sort((a, b) => a - b);
  }
  if (typeof levels === 'string') {
    return levels
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n) && n > 0)
      .sort((a, b) => a - b);
  }
  return [0.5, 1, 2, 3, 4, 5];
}

/**
 * Calculates the stepped lock level for a given peak profit percentage
 * Levels = [0.5, 1, 2, 3, 4, 5], and after the last level continue in +stepAfterLast% steps.
 * (e.g. 7.3% peak with step 1 -> lock 7)
 *
 * @param {number} peak - Peak profit percent
 * @param {number[]} levels - Defined ladder levels (e.g. [0.5, 1, 2, 3, 4, 5])
 * @param {number} stepAfterLast - Step increment after the last defined level (default 1)
 * @returns {number} The locked profit percent (0 if peak < levels[0])
 */
function calculateLadderLock(peak, levels, stepAfterLast = 1) {
  if (!levels || levels.length === 0 || peak < levels[0]) {
    return 0;
  }

  const lastLevel = levels[levels.length - 1];
  if (peak > lastLevel) {
    const step = stepAfterLast > 0 ? stepAfterLast : 1;
    const additionalSteps = Math.floor((peak - lastLevel) / step);
    return lastLevel + additionalSteps * step;
  }

  // Find highest level <= peak
  let lock = levels[0];
  for (let i = 0; i < levels.length; i++) {
    if (levels[i] <= peak) {
      lock = levels[i];
    } else {
      break;
    }
  }
  return lock;
}

/**
 * Evaluates whether an open long position should be held or sold.
 *
 * RULES:
 * 1. Hard stop-loss: if profit% <= -maxLossPercent -> market-sell immediately.
 * 2. Profit-lock ladder: track peakProfitPercent. lockedProfitPercent = highest level <= peak.
 *    The lock only moves up, never down.
 * 3. If lockedProfitPercent > 0 and current profit% < (lockedProfitPercent - buffer) -> market-sell immediately.
 * 4. Before first lock level (peak < firstLevel), only rule 1 applies.
 * 5. Time-based exits and fixed TP ceilings are disabled by default.
 *
 * @param {Object} position - Position data ({ entryPrice, peakProfitPercent, lockedProfitPercent, ... })
 * @param {number} price - Current market price
 * @param {Object} [cfg={}] - Configuration options
 * @returns {{
 *   action: 'HOLD' | 'SELL',
 *   reason: string,
 *   state: {
 *     peakProfitPercent: number,
 *     lockedProfitPercent: number,
 *     currentProfitPercent: number
 *   }
 * }}
 */
function evaluateExit(position, price, cfg = {}) {
  const entryPrice = position?.entryPrice;
  if (!entryPrice || entryPrice <= 0 || !price || price <= 0) {
    return {
      action: 'HOLD',
      reason: 'Invalid entry price or market price for exit evaluation',
      state: {
        peakProfitPercent: position?.peakProfitPercent || 0,
        lockedProfitPercent: position?.lockedProfitPercent || 0,
        currentProfitPercent: 0,
      },
    };
  }

  // Calculate current price-move % from entry (supports both LONG and SHORT - Rules #45, #46)
  const isShort = position?.side === 'short';
  const currentProfitPercent = isShort
    ? ((entryPrice - price) / entryPrice) * 100
    : ((price - entryPrice) / entryPrice) * 100;

  // Track highest price for Long and lowest price for Short (Rules #45, #46)
  const prevHighest = position?.highestPrice || entryPrice;
  const highestPrice = isShort ? entryPrice : Math.max(prevHighest, price);
  const prevLowest = position?.lowestPrice || entryPrice;
  const lowestPrice = isShort ? Math.min(prevLowest, price) : entryPrice;

  // Configuration with strict defaults
  const maxLossPercent = cfg.maxLossPercent !== undefined ? Number(cfg.maxLossPercent) : 0.75;
  const levels = parseProfitLockLevels(cfg.profitLockLevels || [0.5, 1, 2, 3, 4, 5]);
  const stepAfterLast = cfg.profitLockStepAfterLast !== undefined ? Number(cfg.profitLockStepAfterLast) : 1;
  const buffer = cfg.lockBufferPercent !== undefined ? Number(cfg.lockBufferPercent) : 0;
  const breakevenTriggerPercent = cfg.breakevenTriggerPercent !== undefined ? Number(cfg.breakevenTriggerPercent) : 0;

  // Fee-aware net profit tracking (Rule #47)
  const feeDeductionPercent = cfg.feeDeductionPercent !== undefined ? Number(cfg.feeDeductionPercent) : 0;
  const isFeeAware = Boolean(cfg.feeAware || feeDeductionPercent > 0);
  const netProfitPercent = currentProfitPercent - feeDeductionPercent;
  const effectiveProfitPercent = isFeeAware ? netProfitPercent : currentProfitPercent;

  // Track peak profit percent: only moves up, never down
  const prevPeak = position.peakProfitPercent !== undefined && position.peakProfitPercent !== null
    ? Number(position.peakProfitPercent)
    : 0;
  const peakProfitPercent = Math.max(prevPeak, effectiveProfitPercent);

  // Calculate candidate lock from current peak
  const candidateLock = calculateLadderLock(peakProfitPercent, levels, stepAfterLast);

  // Locked profit percent: only moves up, never down
  const prevLock = position.lockedProfitPercent !== undefined && position.lockedProfitPercent !== null
    ? Number(position.lockedProfitPercent)
    : 0;
  const lockedProfitPercent = Math.max(prevLock, candidateLock);

  const state = {
    peakProfitPercent,
    lockedProfitPercent,
    currentProfitPercent,
    netProfitPercent,
    feeDeductionPercent,
    isFeeAware,
    highestPrice,
    lowestPrice,
    side: isShort ? 'short' : 'buy',
  };

  // RULE 1: Hard stop-loss (immediate sell if profit% <= -maxLossPercent)
  const slCheckPercent = (isFeeAware && cfg.feeAwareStopLoss) ? netProfitPercent : currentProfitPercent;
  if (slCheckPercent <= -maxLossPercent) {
    return {
      action: 'SELL',
      reason: `Hard Stop-Loss triggered: Current ${isFeeAware && cfg.feeAwareStopLoss ? 'net ' : ''}profit (${slCheckPercent >= 0 ? '+' : ''}${slCheckPercent.toFixed(2)}%) <= -${maxLossPercent.toFixed(2)}%`,
      state,
    };
  }

  // RULE 2 & 3: Profit-lock ladder exit
  // If lockedProfitPercent > 0 and effective profit% < (lockedProfitPercent - buffer) -> sell immediately
  if (lockedProfitPercent > 0) {
    const sellThreshold = lockedProfitPercent - buffer;
    if (effectiveProfitPercent < sellThreshold) {
      const bufferInfo = buffer > 0 ? ` (threshold: +${sellThreshold.toFixed(2)}% with ${buffer}% buffer)` : '';
      const feeTag = isFeeAware ? ` [Net after ${feeDeductionPercent}% fee]` : '';
      return {
        action: 'SELL',
        reason: `Profit-Lock triggered: Current ${isFeeAware ? 'net ' : ''}profit (${effectiveProfitPercent >= 0 ? '+' : ''}${effectiveProfitPercent.toFixed(2)}%) dropped below locked level (+${lockedProfitPercent.toFixed(2)}%${bufferInfo})${feeTag} [Peak: +${peakProfitPercent.toFixed(2)}%]`,
        state,
      };
    }
  }

  // RULE: Breakeven Protection (Only if explicitly enabled via breakevenTriggerPercent > 0)
  if (breakevenTriggerPercent > 0 && peakProfitPercent >= breakevenTriggerPercent && effectiveProfitPercent <= 0) {
    return {
      action: 'SELL',
      reason: `Breakeven Stop triggered: Trade peaked at +${peakProfitPercent.toFixed(2)}%, exited at ${effectiveProfitPercent.toFixed(2)}% to prevent loss`,
      state,
    };
  }

  // RULE 5: Optional time-based exit and fixed TP (Defaults to OFF unless explicitly enabled)
  if (cfg.timeExitEnabled && cfg.maxHoldSeconds && position.createdAt) {
    const openTimeMs = new Date(position.createdAt).getTime();
    const elapsedSeconds = Math.floor((Date.now() - openTimeMs) / 1000);
    if (elapsedSeconds >= cfg.maxHoldSeconds) {
      return {
        action: 'SELL',
        reason: `Time-Based Exit triggered: Position held for ${elapsedSeconds}s (max: ${cfg.maxHoldSeconds}s)`,
        state,
      };
    }
  }

  if (cfg.hardTakeProfitPercent && cfg.hardTakeProfitPercent > 0 && currentProfitPercent >= cfg.hardTakeProfitPercent) {
    return {
      action: 'SELL',
      reason: `Fixed Take-Profit triggered: Current profit (+${currentProfitPercent.toFixed(2)}%) >= Target (+${cfg.hardTakeProfitPercent.toFixed(2)}%)`,
      state,
    };
  }

  // Default: HOLD
  const lockDesc = lockedProfitPercent > 0 ? `+${lockedProfitPercent.toFixed(2)}%` : 'None';
  return {
    action: 'HOLD',
    reason: `Holding position: Current profit ${currentProfitPercent >= 0 ? '+' : ''}${currentProfitPercent.toFixed(2)}% | Peak: +${peakProfitPercent.toFixed(2)}% | Lock: ${lockDesc}`,
    state,
  };
}

module.exports = {
  evaluateExit,
  calculateLadderLock,
  parseProfitLockLevels,
};
