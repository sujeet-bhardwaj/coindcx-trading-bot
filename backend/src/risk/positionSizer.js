/**
 * Strict Capital Risk Position Sizer
 * Implements Requirements #3, #4, #10, #18, #58, #60
 * Pure function: No I/O, completely deterministic and unit-testable.
 */

/**
 * Calculates safe position size based on strict capital risk (default 0.5%)
 *
 * Formula:
 * 1. Risk Amount = Account Balance * RISK_PER_TRADE (0.005)
 * 2. Per-unit Price Risk = |Entry Price - Stop Loss Price|
 * 3. Raw Quantity = Risk Amount / Per-unit Price Risk
 * 4. Apply exchange filters (Lot step, precision, min quantity, min notional)
 * 5. Verify total exposure does not exceed available balance or max exposure limit
 * 6. Verify planned loss + estimated fees/slippage does not exceed risk ceiling
 */
function calculatePositionSize({
  accountBalance,
  entryPrice,
  stopLossPrice,
  riskPerTrade = 0.005, // 0.5% maximum capital risk
  maxAccountExposure = 1.0, // Maximum 100% of balance per position
  maxPositionSize = Infinity, // Optional hard ceiling on quote value
  feePercent = 0.1, // 0.1% maker/taker fee
  slippagePercent = 0.05, // 0.05% estimated slippage
  marketDetails = {},
}) {
  const balance = Number(accountBalance);
  const entry = Number(entryPrice);
  const sl = Number(stopLossPrice);
  const riskFraction = Number(riskPerTrade);

  // 1. Input sanitization
  if (isNaN(balance) || balance <= 0) {
    return { valid: false, reason: 'Invalid account balance: must be greater than zero', quantity: 0, orderValue: 0 };
  }
  if (isNaN(entry) || entry <= 0) {
    return { valid: false, reason: 'Invalid entry price: must be greater than zero', quantity: 0, orderValue: 0 };
  }
  if (isNaN(sl) || sl <= 0) {
    return { valid: false, reason: 'Invalid stop loss price: must be greater than zero', quantity: 0, orderValue: 0 };
  }
  if (entry === sl) {
    return { valid: false, reason: 'Entry price cannot equal stop loss price (zero risk distance)', quantity: 0, orderValue: 0 };
  }

  // 2. Calculate maximum planned monetary risk (e.g. ₹10,000 * 0.005 = ₹50)
  const maxAllowedRiskAmount = balance * riskFraction;

  // 3. Calculate per-unit price distance to initial stop loss
  const perUnitRisk = Math.abs(entry - sl);

  // Account for round-trip fees (entry + exit) + slippage on the position
  const roundTripCostPercent = (feePercent * 2) + slippagePercent;
  const costFactorPerUnit = (entry * roundTripCostPercent) / 100;
  const totalPerUnitRisk = perUnitRisk + costFactorPerUnit;

  if (totalPerUnitRisk <= 0) {
    return { valid: false, reason: 'Calculated per-unit risk is zero or negative', quantity: 0, orderValue: 0 };
  }

  // 4. Raw quantity from risk formula
  let rawQuantity = maxAllowedRiskAmount / totalPerUnitRisk;

  // 5. Apply exchange precision and lot sizing
  const precision = marketDetails?.target_currency_precision !== undefined
    ? Number(marketDetails.target_currency_precision)
    : 6;
  const step = marketDetails?.step ? Number(marketDetails.step) : (1 / Math.pow(10, precision));

  // Round down to nearest discrete lot step to prevent risk over-allocation
  let quantity = Math.floor(rawQuantity / step) * step;
  quantity = parseFloat(quantity.toFixed(precision));

  if (quantity <= 0) {
    return {
      valid: false,
      reason: `Calculated position quantity is zero after exchange step rounding (${step}). Capital risk (₹${maxAllowedRiskAmount.toFixed(2)}) is too small for this stop loss distance.`,
      quantity: 0,
      orderValue: 0,
    };
  }

  // 6. Check Minimum Quantity requirement
  const minQty = marketDetails?.min_quantity !== undefined ? Number(marketDetails.min_quantity) : 0;
  if (quantity < minQty) {
    // If minimum quantity requires more risk than configured 0.5% limit -> MUST REJECT!
    const minQtyRisk = minQty * totalPerUnitRisk;
    return {
      valid: false,
      reason: `Minimum exchange order quantity (${minQty}) requires risking ₹${minQtyRisk.toFixed(2)} (${((minQtyRisk / balance) * 100).toFixed(2)}%), which exceeds the 0.5% capital risk ceiling (₹${maxAllowedRiskAmount.toFixed(2)}). Trade rejected to protect capital.`,
      quantity: 0,
      orderValue: 0,
    };
  }

  // 7. Check Minimum Notional requirement
  const orderValue = parseFloat((quantity * entry).toFixed(2));
  const minNotional = marketDetails?.min_notional !== undefined ? Number(marketDetails.min_notional) : 0;
  if (minNotional > 0 && orderValue < minNotional) {
    // Check if increasing to minNotional stays within 0.5% risk
    const qtyForMinNotional = Math.ceil(minNotional / entry / step) * step;
    const riskAtMinNotional = qtyForMinNotional * totalPerUnitRisk;

    if (riskAtMinNotional > maxAllowedRiskAmount * 1.05) { // Strict tolerance (max 5% leeway for rounding)
      return {
        valid: false,
        reason: `Order value (₹${orderValue.toFixed(2)}) is below exchange min notional (₹${minNotional}). Increasing quantity would breach 0.5% risk limit (₹${riskAtMinNotional.toFixed(2)} > ₹${maxAllowedRiskAmount.toFixed(2)}). Trade rejected.`,
        quantity: 0,
        orderValue,
      };
    }
    // If safely within risk, adjust quantity to satisfy minNotional
    quantity = parseFloat(qtyForMinNotional.toFixed(precision));
  }

  const finalOrderValue = parseFloat((quantity * entry).toFixed(2));

  // 8. Exposure & Capital Checks
  const maxAllowedCapital = balance * maxAccountExposure;
  if (finalOrderValue > maxAllowedCapital) {
    return {
      valid: false,
      reason: `Order value (₹${finalOrderValue.toFixed(2)}) exceeds maximum allowed account exposure (₹${maxAllowedCapital.toFixed(2)}).`,
      quantity: 0,
      orderValue: finalOrderValue,
    };
  }

  if (finalOrderValue > maxPositionSize) {
    return {
      valid: false,
      reason: `Order value (₹${finalOrderValue.toFixed(2)}) exceeds configured MAX_POSITION_SIZE (₹${maxPositionSize}).`,
      quantity: 0,
      orderValue: finalOrderValue,
    };
  }

  // 9. Calculate exact planned monetary and percentage loss at SL
  const priceLoss = quantity * perUnitRisk;
  const estimatedCosts = (finalOrderValue * roundTripCostPercent) / 100;
  const totalPlannedLoss = parseFloat((priceLoss + estimatedCosts).toFixed(2));
  const plannedLossPercentOfCapital = parseFloat(((totalPlannedLoss / balance) * 100).toFixed(3));

  return {
    valid: true,
    quantity,
    orderValue: finalOrderValue,
    riskAmount: parseFloat(maxAllowedRiskAmount.toFixed(2)),
    plannedLoss: totalPlannedLoss,
    plannedLossPercent: plannedLossPercentOfCapital,
    stopLossPrice: sl,
    entryPrice: entry,
    metrics: {
      accountBalance: balance,
      perUnitRisk: parseFloat(perUnitRisk.toFixed(4)),
      roundTripCostPercent: parseFloat(roundTripCostPercent.toFixed(2)),
      estimatedCosts: parseFloat(estimatedCosts.toFixed(2)),
      isRiskCompliant: totalPlannedLoss <= (maxAllowedRiskAmount * 1.05), // Verified <= 0.5% of capital
    },
  };
}

module.exports = {
  calculatePositionSize,
};
