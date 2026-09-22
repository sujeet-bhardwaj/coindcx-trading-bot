const tradingBot = require('../bot/tradingBot');

async function getStatus(req, res, next) {
  try {
    const status = tradingBot.getStatus();
    return res.json({
      success: true,
      status,
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
        mode: status.mode,
        strategy: status.strategy,
        ...status.riskLimits,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function updateSettings(req, res, next) {
  try {
    const updatedStatus = await tradingBot.updateSettings(req.body);
    return res.json({
      success: true,
      message: 'Settings updated successfully',
      status: updatedStatus,
    });
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
  getSettings,
  updateSettings,
};
