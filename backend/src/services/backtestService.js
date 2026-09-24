const { strategyRegistry } = require('../strategy/tradingStrategy');
const MarketService = require('./marketService');

class BacktestService {
  constructor() {
    this.marketService = new MarketService();
  }

  /**
   * Run historical simulation for a pair and strategy
   */
  async runBacktest({
    pair = 'BTCUSDT',
    strategyName = 'EMA_RSI',
    interval = '15m',
    limit = 200,
    initialBalance = 10000,
    tradeAmount = 200,
    leverage = 1,
    stopLossPercent = 2.0,
    takeProfitPercent = 4.0,
    trailingActivationPercent = 3.5,
    trailingGivebackPercent = 0.3,
    breakevenTriggerPercent = 1.0,
  } = {}) {
    const lev = Math.max(1, parseInt(leverage, 10) || 1);
    const strategy = strategyRegistry.get(strategyName);
    if (!strategy) {
      throw new Error(`Strategy '${strategyName}' is not registered.`);
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

    // Min candles window needed for indicator calculations
    const minLookback = 40;

    for (let i = minLookback; i < candles.length; i++) {
      const windowCandles = candles.slice(0, i + 1);
      const currentCandle = candles[i];
      const currentPrice = parseFloat(currentCandle.close);
      const currentTime = currentCandle.time || currentCandle.timestamp || new Date(Date.now() - (candles.length - i) * 60000);

      // 🛑 Dynamic Trailing Take-Profit & Stop-Loss check
      if (activePosition) {
        let closed = false;
        let exitPrice = currentPrice;
        let reason = '';

        const currentProfitPercent = ((currentPrice - activePosition.entryPrice) / activePosition.entryPrice) * 100;
        if (activePosition.peakProfitPercent === undefined) activePosition.peakProfitPercent = 0;
        if (currentProfitPercent > activePosition.peakProfitPercent) {
          activePosition.peakProfitPercent = currentProfitPercent;
        }

        if (!activePosition.trailingActive && activePosition.peakProfitPercent >= trailingActivationPercent) {
          activePosition.trailingActive = true;
        }

        // Liquidation check for leveraged trades
        if (activePosition.liquidationPrice && currentPrice <= activePosition.liquidationPrice) {
          exitPrice = activePosition.liquidationPrice;
          reason = `🚨 Liquidation Stop Hit (-100% Margin at ${activePosition.leverage}x)`;
          closed = true;
        }
        // Rule a: Hard ceiling hit
        else if (currentProfitPercent >= takeProfitPercent) {
          exitPrice = currentPrice;
          reason = `Hard Take-Profit Hit (+${currentProfitPercent.toFixed(2)}%)`;
          closed = true;
        }
        // Rule b: Hard floor hit
        else if (currentProfitPercent <= -stopLossPercent) {
          exitPrice = currentPrice;
          reason = `Hard Stop-Loss Hit (${currentProfitPercent.toFixed(2)}%)`;
          closed = true;
        }
        // Rule c: Trailing Take-Profit lock
        else if (activePosition.trailingActive && (activePosition.peakProfitPercent - currentProfitPercent) >= trailingGivebackPercent) {
          exitPrice = currentPrice;
          reason = `Trailing Take-Profit Locked (+${currentProfitPercent.toFixed(2)}% after peak +${activePosition.peakProfitPercent.toFixed(2)}%)`;
          closed = true;
        }
        // Rule d: Breakeven stop hit
        else if (activePosition.peakProfitPercent >= breakevenTriggerPercent && currentProfitPercent <= 0) {
          exitPrice = currentPrice;
          reason = `Breakeven Stop Hit (+${activePosition.peakProfitPercent.toFixed(2)}% peak)`;
          closed = true;
        }

        if (closed) {
          const pnl = (exitPrice - activePosition.entryPrice) * activePosition.quantity;
          const posLev = activePosition.leverage || 1;
          const pnlPercent = ((exitPrice - activePosition.entryPrice) / activePosition.entryPrice) * 100 * posLev;
          balance += Math.max(0, activePosition.costQuote + pnl);

          trades.push({
            id: `bt_${trades.length + 1}`,
            pair,
            side: 'BUY',
            entryPrice: activePosition.entryPrice,
            exitPrice,
            quantity: activePosition.quantity,
            leverage: posLev,
            margin: activePosition.costQuote,
            pnl: parseFloat(pnl.toFixed(2)),
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

      // Generate strategy signal
      const signalResult = strategy.generateSignal({
        candles: windowCandles,
        currentPrice,
        position: activePosition,
      });

      // Handle BUY signal
      if (signalResult.signal === 'BUY' && !activePosition && balance >= tradeAmount) {
        const notional = tradeAmount * lev;
        const qty = notional / currentPrice;
        const slPrice = currentPrice * (1 - stopLossPercent / 100);
        const tpPrice = currentPrice * (1 + takeProfitPercent / 100);
        const liqPrice = lev > 1 ? currentPrice * (1 - 0.95 / lev) : null;

        balance -= tradeAmount;
        activePosition = {
          entryPrice: currentPrice,
          quantity: qty,
          costQuote: tradeAmount,
          leverage: lev,
          liquidationPrice: liqPrice,
          stopLossPrice: slPrice,
          takeProfitPrice: tpPrice,
          peakProfitPercent: 0,
          trailingActive: false,
          entryTime: currentTime,
        };
      }
      // Handle SELL signal from strategy logic
      else if (signalResult.signal === 'SELL' && activePosition) {
        const pnl = (currentPrice - activePosition.entryPrice) * activePosition.quantity;
        const posLev = activePosition.leverage || 1;
        const pnlPercent = ((currentPrice - activePosition.entryPrice) / activePosition.entryPrice) * 100 * posLev;
        balance += Math.max(0, activePosition.costQuote + pnl);

        trades.push({
          id: `bt_${trades.length + 1}`,
          pair,
          side: 'BUY',
          entryPrice: activePosition.entryPrice,
          exitPrice: currentPrice,
          quantity: activePosition.quantity,
          leverage: posLev,
          margin: activePosition.costQuote,
          pnl: parseFloat(pnl.toFixed(2)),
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

    // Close remaining position at last candle close
    if (activePosition) {
      const lastCandle = candles[candles.length - 1];
      const exitPrice = parseFloat(lastCandle.close);
      const pnl = (exitPrice - activePosition.entryPrice) * activePosition.quantity;
      const posLev = activePosition.leverage || 1;
      const pnlPercent = ((exitPrice - activePosition.entryPrice) / activePosition.entryPrice) * 100 * posLev;
      balance += Math.max(0, activePosition.costQuote + pnl);

      trades.push({
        id: `bt_${trades.length + 1}`,
        pair,
        side: 'BUY',
        entryPrice: activePosition.entryPrice,
        exitPrice,
        quantity: activePosition.quantity,
        leverage: posLev,
        margin: activePosition.costQuote,
        pnl: parseFloat(pnl.toFixed(2)),
        pnlPercent: parseFloat(pnlPercent.toFixed(2)),
        reason: 'End of Backtest Period',
        entryTime: activePosition.entryTime,
        exitTime: lastCandle.time || new Date(),
      });
    }

    // Statistics
    const totalTrades = trades.length;
    const winningTrades = trades.filter((t) => t.pnl > 0).length;
    const losingTrades = trades.filter((t) => t.pnl < 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const netProfit = balance - initialBalance;
    const netProfitPercent = (netProfit / initialBalance) * 100;

    const grossGains = trades.filter((t) => t.pnl > 0).reduce((acc, t) => acc + t.pnl, 0);
    const grossLosses = Math.abs(trades.filter((t) => t.pnl < 0).reduce((acc, t) => acc + t.pnl, 0));
    const profitFactor = grossLosses > 0 ? grossGains / grossLosses : grossGains > 0 ? 999 : 1.0;

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
        winningTrades,
        losingTrades,
        winRatePercent: parseFloat(winRate.toFixed(1)),
        maxDrawdownPercent: parseFloat(maxDrawdown.toFixed(2)),
        profitFactor: parseFloat(profitFactor.toFixed(2)),
      },
      trades: trades.slice(-30).reverse(), // Last 30 trades
    };
  }
}

module.exports = new BacktestService();
