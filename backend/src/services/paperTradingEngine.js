const config = require('../config/env');
const { updateVirtualBalance } = require('../controllers/accountController');

class PaperTradingEngine {
  constructor(options = {}) {
    this.initialBalanceUSDT = options.initialBalanceUSDT || config.paper.initialBalanceUSDT;
    this.initialBalanceINR = options.initialBalanceINR || config.paper.initialBalanceINR;
    this.feePercent = options.feePercent || config.paper.feePercent; // default 0.1%
    this.slippagePercent = options.slippagePercent || 0.02; // 0.02% simulated slippage

    // Virtual Wallets
    this.balances = {
      USDT: this.initialBalanceUSDT,
      INR: this.initialBalanceINR,
      BTC: 0.0,
      ETH: 0.0,
    };

    // Tracking
    this.positions = []; // Active open positions
    this.trades = []; // Completed trades
    this.orders = []; // All simulated orders
    this.dailyRealizedPnL = 0;
    this.dailyLossResetDate = new Date().toDateString();

    this._syncBalances();
  }

  _syncBalances() {
    updateVirtualBalance(this.balances);
  }

  _checkDailyReset() {
    const today = new Date().toDateString();
    if (this.dailyLossResetDate !== today) {
      this.dailyRealizedPnL = 0;
      this.dailyLossResetDate = today;
    }
  }

  /**
   * Parse quote currency from pair (e.g. 'BTCUSDT' -> 'USDT', 'BTCINR' -> 'INR')
   */
  getQuoteAndBase(pair) {
    const clean = pair.toUpperCase().replace(/[\/\-_]/g, '');
    if (clean.endsWith('USDT')) {
      return { base: clean.slice(0, -4), quote: 'USDT' };
    }
    if (clean.endsWith('INR')) {
      return { base: clean.slice(0, -3), quote: 'INR' };
    }
    return { base: clean.slice(0, 3), quote: clean.slice(3) };
  }

  /**
   * Execute simulated BUY order at live market price
   */
  async executeBuy({
    pair,
    amountQuote, // e.g. 50 USDT or 5000 INR
    currentPrice,
    stopLossPercent = config.stopLossPercent,
    takeProfitPercent = config.takeProfitPercent,
    strategy = 'EMA_RSI',
  }) {
    this._checkDailyReset();

    const { base, quote } = this.getQuoteAndBase(pair);
    const availableQuote = this.balances[quote] || 0;

    if (amountQuote > availableQuote) {
      throw new Error(`Insufficient simulated ${quote} balance: Available ${availableQuote.toFixed(2)}, requested ${amountQuote}`);
    }

    // Apply realistic slippage to buy price (slightly higher execution)
    const executionPrice = currentPrice * (1 + this.slippagePercent / 100);
    const fee = (amountQuote * this.feePercent) / 100;
    const netQuote = amountQuote - fee;
    const quantity = netQuote / executionPrice;

    // Deduct quote currency, add base currency
    this.balances[quote] -= amountQuote;
    this.balances[base] = (this.balances[base] || 0) + quantity;
    this._syncBalances();

    // Calculate Stop Loss & Take Profit thresholds
    const stopLossPrice = executionPrice * (1 - stopLossPercent / 100);
    const takeProfitPrice = executionPrice * (1 + takeProfitPercent / 100);

    const orderId = `PAPER_ORD_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const positionId = `POS_${Date.now()}`;

    const order = {
      orderId,
      exchangeOrderId: orderId,
      pair,
      side: 'buy',
      type: 'market_order',
      price: executionPrice,
      quantity,
      costQuote: amountQuote,
      fee,
      status: 'filled',
      mode: 'PAPER_TRADING',
      timestamp: new Date(),
    };
    this.orders.push(order);

    const position = {
      positionId,
      pair,
      side: 'buy',
      entryPrice: executionPrice,
      quantity,
      stopLossPrice,
      takeProfitPrice,
      stopLossPercent,
      takeProfitPercent,
      strategy,
      entryFee: fee,
      createdAt: new Date(),
    };
    this.positions.push(position);

    return {
      order,
      position,
      balances: { ...this.balances },
    };
  }

  /**
   * Execute simulated SELL order to close an open position or sell holdings
   */
  async executeSell({
    pair,
    positionId = null,
    quantity = null,
    currentPrice,
    reason = 'SIGNAL_SELL',
  }) {
    this._checkDailyReset();

    const { base, quote } = this.getQuoteAndBase(pair);

    // Locate target position
    let targetPosIndex = -1;
    if (positionId) {
      targetPosIndex = this.positions.findIndex((p) => p.positionId === positionId);
    } else {
      targetPosIndex = this.positions.findIndex((p) => p.pair === pair);
    }

    if (targetPosIndex === -1 && (!quantity || quantity > (this.balances[base] || 0))) {
      throw new Error(`No matching open position or insufficient ${base} balance to sell`);
    }

    const position = targetPosIndex !== -1 ? this.positions[targetPosIndex] : null;
    const sellQty = position ? position.quantity : quantity;
    const entryPrice = position ? position.entryPrice : currentPrice;
    const entryFee = position ? position.entryFee : 0;

    // Apply realistic slippage to sell price (slightly lower execution)
    const executionPrice = currentPrice * (1 - this.slippagePercent / 100);
    const grossQuote = sellQty * executionPrice;
    const exitFee = (grossQuote * this.feePercent) / 100;
    const netQuote = grossQuote - exitFee;

    // Update balances
    this.balances[base] = Math.max(0, (this.balances[base] || 0) - sellQty);
    this.balances[quote] = (this.balances[quote] || 0) + netQuote;
    this._syncBalances();

    // Calculate Realized P&L
    const totalFees = entryFee + exitFee;
    const grossPnL = (executionPrice - entryPrice) * sellQty;
    const netPnL = grossPnL - totalFees;
    const pnlPercent = ((executionPrice - entryPrice) / entryPrice) * 100;

    this.dailyRealizedPnL += netPnL;

    const orderId = `PAPER_ORD_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const tradeId = `TRADE_${Date.now()}`;

    const order = {
      orderId,
      exchangeOrderId: orderId,
      pair,
      side: 'sell',
      type: 'market_order',
      price: executionPrice,
      quantity: sellQty,
      proceedsQuote: netQuote,
      fee: exitFee,
      status: 'filled',
      mode: 'PAPER_TRADING',
      timestamp: new Date(),
    };
    this.orders.push(order);

    const trade = {
      tradeId,
      pair,
      side: 'buy_then_sell',
      entryPrice,
      exitPrice: executionPrice,
      quantity: sellQty,
      grossPnL,
      profit: netPnL,
      pnlPercent,
      fee: totalFees,
      reason,
      mode: 'PAPER_TRADING',
      strategy: position ? position.strategy : 'MANUAL',
      status: 'closed',
      createdAt: position ? position.createdAt : new Date(),
      closedAt: new Date(),
    };
    this.trades.unshift(trade);

    // Remove position if closing
    if (targetPosIndex !== -1) {
      this.positions.splice(targetPosIndex, 1);
    }

    return {
      order,
      trade,
      pnl: netPnL,
      pnlPercent,
      balances: { ...this.balances },
    };
  }

  /**
   * Get all currently open paper positions with current market unrealized P&L
   */
  getPositionsWithPnL(currentPriceMap = {}) {
    return this.positions.map((pos) => {
      const currentPrice = currentPriceMap[pos.pair] || pos.entryPrice;
      const unrealizedPnL = (currentPrice - pos.entryPrice) * pos.quantity;
      const unrealizedPnLPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
      return {
        ...pos,
        currentPrice,
        unrealizedPnL,
        unrealizedPnLPercent,
      };
    });
  }

  getBalances() {
    return { ...this.balances };
  }

  getOrders() {
    return [...this.orders];
  }

  getTrades() {
    return [...this.trades];
  }

  getDailyPnL() {
    this._checkDailyReset();
    return this.dailyRealizedPnL;
  }

  reset() {
    this.balances = {
      USDT: this.initialBalanceUSDT,
      INR: this.initialBalanceINR,
      BTC: 0.0,
      ETH: 0.0,
    };
    this.positions = [];
    this.trades = [];
    this.orders = [];
    this.dailyRealizedPnL = 0;
    this._syncBalances();
  }
}

// Export singleton instance for the app and class for testing
const defaultPaperEngine = new PaperTradingEngine();

module.exports = {
  PaperTradingEngine,
  paperTradingEngine: defaultPaperEngine,
};
