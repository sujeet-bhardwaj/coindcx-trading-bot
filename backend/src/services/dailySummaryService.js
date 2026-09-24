/**
 * Daily Summary Report Service (Rule #90)
 *
 * Compiles performance metrics for the day without presenting them as a guarantee of future performance.
 */

class DailySummaryService {
  /**
   * Generates a comprehensive daily performance summary
   * @param {Object} params
   * @param {Array<Object>} params.trades - Trades executed today
   * @param {number} params.startingBalance - Account balance at start of day
   * @param {number} params.endingBalance - Current account balance
   * @param {number} params.tradesSkipped - Count of skipped signals
   * @param {number} params.riskActivations - Count of risk limit activations
   * @param {number} params.consecutiveLosses - Current consecutive losses
   * @returns {Object} Structured Daily Summary Report
   */
  static generateReport({
    trades = [],
    startingBalance = 10000,
    endingBalance = 10000,
    tradesSkipped = 0,
    riskActivations = 0,
    consecutiveLosses = 0,
    date = new Date().toISOString().slice(0, 10),
  } = {}) {
    const totalTrades = trades.length;
    let winningTrades = 0;
    let losingTrades = 0;
    let grossPnL = 0;
    let totalFees = 0;
    let totalSlippage = 0;
    let netPnL = 0;
    let largestWin = 0;
    let largestLoss = 0;
    let profitLockExits = 0;
    let stopLossExits = 0;
    let indicatorExits = 0;

    let peakEquity = startingBalance;
    let maxDrawdown = 0;
    let runningEquity = startingBalance;

    for (const trade of trades) {
      const pnl = parseFloat(trade.profit || trade.netPnL || 0);
      const fee = parseFloat(trade.fee || trade.fees || 0);
      const slip = parseFloat(trade.slippage || 0);
      const reason = (trade.reason || trade.EXIT_REASON || '').toUpperCase();

      totalFees += fee;
      totalSlippage += slip;
      netPnL += pnl;
      grossPnL += (pnl + fee);

      if (pnl > 0) {
        winningTrades++;
        if (pnl > largestWin) largestWin = pnl;
      } else if (pnl < 0) {
        losingTrades++;
        if (Math.abs(pnl) > Math.abs(largestLoss)) largestLoss = Math.abs(pnl);
      }

      // Exit classification
      if (reason.includes('LOCK') || reason.includes('PROFIT_LOCK')) {
        profitLockExits++;
      } else if (reason.includes('STOP') || reason.includes('STOP_LOSS')) {
        stopLossExits++;
      } else if (reason.includes('SIGNAL') || reason.includes('EMA') || reason.includes('RSI')) {
        indicatorExits++;
      }

      // Drawdown calculation
      runningEquity += pnl;
      if (runningEquity > peakEquity) {
        peakEquity = runningEquity;
      }
      const dd = peakEquity > 0 ? ((peakEquity - runningEquity) / peakEquity) * 100 : 0;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
      }
    }

    const winRate = totalTrades > 0 ? parseFloat(((winningTrades / totalTrades) * 100).toFixed(2)) : 0;

    return {
      date,
      startingBalance: parseFloat(startingBalance.toFixed(2)),
      endingBalance: parseFloat(endingBalance.toFixed(2)),
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      grossPnL: parseFloat(grossPnL.toFixed(2)),
      fees: parseFloat(totalFees.toFixed(2)),
      slippage: parseFloat(totalSlippage.toFixed(2)),
      netPnL: parseFloat(netPnL.toFixed(2)),
      maximumDrawdownPercent: parseFloat(maxDrawdown.toFixed(2)),
      largestWin: parseFloat(largestWin.toFixed(2)),
      largestLoss: parseFloat(largestLoss.toFixed(2)),
      consecutiveLosses,
      profitLockExits,
      stopLossExits,
      indicatorExits,
      tradesSkipped,
      riskLimitActivations: riskActivations,
      disclaimer: 'This daily summary is a historical record for monitoring purposes. It does not constitute a guarantee of future performance.',
    };
  }
}

module.exports = DailySummaryService;
