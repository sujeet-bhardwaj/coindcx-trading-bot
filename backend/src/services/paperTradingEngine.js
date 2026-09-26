const config = require('../config/env');
const { updateVirtualBalance } = require('../controllers/accountController');
const PaperAccount = require('../models/PaperAccount');
const { getIsConnected } = require('../config/db');

class PaperTradingEngine {
  constructor(options = {}) {
    this.initialBalanceUSDT = options.initialBalanceUSDT || config.paper.initialBalanceUSDT;
    this.initialBalanceINR = options.initialBalanceINR || config.paper.initialBalanceINR;
    this.feePercent = options.feePercent !== undefined ? options.feePercent : (config.paper.feePercent || 0.1);
    this.slippagePercent = options.slippagePercent !== undefined ? options.slippagePercent : 0.02;
    this.simulateLatencyMs = options.simulateLatencyMs !== undefined ? options.simulateLatencyMs : 0;

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
    this.totalBtcAccumulated = options.totalBtcAccumulated || 0;
    this.profitMode = options.profitMode || 'BTC_ACCUMULATOR';
    this.dailyLossResetDate = new Date().toDateString();

    this._syncBalances();
  }

  /**
   * Hydrates state from MongoDB on server startup if available
   */
  async initialize() {
    try {
      if (getIsConnected()) {
        const savedAccount = await PaperAccount.findOne();
        if (savedAccount) {
          if (savedAccount.balances) {
            this.balances = { ...this.balances, ...savedAccount.balances };
          }
          if (Array.isArray(savedAccount.positions)) {
            this.positions = savedAccount.positions.map((p) => (p.toObject ? p.toObject() : p));
          }
          if (savedAccount.dailyRealizedPnL !== undefined) {
            this.dailyRealizedPnL = savedAccount.dailyRealizedPnL;
          }
          if (savedAccount.totalBtcAccumulated !== undefined) {
            this.totalBtcAccumulated = savedAccount.totalBtcAccumulated;
          }
          if (savedAccount.dailyLossResetDate) {
            this.dailyLossResetDate = savedAccount.dailyLossResetDate;
          }
          this._checkDailyReset();
          this._syncBalances();
          console.log(`[PAPER] Restored state from DB: ${this.positions.length} position(s), Balance: ₹${this.balances.INR?.toFixed(2)} INR | ${this.balances.BTC?.toFixed(6)} BTC (Accumulated: ${this.totalBtcAccumulated.toFixed(8)} BTC)`);
        }
      }
    } catch (err) {
      console.warn('[PAPER] Error restoring state from DB:', err.message);
    }
  }

  /**
   * Persists balances, open positions and daily PnL to MongoDB
   */
  async saveState() {
    try {
      if (getIsConnected()) {
        await PaperAccount.findOneAndUpdate(
          {},
          {
            balances: this.balances,
            positions: this.positions,
            dailyRealizedPnL: this.dailyRealizedPnL,
            totalBtcAccumulated: this.totalBtcAccumulated,
            dailyLossResetDate: this.dailyLossResetDate,
          },
          { upsert: true, new: true }
        );
      }
    } catch (err) {
      console.warn('[PAPER] Could not save paper state to DB:', err.message);
    }
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
    amountQuote, // e.g. 50 USDT or 5000 INR (Margin allocated)
    currentPrice,
    stopLossPercent = config.stopLossPercent,
    takeProfitPercent = config.takeProfitPercent,
    strategy = 'EMA_RSI',
    leverage = 1,
  }) {
    this._checkDailyReset();

    const lev = Math.max(1, parseInt(leverage, 10) || 1);
    const { base, quote } = this.getQuoteAndBase(pair);
    const availableQuote = this.balances[quote] || 0;

    if (amountQuote > availableQuote) {
      throw new Error(`Insufficient simulated ${quote} balance: Available ${availableQuote.toFixed(2)}, requested margin ${amountQuote}`);
    }

    if (this.simulateLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulateLatencyMs));
    }

    // Apply realistic slippage to buy price (slightly higher execution)
    const executionPrice = currentPrice * (1 + this.slippagePercent / 100);
    const notionalValue = amountQuote * lev;
    const fee = (notionalValue * this.feePercent) / 100;
    const netNotional = notionalValue - fee;
    const quantity = netNotional / executionPrice;

    // Deduct margin from quote currency, track base currency
    this.balances[quote] -= amountQuote;
    this.balances[base] = (this.balances[base] || 0) + quantity;
    this._syncBalances();

    // Calculate Stop Loss & Take Profit thresholds
    const stopLossPrice = executionPrice * (1 - stopLossPercent / 100);
    const takeProfitPrice = executionPrice * (1 + takeProfitPercent / 100);

    // Calculate Liquidation Price for leveraged positions (> 1x) with 5% maintenance buffer
    const liquidationPrice = lev > 1 ? executionPrice * (1 - (0.95 / lev)) : null;

    const orderId = `PAPER_ORD_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const positionId = `POS_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const order = {
      orderId,
      exchangeOrderId: orderId,
      pair,
      side: 'buy',
      type: 'market_order',
      price: executionPrice,
      quantity,
      costQuote: amountQuote, // Margin pledged
      margin: amountQuote,
      notionalValue,
      leverage: lev,
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
      margin: amountQuote,
      leverage: lev,
      notionalValue,
      liquidationPrice,
      stopLossPrice,
      takeProfitPrice,
      stopLossPercent,
      takeProfitPercent,
      effectiveStopLossPrice: stopLossPrice,
      peakProfitPercent: 0,
      lockedProfitPercent: 0,
      trailingActive: false,
      strategy,
      entryFee: fee,
      createdAt: new Date(),
    };
    this.positions.push(position);

    await this.saveState();

    return {
      order,
      position,
      balances: { ...this.balances },
    };
  }

  /**
   * Execute simulated SHORT order (Futures / Derivatives)
   */
  async executeShort({
    pair,
    amountQuote,
    currentPrice,
    stopLossPercent = config.stopLossPercent,
    takeProfitPercent = config.takeProfitPercent,
    strategy = 'EMA_RSI',
    leverage = 1,
  }) {
    this._checkDailyReset();

    const lev = Math.max(1, parseInt(leverage, 10) || 1);
    const { quote } = this.getQuoteAndBase(pair);
    const availableQuote = this.balances[quote] || 0;

    if (amountQuote > availableQuote) {
      throw new Error(`Insufficient simulated ${quote} balance: Available ${availableQuote.toFixed(2)}, requested margin ${amountQuote}`);
    }

    if (this.simulateLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulateLatencyMs));
    }

    // Apply realistic slippage to short price (slightly lower execution on short entry)
    const executionPrice = currentPrice * (1 - this.slippagePercent / 100);
    const notionalValue = amountQuote * lev;
    const fee = (notionalValue * this.feePercent) / 100;
    const netNotional = notionalValue - fee;
    const quantity = netNotional / executionPrice;

    // Deduct margin from quote currency
    this.balances[quote] -= amountQuote;
    this._syncBalances();

    // Calculate Stop Loss & Take Profit thresholds for SHORT
    const stopLossPrice = executionPrice * (1 + stopLossPercent / 100);
    const takeProfitPrice = executionPrice * (1 - takeProfitPercent / 100);

    // Calculate Liquidation Price for leveraged positions with 5% maintenance buffer
    const liquidationPrice = lev > 1 ? executionPrice * (1 + (0.95 / lev)) : null;

    const orderId = `PAPER_ORD_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const positionId = `POS_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const order = {
      orderId,
      exchangeOrderId: orderId,
      pair,
      side: 'short',
      type: 'market_order',
      price: executionPrice,
      quantity,
      costQuote: amountQuote,
      margin: amountQuote,
      notionalValue,
      leverage: lev,
      fee,
      status: 'filled',
      mode: 'PAPER_TRADING',
      timestamp: new Date(),
    };
    this.orders.push(order);

    const position = {
      positionId,
      pair,
      side: 'short',
      entryPrice: executionPrice,
      quantity,
      margin: amountQuote,
      leverage: lev,
      notionalValue,
      liquidationPrice,
      stopLossPrice,
      takeProfitPrice,
      stopLossPercent,
      takeProfitPercent,
      effectiveStopLossPrice: stopLossPrice,
      peakProfitPercent: 0,
      lockedProfitPercent: 0,
      trailingActive: false,
      strategy,
      entryFee: fee,
      createdAt: new Date(),
    };
    this.positions.push(position);

    await this.saveState();

    return {
      order,
      position,
      balances: { ...this.balances },
    };
  }

  /**
   * Update trailing stop-loss / profit-lock state for an active position
   */
  async updatePositionTrailing(positionId, updates = {}) {
    const pos = this.positions.find((p) => p.positionId === positionId);
    if (pos) {
      if (updates.peakProfitPercent !== undefined) pos.peakProfitPercent = updates.peakProfitPercent;
      if (updates.lockedProfitPercent !== undefined) pos.lockedProfitPercent = updates.lockedProfitPercent;
      if (updates.trailingActive !== undefined) pos.trailingActive = updates.trailingActive;
      if (updates.effectiveStopLossPrice !== undefined) pos.effectiveStopLossPrice = updates.effectiveStopLossPrice;
      await this.saveState();
      return pos;
    }
    return null;
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

    const position = targetPosIndex !== -1 ? this.positions[targetPosIndex] : null;
    const isShort = position && position.side === 'short';

    if (targetPosIndex === -1 && (!quantity || quantity > (this.balances[base] || 0))) {
      throw new Error(`No matching open position or insufficient ${base} balance to sell`);
    }

    const sellQty = position ? position.quantity : quantity;
    const entryPrice = position ? position.entryPrice : currentPrice;
    const entryFee = position ? position.entryFee : 0;
    const lev = position ? (position.leverage || 1) : 1;
    const margin = position ? (position.margin || (position.entryPrice * sellQty / lev)) : (entryPrice * sellQty);

    if (this.simulateLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulateLatencyMs));
    }

    // Apply realistic slippage:
    // Long sell: slightly lower execution
    // Short cover: slightly higher execution
    const executionPrice = isShort
      ? currentPrice * (1 + this.slippagePercent / 100)
      : currentPrice * (1 - this.slippagePercent / 100);

    const grossQuote = sellQty * executionPrice;
    // Real-world Indian crypto taxation: 1.0% TDS on sell transactions for INR pairs
    const effectiveFeePercent = (quote === 'INR' && !isShort) ? (this.feePercent + 1.0) : this.feePercent;
    const exitFee = (grossQuote * effectiveFeePercent) / 100;
    const netQuote = grossQuote - exitFee;

    // Calculate Realized P&L
    const totalFees = entryFee + exitFee;
    const grossPnL = isShort
      ? (entryPrice - executionPrice) * sellQty
      : (executionPrice - entryPrice) * sellQty;
    const netPnL = grossPnL - totalFees;
    const pnlPercent = margin > 0 ? (netPnL / margin) * 100 : (((executionPrice - entryPrice) / entryPrice) * 100 * lev * (isShort ? -1 : 1));

    let btcProfitEarned = 0;

    // Update balances
    if (isShort) {
      // Short position return: margin + net realized PnL
      const returnedCapital = Math.max(0, margin + netPnL);
      this.balances[quote] = (this.balances[quote] || 0) + returnedCapital;
    } else {
      this.balances[base] = Math.max(0, (this.balances[base] || 0) - sellQty);
      if (lev > 1) {
        if (this.profitMode === 'BTC_ACCUMULATOR' && netPnL > 0 && base === 'BTC') {
          // 🪙 BTC ACCUMULATOR: Return margin to INR cash wallet, credit pure profit directly in BTC!
          btcProfitEarned = parseFloat((netPnL / executionPrice).toFixed(8));
          this.balances[base] = parseFloat(((this.balances[base] || 0) + btcProfitEarned).toFixed(8));
          this.balances[quote] = (this.balances[quote] || 0) + margin;
          this.totalBtcAccumulated = parseFloat(((this.totalBtcAccumulated || 0) + btcProfitEarned).toFixed(8));
        } else {
          // Leveraged return: pledged margin + net realized PnL
          const returnedCapital = Math.max(0, margin + netPnL);
          this.balances[quote] = (this.balances[quote] || 0) + returnedCapital;
        }
      } else {
        if (this.profitMode === 'BTC_ACCUMULATOR' && netPnL > 0 && base === 'BTC') {
          btcProfitEarned = parseFloat((netPnL / executionPrice).toFixed(8));
          this.balances[base] = parseFloat(((this.balances[base] || 0) + btcProfitEarned).toFixed(8));
          this.balances[quote] = (this.balances[quote] || 0) + margin;
          this.totalBtcAccumulated = parseFloat(((this.totalBtcAccumulated || 0) + btcProfitEarned).toFixed(8));
        } else {
          // 1x Spot return: net proceeds from sale
          this.balances[quote] = (this.balances[quote] || 0) + netQuote;
        }
      }
    }
    this._syncBalances();

    this.dailyRealizedPnL += netPnL;

    const orderId = `PAPER_ORD_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const tradeId = `TRADE_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const order = {
      orderId,
      exchangeOrderId: orderId,
      pair,
      side: isShort ? 'buy_to_cover' : 'sell',
      type: 'market_order',
      price: executionPrice,
      quantity: sellQty,
      proceedsQuote: netQuote,
      margin,
      leverage: lev,
      fee: exitFee,
      status: 'filled',
      mode: 'PAPER_TRADING',
      timestamp: new Date(),
    };
    this.orders.push(order);

    const trade = {
      tradeId,
      pair,
      side: isShort ? 'short_then_cover' : 'buy_then_sell',
      entryPrice,
      exitPrice: executionPrice,
      quantity: sellQty,
      margin,
      leverage: lev,
      liquidationPrice: position ? position.liquidationPrice : null,
      grossPnL,
      profit: netPnL,
      btcProfit: btcProfitEarned,
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

    await this.saveState();

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
      const lev = pos.leverage || 1;
      const isShort = pos.side === 'short';
      const unrealizedPnL = isShort
        ? (pos.entryPrice - currentPrice) * pos.quantity
        : (currentPrice - pos.entryPrice) * pos.quantity;
      const unrealizedPnLPercent = pos.margin && pos.margin > 0
        ? (unrealizedPnL / pos.margin) * 100
        : (pos.entryPrice > 0 ? (unrealizedPnL / (pos.entryPrice * pos.quantity)) * 100 * lev : 0);
      return {
        ...pos,
        leverage: lev,
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

  setProfitMode(mode) {
    if (mode === 'BTC_ACCUMULATOR' || mode === 'INR') {
      this.profitMode = mode;
      console.log(`[PAPER] Profit Mode updated to: ${mode}`);
    }
  }

  async reset() {
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
    await this.saveState();
  }
}

// Export singleton instance for the app and class for testing
const defaultPaperEngine = new PaperTradingEngine();

module.exports = {
  PaperTradingEngine,
  paperTradingEngine: defaultPaperEngine,
};
