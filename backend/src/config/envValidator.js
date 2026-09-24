/**
 * Environment & Configuration Validator (Rules #94, #95, #96, #97, #98)
 *
 * Implements:
 * 1. Startup validation for all risk, exchange, and strategy configuration (Rule #97).
 * 2. Multi-factor live mode confirmation gate (Rule #98).
 * 3. Secret masking and log sanitization (Rule #94).
 */

/**
 * Rule #94: Masks sensitive credentials in logs
 */
function maskSecret(str) {
  if (!str || typeof str !== 'string') return '******';
  if (str.length <= 6) return '******';
  return `${str.substring(0, 3)}...${str.substring(str.length - 3)}`;
}

/**
 * Rule #94: Recursively sanitizes any payload for safe logging without credentials
 */
function sanitizeForLogging(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForLogging);

  const sensitivePattern = /secret|key|token|password|auth|credential/i;
  const sanitized = {};

  for (const [k, v] of Object.entries(obj)) {
    if (sensitivePattern.test(k) && typeof v === 'string') {
      sanitized[k] = maskSecret(v);
    } else if (typeof v === 'object' && v !== null) {
      sanitized[k] = sanitizeForLogging(v);
    } else {
      sanitized[k] = v;
    }
  }

  return sanitized;
}

/**
 * Rule #97: Validates startup system configuration
 * @param {Object} cfg - Configuration object
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateConfiguration(cfg = {}) {
  const errors = [];

  // 1. RISK_PER_TRADE
  const riskPerTrade = parseFloat(cfg.riskPerTrade);
  if (isNaN(riskPerTrade) || riskPerTrade <= 0) {
    errors.push('RISK_PER_TRADE must be a positive number.');
  } else if (riskPerTrade > 0.005001) {
    errors.push(`RISK_PER_TRADE (${(riskPerTrade * 100).toFixed(2)}%) cannot exceed the 0.5% maximum capital risk limit.`);
  }

  // 2. MAX_DAILY_LOSS
  const maxDailyLoss = parseFloat(cfg.maxDailyLoss);
  if (isNaN(maxDailyLoss) || maxDailyLoss <= 0) {
    errors.push('MAX_DAILY_LOSS must be a positive number greater than 0.');
  }

  // 3. MAX_DAILY_TRADES
  const maxDailyTrades = parseInt(cfg.maxDailyTrades, 10);
  if (isNaN(maxDailyTrades) || maxDailyTrades < 1) {
    errors.push('MAX_DAILY_TRADES must be an integer >= 1.');
  }

  // 4. MAX_POSITION_SIZE / MAX_TRADE_AMOUNT
  const maxTradeAmount = parseFloat(cfg.maxTradeAmount);
  if (isNaN(maxTradeAmount) || maxTradeAmount <= 0) {
    errors.push('MAX_TRADE_AMOUNT must be a positive number greater than 0.');
  }

  // 5. MAX_LEVERAGE
  const leverage = parseInt(cfg.defaultLeverage, 10);
  if (isNaN(leverage) || leverage < 1 || leverage > 100) {
    errors.push('DEFAULT_LEVERAGE must be an integer between 1 and 100.');
  }

  // 6. STOP_LOSS_PERCENT
  const stopLoss = parseFloat(cfg.maxLossPercent !== undefined ? cfg.maxLossPercent : cfg.stopLossPercent);
  if (isNaN(stopLoss) || stopLoss < 0.05 || stopLoss > 50) {
    errors.push('MAX_LOSS_PERCENT / STOP_LOSS_PERCENT must be between 0.05% and 50%.');
  }

  // 7. PROFIT_LOCK_STEP
  const lockStep = parseFloat(cfg.profitLockStepAfterLast);
  if (isNaN(lockStep) || lockStep <= 0) {
    errors.push('PROFIT_LOCK_STEP_AFTER_LAST must be a positive number > 0.');
  }

  // 8. PROFIT_LOCK_BUFFER
  const lockBuffer = parseFloat(cfg.lockBufferPercent);
  if (isNaN(lockBuffer) || lockBuffer < 0) {
    errors.push('LOCK_BUFFER_PERCENT must be a non-negative number >= 0.');
  }

  // 9. TRADING_PAIR
  if (!cfg.defaultPair || typeof cfg.defaultPair !== 'string' || cfg.defaultPair.trim() === '') {
    errors.push('DEFAULT_PAIR must be a non-empty string (e.g. BTCUSDT).');
  }

  // 10. TRADING_MODE
  const mode = cfg.tradingMode;
  if (mode !== 'PAPER_TRADING' && mode !== 'LIVE_TRADING') {
    errors.push(`Invalid TRADING_MODE: '${mode}'. Must be PAPER_TRADING or LIVE_TRADING.`);
  }

  // 11. LIVE_TRADING Specific Requirements (Rule #98)
  if (mode === 'LIVE_TRADING') {
    const liveEligibility = verifyLiveTradingEligibility({
      tradingMode: mode,
      apiKey: cfg.coindcx?.apiKey,
      apiSecret: cfg.coindcx?.apiSecret,
      emergencyStop: cfg.emergencyStop,
      liveConfirmation: process.env.LIVE_TRADING_CONFIRMATION,
    });
    if (!liveEligibility.eligible) {
      errors.push(...liveEligibility.errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Rule #98: Multi-Factor Live Mode Confirmation Check
 * LIVE_TRADING=true is NOT sufficient by itself.
 */
function verifyLiveTradingEligibility({
  tradingMode = 'PAPER_TRADING',
  apiKey = '',
  apiSecret = '',
  emergencyStop = false,
  liveConfirmation = '',
} = {}) {
  const errors = [];

  if (tradingMode !== 'LIVE_TRADING') {
    return { eligible: false, errors: ['Trading mode is not set to LIVE_TRADING.'] };
  }

  if (!apiKey || apiKey.trim() === '') {
    errors.push('VALID_API_CREDENTIALS check failed: COINDCX_API_KEY is missing or empty.');
  }

  if (!apiSecret || apiSecret.trim() === '') {
    errors.push('VALID_API_CREDENTIALS check failed: COINDCX_API_SECRET is missing or empty.');
  }

  if (emergencyStop) {
    errors.push('EMERGENCY_STOP check failed: Emergency stop is active. Cannot trade live.');
  }

  // Explicit confirmation check (Rule #98)
  const confirmation = (liveConfirmation || '').trim();
  if (confirmation !== 'YES_I_UNDERSTAND') {
    errors.push("LIVE_TRADING_CONFIRMATION check failed: Explicit confirmation 'YES_I_UNDERSTAND' is required to enable live trading with real funds.");
  }

  return {
    eligible: errors.length === 0,
    errors,
  };
}

module.exports = {
  maskSecret,
  sanitizeForLogging,
  validateConfiguration,
  verifyLiveTradingEligibility,
};
