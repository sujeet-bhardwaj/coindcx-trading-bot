const { strategyRegistry } = require('../strategy/tradingStrategy');
const MarketService = require('./marketService');
const { evaluateExit } = require('../risk/exitEngine');
const { calculatePositionSize } = require('../risk/positionSizer');

class BacktestService {
  constructor() {
    this.marketService = new MarketService();
  }

  /**
   * Run historical simulation for a pair and strategy with realistic execution,
   * slippage, fees, fee-aware profit locking, and long/short support.
   */
  async runBacktest({
    pair = 'BTCUSDT',
    strategyName = 'EMA_RSI',
    interval = '15m',
    limit = 200,
    initialBalance = 10000,
    tradeAmount = 200,
    leverage = 1,
    maxLossPercent = null,
    profitLockLevels = '0.5,1,2,3,4,5',
    profitLockStepAfterLast = 1,
    lockBufferPercent = 0,
    breakevenTriggerPercent = 0,
    stopLossPercent = 0.75,
    takeProfitPercent = null,
    trailingActivationPercent = null,
    trailingGivebackPercent = null,
    // Advanced Rule Additions (#25, #26, #44, #47, #63, #65)
    allowShort = false,
    feePercent = 0.1, // 0.1% per leg (0.2% round-trip)
    slippagePercent = 0.05, // 0.05% slippage on fills
    feeAware = false,
    feeDeductionPercent = 0.2,
    useRiskSizing = false,
    riskPerTradePercent = 0.5,
  } = {}) {
    const lev = Math.max(1, parseInt(leverage, 10) || 1);
    const effectiveMaxLoss = maxLossPercent !== null && maxLossPercent !== undefined
      ? parseFloat(maxLossPercent)
      : (stopLossPercent !== null && stopLossPercent !== undefined ? parseFloat(stopLossPercent) : 0.75);

    const strategy = strategyRegistry.get(strategyName);
    if (!strategy) {
      throw new Error(`Strategy '${strategyName}' is not registered.`);
    }

    // Configure strategy instance if supported
    if (typeof strategy.allowShort !== 'undefined') {
      strategy.allowShort = Boolean(allowShort);
    }

    // Fetch historical candles
    const candles = await this.marketService.getCandles(pair, interval, limit);
    if (!candles || candles.length < 50) {
      throw new Error(`Insufficient historical candles (${candles?.length || 0}) available for backtest.`);
    }

    let balance = initialBalance;
    let peakBalance = initialBalance;
    let maxDrawdown = 0;

    let activePosition = null;
    const trades = [];
    let totalFeesPaid = 0;
    let totalSlippagePaid = 0;

    // Minimum candles window needed for indicator calculations
    const minLookback = 40;

    for (let i = minLookback; i < candles.length; i++) {
      const windowCandles = candles.slice(0, i + 1);
      const currentCandle = candles[i];
      const currentPrice = parseFloat(currentCandle.close);
      const currentTime = currentCandle.time || currentCandle.timestamp || new Date(Date.now() - (candles.length - i) * 60000);

      // 1. POSITION MANAGEMENT: Evaluate Unified Exit Engine
      if (activePosition) {
        let closed = false;
        let exitPrice = currentPrice;
        let reason = '';

        // Liquidation check for leveraged trades
        const isShort = activePosition.side === 'short';
        const isLiquidated = isShort
          ? (activePosition.liquidationPrice && currentPrice >= activePosition.liquidationPrice)
          : (activePosition.liquidationPrice && currentPrice <= activePosition.liquidationPrice);

        if (isLiquidated) {
          exitPrice = activePosition.liquidationPrice;
          reason = `🚨 Liquidation Hit (-100% Margin at ${activePosition.leverage}x)`;
          closed = true;
        } else {
          const exitResult = evaluateExit(activePosition, currentPrice, {
            maxLossPercent: effectiveMaxLoss,
            profitLockLevels,
            profitLockStepAfterLast,
            lockBufferPercent,
            breakevenTriggerPercent,
            feeAware,
            feeDeductionPercent,
          });

          activePosition.peakProfitPercent = exitResult.state.peakProfitPercent;
          activePosition.lockedProfitPercent = exitResult.state.lockedProfitPercent;

          if (exitResult.action === 'SELL') {
            exitPrice = currentPrice;
            reason = exitResult.reason;
            closed = true;
          }
        }

        if (closed) {
          // Apply realistic slippage on exit fill
          const exitSlippageMul = isShort ? (1 + slippagePercent / 100) : (1 - slippagePercent / 100);
          const actualExitPrice = exitPrice * exitSlippageMul;
          const slippageLoss = Math.abs(actualExitPrice - exitPrice) * activePosition.quantity;
          totalSlippagePaid += slippageLoss;

          // Fees calculation
          const exitNotional = actualExitPrice * activePosition.quantity;
          const exitFee = exitNotional * (feePercent / 100);
          const totalTradeFee = activePosition.entryFee + exitFee;
          totalFeesPaid += exitFee;

          // Gross PnL
          const grossPnl = isShort
            ? (activePosition.entryPrice - actualExitPrice) * activePosition.quantity
            : (actualExitPrice - activePosition.entryPrice) * activePosition.quantity;

          const netPnl = grossPnl - totalTradeFee;
          const posLev = activePosition.leverage || 1;
          const pnlPercent = ((actualExitPrice - activePosition.entryPrice) / activePosition.entryPrice) * 100 * posLev * (isShort ? -1 : 1);

          balance += Math.max(0, activePosition.costQuote + netPnl);

          trades.push({
            id: `bt_${trades.length + 1}`,
            pair,
            side: isShort ? 'SHORT' : 'BUY',
            entryPrice: parseFloat(activePosition.entryPrice.toFixed(4)),
            exitPrice: parseFloat(actualExitPrice.toFixed(4)),
            quantity: parseFloat(activePosition.quantity.toFixed(6)),
            leverage: posLev,
            margin: parseFloat(activePosition.costQuote.toFixed(2)),
            grossPnl: parseFloat(grossPnl.toFixed(2)),
            fee: parseFloat(totalTradeFee.toFixed(2)),
            pnl: parseFloat(netPnl.toFixed(2)),
            pnlPercent: parseFloat(pnlPercent.toFixed(2)),
            reason,
            entryTime: activePosition.entryTime,
            exitTime: currentTime,
          });

          activePosition = null;
          if (balance > peakBalance) peakBalance = balance;
          const drawdown = ((peakBalance - balance) / peakBalance) * 100;
          if (drawdown > maxDrawdown) maxDrawdown = drawdown;
          continue;
        }
      }

      // 2. SIGNAL EVALUATION: Strategy check on completed candle window
      const signalResult = strategy.generateSignal({
        candles: windowCandles,
        currentPrice,
        position: activePosition,
      });

      // Handle BUY entry signal
      if (signalResult.signal === 'BUY' && !activePosition && balance >= 10) {
        let allocatedAmount = tradeAmount;
        if (useRiskSizing) {
          const slPrice = currentPrice * (1 - effectiveMaxLoss / 100);
          const sizing = calculatePositionSize({
            accountBalance: balance,
            entryPrice: currentPrice,
            stopLossPrice: slPrice,
            riskPerTrade: (riskPerTradePercent || 0.5) / 100,
            feePercent,
            slippagePercent,
          });
          if (sizing.valid && sizing.orderValue > 0) {
            allocatedAmount = sizing.orderValue;
          }
        }

        allocatedAmount = Math.min(allocatedAmount, balance);
        if (allocatedAmount >= 10) {
          // Entry fill with slippage
          const actualEntryPrice = currentPrice * (1 + slippagePercent / 100);
          totalSlippagePaid += (actualEntryPrice - currentPrice) * (allocatedAmount * lev / actualEntryPrice);

          const notional = allocatedAmount * lev;
          const qty = notional / actualEntryPrice;
          const entryFee = notional * (feePercent / 100);
          totalFeesPaid += entryFee;

          const slPrice = actualEntryPrice * (1 - effectiveMaxLoss / 100);
          const liqPrice = lev > 1 ? actualEntryPrice * (1 - 0.95 / lev) : null;

          balance -= allocatedAmount;
          activePosition = {
            side: 'buy',
            entryPrice: actualEntryPrice,
            quantity: qty,
            costQuote: allocatedAmount,
            entryFee,
            leverage: lev,
            liquidationPrice: liqPrice,
            stopLossPrice: slPrice,
            peakProfitPercent: 0,
            lockedProfitPercent: 0,
            entryTime: currentTime,
          };
        }
      }
      // Handle SHORT entry signal (Rule #44)
      else if (signalResult.signal === 'SHORT' && !activePosition && allowShort && balance >= 10) {
        let allocatedAmount = tradeAmount;
        if (useRiskSizing) {
          const slPrice = currentPrice * (1 + effectiveMaxLoss / 100);
          const sizing = calculatePositionSize({
            accountBalance: balance,
            entryPrice: currentPrice,
            stopLossPrice: slPrice,
            riskPerTrade: (riskPerTradePercent || 0.5) / 100,
            feePercent,
            slippagePercent,
          });
          if (sizing.valid && sizing.orderValue > 0) {
            allocatedAmount = sizing.orderValue;
          }
        }

        allocatedAmount = Math.min(allocatedAmount, balance);
        if (allocatedAmount >= 10) {
          // Entry fill with slippage for SHORT
          const actualEntryPrice = currentPrice * (1 - slippagePercent / 100);
          totalSlippagePaid += (currentPrice - actualEntryPrice) * (allocatedAmount * lev / actualEntryPrice);

          const notional = allocatedAmount * lev;
          const qty = notional / actualEntryPrice;
          const entryFee = notional * (feePercent / 100);
          totalFeesPaid += entryFee;

          const slPrice = actualEntryPrice * (1 + effectiveMaxLoss / 100);
          const liqPrice = lev > 1 ? actualEntryPrice * (1 + 0.95 / lev) : null;

          balance -= allocatedAmount;
          activePosition = {
            side: 'short',
            entryPrice: actualEntryPrice,
            quantity: qty,
            costQuote: allocatedAmount,
            entryFee,
            leverage: lev,
            liquidationPrice: liqPrice,
            stopLossPrice: slPrice,
            peakProfitPercent: 0,
            lockedProfitPercent: 0,
            entryTime: currentTime,
          };
        }
      }
      // Handle SELL / Close signal directly from strategy
      else if (signalResult.signal === 'SELL' && activePosition) {
        const isShort = activePosition.side === 'short';
        const exitSlippageMul = isShort ? (1 + slippagePercent / 100) : (1 - slippagePercent / 100);
        const actualExitPrice = currentPrice * exitSlippageMul;
        const slippageLoss = Math.abs(actualExitPrice - currentPrice) * activePosition.quantity;
        totalSlippagePaid += slippageLoss;

        const exitNotional = actualExitPrice * activePosition.quantity;
        const exitFee = exitNotional * (feePercent / 100);
        const totalTradeFee = activePosition.entryFee + exitFee;
        totalFeesPaid += exitFee;

        const grossPnl = isShort
          ? (activePosition.entryPrice - actualExitPrice) * activePosition.quantity
          : (actualExitPrice - activePosition.entryPrice) * activePosition.quantity;

        const netPnl = grossPnl - totalTradeFee;
        const posLev = activePosition.leverage || 1;
        const pnlPercent = ((actualExitPrice - activePosition.entryPrice) / activePosition.entryPrice) * 100 * posLev * (isShort ? -1 : 1);

        balance += Math.max(0, activePosition.costQuote + netPnl);

        trades.push({
          id: `bt_${trades.length + 1}`,
          pair,
          side: isShort ? 'SHORT' : 'BUY',
          entryPrice: parseFloat(activePosition.entryPrice.toFixed(4)),
          exitPrice: parseFloat(actualExitPrice.toFixed(4)),
          quantity: parseFloat(activePosition.quantity.toFixed(6)),
          leverage: posLev,
          margin: parseFloat(activePosition.costQuote.toFixed(2)),
          grossPnl: parseFloat(grossPnl.toFixed(2)),
          fee: parseFloat(totalTradeFee.toFixed(2)),
          pnl: parseFloat(netPnl.toFixed(2)),
          pnlPercent: parseFloat(pnlPercent.toFixed(2)),
          reason: signalResult.reason || 'Strategy Exit Signal',
          entryTime: activePosition.entryTime,
          exitTime: currentTime,
        });

        activePosition = null;
        if (balance > peakBalance) peakBalance = balance;
        const drawdown = ((peakBalance - balance) / peakBalance) * 100;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }
    }

    // Close remaining open position at end of backtest period
    if (activePosition) {
      const lastCandle = candles[candles.length - 1];
      const currentPrice = parseFloat(lastCandle.close);
      const isShort = activePosition.side === 'short';
      const actualExitPrice = currentPrice;
      const exitNotional = actualExitPrice * activePosition.quantity;
      const exitFee = exitNotional * (feePercent / 100);
      const totalTradeFee = activePosition.entryFee + exitFee;
      totalFeesPaid += exitFee;

      const grossPnl = isShort
        ? (activePosition.entryPrice - actualExitPrice) * activePosition.quantity
        : (actualExitPrice - activePosition.entryPrice) * activePosition.quantity;

      const netPnl = grossPnl - totalTradeFee;
      const posLev = activePosition.leverage || 1;
      const pnlPercent = ((actualExitPrice - activePosition.entryPrice) / activePosition.entryPrice) * 100 * posLev * (isShort ? -1 : 1);

      balance += Math.max(0, activePosition.costQuote + netPnl);

      trades.push({
        id: `bt_${trades.length + 1}`,
        pair,
        side: isShort ? 'SHORT' : 'BUY',
        entryPrice: parseFloat(activePosition.entryPrice.toFixed(4)),
        exitPrice: parseFloat(actualExitPrice.toFixed(4)),
        quantity: parseFloat(activePosition.quantity.toFixed(6)),
        leverage: posLev,
        margin: parseFloat(activePosition.costQuote.toFixed(2)),
        grossPnl: parseFloat(grossPnl.toFixed(2)),
        fee: parseFloat(totalTradeFee.toFixed(2)),
        pnl: parseFloat(netPnl.toFixed(2)),
        pnlPercent: parseFloat(pnlPercent.toFixed(2)),
        reason: 'End of Backtest Period',
        entryTime: activePosition.entryTime,
        exitTime: lastCandle.time || new Date(),
      });
    }

    // Comprehensive Statistics (#26, #63, #66)
    const totalTrades = trades.length;
    const winningTrades = trades.filter((t) => t.pnl > 0).length;
    const losingTrades = trades.filter((t) => t.pnl < 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const netProfit = balance - initialBalance;
    const netProfitPercent = (netProfit / initialBalance) * 100;

    const grossGains = trades.filter((t) => t.pnl > 0).reduce((acc, t) => acc + t.pnl, 0);
    const grossLosses = Math.abs(trades.filter((t) => t.pnl < 0).reduce((acc, t) => acc + t.pnl, 0));
    const profitFactor = grossLosses > 0 ? grossGains / grossLosses : grossGains > 0 ? 999 : 1.0;

    const avgWin = winningTrades > 0 ? grossGains / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? grossLosses / losingTrades : 0;
    const winProbability = totalTrades > 0 ? winningTrades / totalTrades : 0;
    const lossProbability = totalTrades > 0 ? losingTrades / totalTrades : 0;
    const expectancy = winProbability * avgWin - lossProbability * avgLoss;

    // Calculate maximum consecutive losses
    let maxConsecutiveLosses = 0;
    let currentLossStreak = 0;
    for (const t of trades) {
      if (t.pnl < 0) {
        currentLossStreak++;
        if (currentLossStreak > maxConsecutiveLosses) maxConsecutiveLosses = currentLossStreak;
      } else {
        currentLossStreak = 0;
      }
    }

    const longTradesCount = trades.filter((t) => t.side === 'BUY').length;
    const shortTradesCount = trades.filter((t) => t.side === 'SHORT').length;

    return {
      success: true,
      summary: {
        pair,
        strategy: strategyName,
        leverage: lev,
        interval,
        candleCount: candles.length,
        initialBalance,
        finalBalance: parseFloat(balance.toFixed(2)),
        netProfit: parseFloat(netProfit.toFixed(2)),
        netProfitPercent: parseFloat(netProfitPercent.toFixed(2)),
        totalTrades,
        longTradesCount,
        shortTradesCount,
        winningTrades,
        losingTrades,
        winRatePercent: parseFloat(winRate.toFixed(1)),
        maxDrawdownPercent: parseFloat(maxDrawdown.toFixed(2)),
        profitFactor: parseFloat(profitFactor.toFixed(2)),
        expectancy: parseFloat(expectancy.toFixed(2)),
        maxConsecutiveLosses,
        totalFeesPaid: parseFloat(totalFeesPaid.toFixed(2)),
        totalSlippagePaid: parseFloat(totalSlippagePaid.toFixed(2)),
      },
      trades: trades.slice(-30).reverse(), // Last 30 trades
    };
  }
}

module.exports = new BacktestService();
