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

  if (payload.stopLossPercent !== undefined) {
    const val = parseFloat(payload.stopLossPercent);
    if (isNaN(val) || val < 0.05 || val > 50) {
      return 'Stop Loss Percent must be between 0.05% and 50%.';
    }
  }

  if (payload.takeProfitPercent !== undefined) {
    const val = parseFloat(payload.takeProfitPercent);
    if (isNaN(val) || val < 0.05 || val > 100) {
      return 'Take Profit Percent must be between 0.05% and 100%.';
    }
  }

  if (payload.trailingActivationPercent !== undefined) {
    const val = parseFloat(payload.trailingActivationPercent);
    if (isNaN(val) || val < 0.05 || val > 50) {
      return 'Trailing Activation Percent must be between 0.05% and 50%.';
    }
  }

  if (payload.trailingGivebackPercent !== undefined) {
    const val = parseFloat(payload.trailingGivebackPercent);
    if (isNaN(val) || val < 0.05 || val > 10) {
      return 'Trailing Giveback Percent must be between 0.05% and 10%.';
    }
  }

  if (payload.breakevenTriggerPercent !== undefined) {
    const val = parseFloat(payload.breakevenTriggerPercent);
    if (isNaN(val) || val < 0.05 || val > 20) {
      return 'Breakeven Trigger Percent must be between 0.05% and 20%.';
    }
  }

  if (payload.trailingActivationPercent !== undefined && payload.trailingGivebackPercent !== undefined) {
    if (parseFloat(payload.trailingGivebackPercent) >= parseFloat(payload.trailingActivationPercent)) {
      return 'Trailing Giveback Percent must be strictly less than Trailing Activation Percent.';
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

module.exports = {
  getStatus,
  startBot,
  stopBot,
  emergencyStop,
  resetEmergencyStop,
  getSettings,
  updateSettings,
  simulateTrade,
  runBacktest,
  validateSettingsPayload,
};
