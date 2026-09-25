const tradingBot = require('../bot/tradingBot');
const backtestService = require('../services/backtestService');
const { strategyRegistry } = require('../strategy/tradingStrategy');

/**
 * Validates settings object and returns error string if invalid
 */
function validateSettingsPayload(payload) {
  if (payload.tradeAmount !== undefined) {
    const val = parseFloat(payload.tradeAmount);
    if (isNaN(val) || val <= 0 || val > 100000) {
      return 'Trade Amount must be a positive number between 1 and 100,000.';
    }
  }

  if (payload.leverage !== undefined) {
    const val = parseInt(payload.leverage, 10);
    if (isNaN(val) || val < 1 || val > 100) {
      return 'Leverage must be an integer between 1x and 100x.';
    }
  }

  if (payload.maxLossPercent !== undefined || payload.stopLossPercent !== undefined) {
    const rawVal = payload.maxLossPercent !== undefined ? payload.maxLossPercent : payload.stopLossPercent;
    const val = parseFloat(rawVal);
    if (isNaN(val) || val < 0.05 || val > 50) {
      return 'Max Loss Percent must be between 0.05% and 50%.';
    }
    // Ensure maxLossPercent is set if stopLossPercent was provided
    if (payload.maxLossPercent === undefined) {
      payload.maxLossPercent = val;
    }
  }

  if (payload.profitLockLevels !== undefined) {
    const levelsStr = Array.isArray(payload.profitLockLevels)
      ? payload.profitLockLevels.join(',')
      : String(payload.profitLockLevels);
    const parsed = levelsStr.split(',').map((s) => parseFloat(s.trim()));
    if (parsed.length === 0 || parsed.some((n) => isNaN(n) || n <= 0)) {
      return 'Profit Lock Levels must be comma-separated positive numbers (e.g. 0.5,1,2,3,4,5).';
    }
  }

  if (payload.profitLockStepAfterLast !== undefined) {
    const val = parseFloat(payload.profitLockStepAfterLast);
    if (isNaN(val) || val <= 0 || val > 20) {
      return 'Profit Lock Step After Last must be a positive number between 0.1% and 20%.';
    }
  }

  if (payload.lockBufferPercent !== undefined) {
    const val = parseFloat(payload.lockBufferPercent);
    if (isNaN(val) || val < 0 || val > 10) {
      return 'Lock Buffer Percent must be a number between 0% and 10%.';
    }
  }

  if (payload.breakevenTriggerPercent !== undefined) {
    const val = parseFloat(payload.breakevenTriggerPercent);
    if (isNaN(val) || val < 0 || val > 20) {
      return 'Breakeven Trigger Percent must be between 0% and 20%.';
    }
  }

  if (payload.maxDailyLoss !== undefined) {
    const val = parseFloat(payload.maxDailyLoss);
    if (isNaN(val) || val <= 0 || val > 1000000) {
      return 'Max Daily Loss must be a positive number between 1 and 1,000,000.';
    }
  }

  if (payload.maxOpenPositions !== undefined) {
    const val = parseInt(payload.maxOpenPositions, 10);
    if (isNaN(val) || val < 1 || val > 20) {
      return 'Max Open Positions must be an integer between 1 and 20.';
    }
  }

  if (payload.cooldownSeconds !== undefined) {
    const val = parseInt(payload.cooldownSeconds, 10);
    if (isNaN(val) || val < 0 || val > 86400) {
      return 'Cooldown Seconds must be between 0 and 86,400 seconds (24 hours).';
    }
  }

  if (payload.evalIntervalMs !== undefined) {
    const val = parseInt(payload.evalIntervalMs, 10);
    if (isNaN(val) || val < 1000 || val > 120000) {
      return 'Evaluation Interval must be between 1,000ms (1s) and 120,000ms (2 min).';
    }
  }

  if (payload.strategy !== undefined) {
    const availableStrategies = strategyRegistry.list().map((s) => (typeof s === 'string' ? s : s.name));
    if (!availableStrategies.includes(payload.strategy)) {
      return `Invalid strategy '${payload.strategy}'. Available options: ${availableStrategies.join(', ')}`;
    }
  }

  if (payload.pair !== undefined) {
    if (typeof payload.pair !== 'string' || !/^[A-Za-z0-9_\/-]{3,15}$/.test(payload.pair)) {
      return 'Trading pair contains invalid characters.';
    }
  }

  return null;
}

async function getStatus(req, res, next) {
  try {
    const status = tradingBot.getStatus();
    const availableStrategies = strategyRegistry.listDetails ? strategyRegistry.listDetails() : strategyRegistry.list();
    return res.json({
      success: true,
      status,
      availableStrategies,
    });
  } catch (error) {
    next(error);
  }
}

async function startBot(req, res, next) {
  try {
    const result = await tradingBot.start();
    return res.json(result);
  } catch (error) {
    next(error);
  }
}

async function stopBot(req, res, next) {
  try {
    const result = await tradingBot.stop();
    return res.json(result);
  } catch (error) {
    next(error);
  }
}

async function emergencyStop(req, res, next) {
  try {
    const result = await tradingBot.emergencyStop();
    return res.json(result);
  } catch (error) {
    next(error);
  }
}

async function resetEmergencyStop(req, res, next) {
  try {
    const result = await tradingBot.resetEmergencyStop();
    return res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getSettings(req, res, next) {
  try {
    const status = tradingBot.getStatus();
    return res.json({
      success: true,
      settings: {
        pair: status.pair,
        tradeAmount: status.tradeAmount,
        leverage: status.leverage || 1,
        mode: status.mode,
        strategy: status.strategy,
        evalIntervalMs: status.evalIntervalMs || 10000,
        ...status.riskLimits,
      },
      availableStrategies: strategyRegistry.listDetails ? strategyRegistry.listDetails() : strategyRegistry.list(),
    });
  } catch (error) {
    next(error);
  }
}

async function updateSettings(req, res, next) {
  try {
    const validationError = validateSettingsPayload(req.body);
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: `Validation Error: ${validationError}`,
      });
    }

    const updatedStatus = await tradingBot.updateSettings(req.body);
    return res.json({
      success: true,
      message: 'Settings validated and updated successfully',
      status: updatedStatus,
    });
  } catch (error) {
    next(error);
  }
}

async function simulateTrade(req, res, next) {
  try {
    const { profitPercent } = req.body || {};
    const result = await tradingBot.simulateDemoTrade({
      profitPercent: profitPercent !== undefined ? parseFloat(profitPercent) : 1.5,
    });
    return res.json(result);
  } catch (error) {
    next(error);
  }
}

async function runBacktest(req, res, next) {
  try {
    const result = await backtestService.runBacktest(req.body);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message || 'Backtest execution failed',
    });
  }
}

async function switchMode(req, res, next) {
  try {
    const { mode, confirmLiveRisk } = req.body || {};
    const result = await tradingBot.switchTradingMode({ mode, confirmLiveRisk });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Admin Controls (Rule #93)
 */
async function pauseEntries(req, res) {
  tradingBot.pauseNewEntries = true;
  tradingBot.log('Admin Control: New trade entries PAUSED', 'warn');
  return res.json({ success: true, message: 'New trade entries PAUSED', pauseNewEntries: true });
}

async function resumeEntries(req, res) {
  tradingBot.pauseNewEntries = false;
  tradingBot.log('Admin Control: New trade entries RESUMED', 'info');
  return res.json({ success: true, message: 'New trade entries RESUMED', pauseNewEntries: false });
}

async function resetDailyPause(req, res) {
  tradingBot.riskManager.currentDailyLoss = 0;
  tradingBot.log('Admin Control: Daily loss counter reset', 'info');
  return res.json({ success: true, message: 'Daily loss limit counter reset to 0' });
}

async function resetConsecutiveLossPause(req, res) {
  tradingBot.riskManager.resetConsecutiveLossPause();
  tradingBot.log('Admin Control: Consecutive loss pause reset', 'info');
  return res.json({ success: true, message: 'Consecutive loss pause reset successfully' });
}

/**
 * System Health Dashboard (Rule #92)
 */
async function getHealthDashboard(req, res) {
  const dashboard = tradingBot.healthMonitor.getHealthDashboard(tradingBot);
  return res.json(dashboard);
}

/**
 * Daily Summary Report (Rule #90)
 */
async function getDailySummary(req, res) {
  const DailySummaryService = require('../services/dailySummaryService');
  const report = DailySummaryService.generateReport({
    startingBalance: 10000,
    endingBalance: 10000 - tradingBot.riskManager.currentDailyLoss,
    consecutiveLosses: tradingBot.riskManager.consecutiveLosses,
  });
  return res.json(report);
}

async function instantSell(req, res, next) {
  try {
    const { reason = 'Manual instant sell from dashboard' } = req.body || {};
    const result = await tradingBot.manualInstantSell(reason);
    return res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getStatus,
  startBot,
  stopBot,
  emergencyStop,
  resetEmergencyStop,
  instantSell,
  getSettings,
  updateSettings,
  switchMode,
  simulateTrade,
  runBacktest,
  validateSettingsPayload,
  pauseEntries,
  resumeEntries,
  resetDailyPause,
  resetConsecutiveLossPause,
  getHealthDashboard,
  getDailySummary,
};
