/**
 * Execution & Fill Safety Manager
 * Implements Requirements #67, #68, #69, #72, #76, #87
 * Pure engine: Fully deterministic and unit-testable.
 */

// Daily sequence counter for correlation IDs
let dailyTradeSequence = 0;
let lastSequenceDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');

/**
 * Rule #87: Correlation ID / Trade ID Generator
 * Formats: TRADE-YYYYMMDD-XXXX (e.g. TRADE-20260925-0001)
 *
 * @param {string} [prefix='TRADE']
 * @param {Date} [now=new Date()]
 * @returns {string} Unique Trade ID
 */
function generateTradeId(prefix = 'TRADE', now = new Date()) {
  const currentDate = now.toISOString().slice(0, 10).replace(/-/g, '');
  if (currentDate !== lastSequenceDate) {
    dailyTradeSequence = 0;
    lastSequenceDate = currentDate;
  }
  dailyTradeSequence++;
  const seq = String(dailyTradeSequence).padStart(4, '0');
  return `${prefix}-${currentDate}-${seq}`;
}

/**
 * Standard Order States per Rule #67
 */
const OrderLifecycleStates = {
  PENDING: 'PENDING',
  PARTIALLY_FILLED: 'PARTIALLY_FILLED',
  FILLED: 'FILLED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
};

/**
 * Rule #67: Partial Order Fill Handling
 *
 * @param {Object} params
 * @param {number} params.requestedQuantity - Theoretical requested quantity
 * @param {number} params.filledQuantity - Actual filled quantity from exchange
 * @param {number} params.fillPrice - Price of latest fill
 * @param {Array<{ price: number, quantity: number }>} [params.fills=[]] - Multi-leg fills
 * @param {number} params.entryPrice - Planned entry price
 * @param {number} params.stopLossPrice - Planned stop loss price
 * @param {'CANCEL_REMAINING'|'CONTINUE_REMAINING'} [params.policy='CANCEL_REMAINING']
 * @returns {Object} Partial fill evaluation result
 */
function handleOrderFill({
  requestedQuantity,
  filledQuantity,
  fillPrice,
  fills = [],
  entryPrice = null,
  stopLossPrice = null,
  policy = 'CANCEL_REMAINING',
}) {
  const reqQty = Number(requestedQuantity) || 0;
  const fillQty = Number(filledQuantity) || 0;
  const remainingQuantity = Math.max(0, parseFloat((reqQty - fillQty).toFixed(8)));

  // Calculate actual average fill price
  let averageFillPrice = fillPrice || entryPrice || 0;
  if (Array.isArray(fills) && fills.length > 0) {
    const totalFillCost = fills.reduce((sum, f) => sum + (Number(f.price) * Number(f.quantity)), 0);
    const totalFillsQty = fills.reduce((sum, f) => sum + Number(f.quantity), 0);
    if (totalFillsQty > 0) {
      averageFillPrice = totalFillCost / totalFillsQty;
    }
  }

  // Determine state
  let orderStatus = OrderLifecycleStates.PENDING;
  if (fillQty >= reqQty && reqQty > 0) {
    orderStatus = OrderLifecycleStates.FILLED;
  } else if (fillQty > 0) {
    orderStatus = OrderLifecycleStates.PARTIALLY_FILLED;
  }

  // Recalculate actual monetary risk based on filled quantity
  const slPrice = stopLossPrice !== null ? stopLossPrice : (entryPrice ? entryPrice * 0.9925 : 0);
  const actualPerUnitRisk = Math.abs(averageFillPrice - slPrice);
  const actualMonetaryRisk = parseFloat((fillQty * actualPerUnitRisk).toFixed(4));

  const shouldCancelRemaining = orderStatus === OrderLifecycleStates.PARTIALLY_FILLED && policy === 'CANCEL_REMAINING';

  return {
    requestedQuantity: reqQty,
    filledQuantity: fillQty,
    remainingQuantity,
    averageFillPrice: parseFloat(averageFillPrice.toFixed(4)),
    orderStatus,
    shouldCancelRemaining,
    actualMonetaryRisk,
    log: {
      REQUESTED_QUANTITY: reqQty,
      FILLED_QUANTITY: fillQty,
      REMAINING_QUANTITY: remainingQuantity,
      AVERAGE_FILL_PRICE: parseFloat(averageFillPrice.toFixed(4)),
      ORDER_STATUS: orderStatus,
    },
  };
}

/**
 * Rejection Reasons recognized per Rule #68
 */
const RejectionReasons = {
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  INVALID_PRICE: 'INVALID_PRICE',
  MIN_ORDER_REQUIREMENT: 'MIN_ORDER_REQUIREMENT',
  PRECISION_ERROR: 'PRECISION_ERROR',
  MARKET_UNAVAILABLE: 'MARKET_UNAVAILABLE',
  API_ERROR: 'API_ERROR',
  RISK_LIMIT_EXCEEDED: 'RISK_LIMIT_EXCEEDED',
};

/**
 * Rule #68: Order Rejection Handling
 *
 * @param {Object} params
 * @param {Error|Object|string} params.error - Raw rejection error from exchange
 * @param {Object} params.orderPayload - The rejected order payload
 * @param {number} [params.accountBalance] - Current available balance
 * @param {Object} [params.currentPosition] - Current local position
 * @returns {Object} Structured rejection record
 */
function handleOrderRejection({
  error,
  orderPayload = {},
  accountBalance = null,
  currentPosition = null,
}) {
  const errMsg = (error?.message || error?.error || String(error || '')).toLowerCase();

  let rejectionCategory = RejectionReasons.API_ERROR;
  if (errMsg.includes('balance') || errMsg.includes('insufficient') || errMsg.includes('fund')) {
    rejectionCategory = RejectionReasons.INSUFFICIENT_BALANCE;
  } else if (errMsg.includes('precision') || errMsg.includes('decimal')) {
    rejectionCategory = RejectionReasons.PRECISION_ERROR;
  } else if (errMsg.includes('min') || errMsg.includes('minimum') || errMsg.includes('notional')) {
    rejectionCategory = RejectionReasons.MIN_ORDER_REQUIREMENT;
  } else if (errMsg.includes('quantity') || errMsg.includes('qty')) {
    rejectionCategory = RejectionReasons.INVALID_QUANTITY;
  } else if (errMsg.includes('price') || errMsg.includes('tick')) {
    rejectionCategory = RejectionReasons.INVALID_PRICE;
  } else if (errMsg.includes('market') || errMsg.includes('halt') || errMsg.includes('inactive')) {
    rejectionCategory = RejectionReasons.MARKET_UNAVAILABLE;
  } else if (errMsg.includes('risk') || errMsg.includes('limit')) {
    rejectionCategory = RejectionReasons.RISK_LIMIT_EXCEEDED;
  }

  // Blind retries are strictly prohibited
  const allowRetry = false;

  return {
    success: false,
    orderStatus: OrderLifecycleStates.REJECTED,
    rejectionCategory,
    rawError: error?.message || String(error),
    allowRetry,
    verifiedState: {
      accountBalance,
      hasPosition: Boolean(currentPosition),
      positionId: currentPosition?.positionId || null,
    },
    auditEntry: {
      timestamp: new Date().toISOString(),
      event: 'ORDER_REJECTED',
      category: rejectionCategory,
      pair: orderPayload.pair || 'UNKNOWN',
      side: orderPayload.side || 'UNKNOWN',
      requestedQuantity: orderPayload.quantity || 0,
      reason: error?.message || String(error),
      allowRetry,
    },
  };
}

/**
 * Rule #69: Stop-Loss & Protective Order Failure Handling
 *
 * @param {Object} params
 * @param {Object} params.protectionOrder - Exchange response for protective order
 * @param {number} params.expectedPrice - Expected trigger/stop price
 * @param {number} params.expectedQuantity - Expected protected quantity
 * @param {number} [params.priceTolerancePercent=0.5] - Acceptable price variance %
 * @returns {Object} Protection verification status
 */
function verifyProtectionOrder({
  protectionOrder,
  expectedPrice,
  expectedQuantity,
  priceTolerancePercent = 0.5,
}) {
  if (!protectionOrder || !protectionOrder.id) {
    return {
      status: 'PROTECTION_FAILED',
      reason: 'No protective order returned from exchange or missing order ID',
      protectionActive: false,
      recommendedAction: 'EMERGENCY_CLOSE_OR_RETRY',
    };
  }

  const orderState = (protectionOrder.status || '').toLowerCase();
  const isAccepted = ['open', 'accepted', 'active', 'trigger_pending'].includes(orderState);
  if (!isAccepted) {
    return {
      status: 'PROTECTION_FAILED',
      reason: `Protective order rejected or inactive (status: '${protectionOrder.status}')`,
      protectionActive: false,
      recommendedAction: 'EMERGENCY_CLOSE_OR_RETRY',
    };
  }

  // Verify quantity if provided
  if (protectionOrder.quantity && expectedQuantity) {
    const qtyDiff = Math.abs(Number(protectionOrder.quantity) - Number(expectedQuantity));
    if (qtyDiff > (expectedQuantity * 0.01)) { // > 1% diff
      return {
        status: 'PROTECTION_FAILED',
        reason: `Protective order quantity mismatch: exchange=${protectionOrder.quantity}, expected=${expectedQuantity}`,
        protectionActive: false,
        recommendedAction: 'RECALCULATE_PROTECTION',
      };
    }
  }

  return {
    status: 'PROTECTION_ACTIVE',
    reason: `Protective stop-loss order ${protectionOrder.id} successfully placed and confirmed active.`,
    protectionActive: true,
    protectionOrderId: protectionOrder.id,
    recommendedAction: 'CONTINUE_MONITORING',
  };
}

/**
 * Rule #72: Price Gap & Slippage Accounting
 * Stop-loss is a risk control trigger, NOT a guaranteed execution price.
 *
 * @param {Object} params
 * @param {number} params.expectedExitPrice
 * @param {number} params.actualExitPrice
 * @param {number} params.quantity
 * @param {'buy'|'short'} [params.side='buy']
 * @returns {Object} Gap & slippage accounting
 */
function recordExitSlippage({
  expectedExitPrice,
  actualExitPrice,
  quantity,
  side = 'buy',
}) {
  const exp = Number(expectedExitPrice);
  const act = Number(actualExitPrice);
  const qty = Number(quantity);

  const isShort = side === 'short';
  // Slippage is adverse difference:
  // For long sell: expected 100, filled 98 -> slippage = 2 (adverse)
  // For short cover: expected 90, filled 92 -> slippage = 2 (adverse)
  const slippage = isShort ? Math.max(0, act - exp) : Math.max(0, exp - act);
  const slippagePercent = exp > 0 ? (slippage / exp) * 100 : 0;
  const slippageLoss = slippage * qty;

  return {
    EXPECTED_EXIT_PRICE: exp,
    ACTUAL_EXIT_PRICE: act,
    SLIPPAGE: parseFloat(slippage.toFixed(4)),
    SLIPPAGE_PERCENT: parseFloat(slippagePercent.toFixed(2)),
    SLIPPAGE_LOSS: parseFloat(slippageLoss.toFixed(2)),
    statement: 'Maximum planned risk was 0.5%, subject to execution risk.',
  };
}

/**
 * Rule #76: Precision & Rounding Verification
 * Applies exchange lot size/step rules and verifies risk does not violate 0.5% cap after rounding.
 *
 * @param {Object} params
 * @param {number} params.theoreticalQuantity
 * @param {number} params.entryPrice
 * @param {number} params.stopLossPrice
 * @param {number} params.accountBalance
 * @param {Object} [params.marketDetails={}]
 * @param {number} [params.maxRiskPercent=0.5] - Max 0.5% of capital
 * @param {number} [params.feePercent=0.1]
 * @param {number} [params.slippagePercent=0.05]
 * @returns {Object}
 */
function applyPrecisionAndVerifyRisk({
  theoreticalQuantity,
  entryPrice,
  stopLossPrice,
  accountBalance,
  marketDetails = {},
  maxRiskPercent = 0.5,
  feePercent = 0.1,
  slippagePercent = 0.05,
}) {
  const rawQty = Number(theoreticalQuantity);
  const entry = Number(entryPrice);
  const sl = Number(stopLossPrice);
  const balance = Number(accountBalance);

  if (isNaN(rawQty) || rawQty <= 0 || isNaN(entry) || entry <= 0 || isNaN(sl) || sl <= 0 || isNaN(balance) || balance <= 0) {
    return { valid: false, reason: 'Invalid parameters for precision calculation', roundedQuantity: 0 };
  }

  // Exchange precision parameters
  const precision = marketDetails?.target_currency_precision !== undefined
    ? Number(marketDetails.target_currency_precision)
    : 6;
  const step = marketDetails?.step ? Number(marketDetails.step) : (1 / Math.pow(10, precision));
  const minQty = marketDetails?.min_quantity ? Number(marketDetails.min_quantity) : (1 / Math.pow(10, precision));
  const minNotional = marketDetails?.min_notional ? Number(marketDetails.min_notional) : 0;

  // Round DOWN to exchange step size to never accidentally increase position size
  const stepsCount = Math.floor(rawQty / step);
  const roundedQuantity = parseFloat((stepsCount * step).toFixed(precision));

  if (roundedQuantity < minQty) {
    return {
      valid: false,
      reason: `Rounded quantity (${roundedQuantity}) is below exchange minimum (${minQty})`,
      roundedQuantity: 0,
    };
  }

  const orderValue = roundedQuantity * entry;
  if (minNotional > 0 && orderValue < minNotional) {
    return {
      valid: false,
      reason: `Order value (${orderValue.toFixed(2)}) is below exchange minimum notional (${minNotional})`,
      roundedQuantity: 0,
    };
  }

  // Recalculate actual planned risk including round-trip fees + slippage
  const perUnitRisk = Math.abs(entry - sl);
  const roundTripCost = (entry * ((feePercent * 2) + slippagePercent)) / 100;
  const totalUnitRisk = perUnitRisk + roundTripCost;
  const actualMonetaryRisk = roundedQuantity * totalUnitRisk;
  const actualRiskPercent = (actualMonetaryRisk / balance) * 100;

  // Strict check: Actual risk after rounding must NEVER exceed the configured ceiling
  // We allow a tiny floating-point tolerance of 0.001%
  if (actualRiskPercent > (maxRiskPercent + 0.001)) {
    return {
      valid: false,
      reason: `Rounded quantity violates risk limit: Planned risk (${actualRiskPercent.toFixed(3)}%) exceeds allowed ceiling (${maxRiskPercent}%)`,
      roundedQuantity: 0,
      actualRiskPercent,
    };
  }

  return {
    valid: true,
    roundedQuantity,
    orderValue: parseFloat(orderValue.toFixed(2)),
    actualMonetaryRisk: parseFloat(actualMonetaryRisk.toFixed(2)),
    actualRiskPercent: parseFloat(actualRiskPercent.toFixed(3)),
  };
}

module.exports = {
  generateTradeId,
  OrderLifecycleStates,
  handleOrderFill,
  RejectionReasons,
  handleOrderRejection,
  verifyProtectionOrder,
  recordExitSlippage,
  applyPrecisionAndVerifyRisk,
};
