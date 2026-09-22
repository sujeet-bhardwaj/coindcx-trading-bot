const config = require('../config/env');
const MarketService = require('../services/marketService');
const CoinDCXService = require('../services/coindcxService');
const { paperTradingEngine } = require('../services/paperTradingEngine');
const { strategyRegistry } = require('../strategy/tradingStrategy');
const { riskManager } = require('../risk/riskManager');
const orderService = require('../services/orderService');
const BotSettings = require('../models/BotSettings');
const { getIsConnected } = require('../config/db');

class TradingBot {
  constructor() {
    this.marketService = new MarketService();
    this.coindcxService = new CoinDCXService();
    this.strategy = strategyRegistry.get('EMA_RSI');
    this.riskManager = riskManager;
    this.paperEngine = paperTradingEngine;
    this.orderService = orderService;

    // Bot Operational State
    this.isRunning = false;
    this.pair = config.defaultPair; // e.g. 'BTCUSDT'
    this.tradeAmount = config.maxTradeAmount; // Quote currency value to trade per signal
    this.evalIntervalMs = 10000; // Evaluate strategy every 10s
    this.intervalTimer = null;
    this.isEvaluating = false;

    // Active Position & Strategy Metrics Cache
    this.activePosition = null;
    this.lastSignal = null;
    this.lastIndicators = null;
    this.currentPrice = 0;
    this.lastError = null;

    // In-memory Structured Logs (last 100 entries, safe from credentials)
    this.logs = [];

    // EventEmitter callback for real-time socket broadcaster
    this.onStateChangeCallback = null;
  }

  log(message, type = 'info', meta = {}) {
    const logEntry = {
      id: `log_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      type, // 'info' | 'trade' | 'risk' | 'warn' | 'error'
      message,
      meta,
    };
    this.logs.unshift(logEntry);
    if (this.logs.length > 100) this.logs.pop();

    const prefix = `[BOT] [${type.toUpperCase()}]`;
    if (type === 'error') console.error(prefix, message);
    else if (type === 'warn') console.warn(prefix, message);
    else console.log(prefix, message);

    this._notifyStateChange('log', logEntry);
  }

  setStateChangeCallback(cb) {
    this.onStateChangeCallback = cb;
  }

  _notifyStateChange(event, payload = null) {
    if (typeof this.onStateChangeCallback === 'function') {
      try {
        this.onStateChangeCallback(event, payload || this.getStatus());
      } catch (err) {
        console.error('Error notifying bot state change:', err.message);
      }
    }
  }

  /**
   * Initializes and restores state on server start
   */
  async initialize() {
    this.log('Initializing CoinDCX Trading Bot system...');
    try {
      // 1. Load Settings from Database if exists
      if (getIsConnected()) {
        const savedSettings = await BotSettings.findOne();
        if (savedSettings) {
          this.pair = savedSettings.pair || this.pair;
          this.tradeAmount = savedSettings.tradeAmount || this.tradeAmount;
          this.riskManager.updateLimits({
            maxTradeAmount: savedSettings.tradeAmount,
            maxDailyLoss: savedSettings.maxDailyLoss,
            stopLossPercent: savedSettings.stopLossPercent,
            takeProfitPercent: savedSettings.takeProfitPercent,
            cooldownSeconds: savedSettings.cooldownSeconds,
          });
          this.log(`Restored persistent settings for pair: ${this.pair}`);
        }
      }

      // 2. Reconcile open orders safely
      await this.orderService.reconcileOpenOrders(
        config.tradingMode === 'LIVE_TRADING' ? this.coindcxService : null
      );

      // 3. Fetch initial market ticker
      const ticker = await this.marketService.getTicker(this.pair);
      if (ticker && ticker.last_price) {
        this.currentPrice = parseFloat(ticker.last_price);
        this.log(`Market connection verified. Current ${this.pair} price: $${this.currentPrice}`);
      }
    } catch (err) {
      this.log(`Initialization warning: ${err.message}`, 'warn');
    }
  }

  /**
   * START BOT
   */
  async start() {
    if (this.isRunning) {
      return { success: false, message: 'Bot is already running.' };
    }

    if (this.riskManager.emergencyStop) {
      return {
        success: false,
        message: 'Cannot start bot while EMERGENCY STOP is active. Please reset Emergency Stop first.',
      };
    }

    this.isRunning = true;
    this.riskManager.setBotEnabled(true);
    this.lastError = null;

    this.log(`Bot started in [${config.tradingMode}] on pair ${this.pair}`, 'info');

    // Run first tick immediately, then set recurring interval
    this.evaluateTick();
    this.intervalTimer = setInterval(() => this.evaluateTick(), this.evalIntervalMs);

    this._notifyStateChange('status_change');
    return { success: true, message: 'Bot started successfully', status: this.getStatus() };
  }

  /**
   * STOP BOT
   */
  async stop() {
    if (!this.isRunning) {
      return { success: false, message: 'Bot is already stopped.' };
    }

    this.isRunning = false;
    this.riskManager.setBotEnabled(false);
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    this.log('Bot stopped. Automatic signal evaluation paused.', 'info');
    this._notifyStateChange('status_change');
    return { success: true, message: 'Bot stopped successfully', status: this.getStatus() };
  }

  /**
   * EMERGENCY STOP
   */
  async emergencyStop() {
    this.isRunning = false;
    this.riskManager.triggerEmergencyStop();

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    this.log('🚨 EMERGENCY STOP ACTIVATED! All automated order placement halted immediately.', 'warn');
    this._notifyStateChange('status_change');
    return { success: true, message: 'EMERGENCY STOP ACTIVATED', status: this.getStatus() };
  }

  /**
   * RESET EMERGENCY STOP
   */
  async resetEmergencyStop() {
    this.riskManager.resetEmergencyStop();
    this.log('Emergency Stop reset. Bot remains stopped until manually started.', 'info');
    this._notifyStateChange('status_change');
    return { success: true, message: 'Emergency Stop reset successfully', status: this.getStatus() };
  }

  /**
   * CORE BOT EVALUATION CYCLE
   */
  async evaluateTick() {
    if (this.isEvaluating) return;
    this.isEvaluating = true;

    try {
      // 1. Fetch current ticker price
      const ticker = await this.marketService.getTicker(this.pair);
      if (!ticker || !ticker.last_price) {
        throw new Error(`Failed to fetch ticker for ${this.pair}`);
      }
      this.currentPrice = parseFloat(ticker.last_price);

      // 2. Fetch candles for technical indicator calculation
      const candles = await this.marketService.getCandles(this.pair, '1m', 60);

      // 3. Generate Trading Signal
      const signalResult = this.strategy.generateSignal({
        candles,
        currentPrice: this.currentPrice,
        position: this.activePosition,
      });

      this.lastSignal = signalResult;
      this.lastIndicators = signalResult.indicators;

      // 4. Act on BUY Signal
      if (signalResult.signal === 'BUY' && !this.activePosition) {
        await this._handleBuySignal(signalResult);
      }

      // 5. Act on SELL Signal (including Stop-Loss & Take-Profit triggers)
      else if (signalResult.signal === 'SELL' && this.activePosition) {
        await this._handleSellSignal(signalResult);
      }

      this._notifyStateChange('tick', {
        pair: this.pair,
        price: this.currentPrice,
        signal: this.lastSignal,
        indicators: this.lastIndicators,
      });
    } catch (err) {
      this.lastError = err.message;
      this.log(`Evaluation tick error: ${err.message}`, 'error');
    } finally {
      this.isEvaluating = false;
    }
  }

  async _handleBuySignal(signalResult) {
    this.log(`Signal generated: BUY on ${this.pair} - Reason: ${signalResult.reason}`, 'info');

    // Risk Pre-Check
    const marketDetails = await this.marketService.getMarketDetails(this.pair);
    const riskCheck = this.riskManager.validateOrderPreCheck({
      pair: this.pair,
      side: 'buy',
      amountQuote: this.tradeAmount,
      currentPrice: this.currentPrice,
      marketDetails,
      openPositionsCount: this.activePosition ? 1 : 0,
    });

    if (!riskCheck.passed) {
      this.log(`Risk check failed: ${riskCheck.reason}`, 'risk');
      return;
    }

    this.log('Risk check passed. Executing BUY order...', 'risk');

    // Execute in PAPER_TRADING
    if (config.tradingMode === 'PAPER_TRADING') {
      try {
        const buyExecution = await this.paperEngine.executeBuy({
          pair: this.pair,
          amountQuote: this.tradeAmount,
          currentPrice: this.currentPrice,
          stopLossPercent: this.riskManager.stopLossPercent,
          takeProfitPercent: this.riskManager.takeProfitPercent,
          strategy: this.strategy.name,
        });

        this.activePosition = buyExecution.position;
        this.riskManager.recordTradeExecution();

        // Record in OrderService
        await this.orderService.recordOrder(buyExecution.order);

        this.log(
          `Paper BUY executed: ${buyExecution.position.quantity.toFixed(6)} ${this.pair} @ $${buyExecution.position.entryPrice.toFixed(2)} | SL: $${buyExecution.position.stopLossPrice.toFixed(2)} | TP: $${buyExecution.position.takeProfitPrice.toFixed(2)}`,
          'trade'
        );
      } catch (err) {
        this.log(`Paper BUY execution error: ${err.message}`, 'error');
      }
    } else if (config.tradingMode === 'LIVE_TRADING') {
      // PHASE 10: LIVE TRADING GUARDRAILS & EXECUTION
      try {
        await this._executeLiveBuy(marketDetails);
      } catch (err) {
        this.log(`Live BUY execution aborted safely: ${err.message}`, 'error');
      }
    }
  }

  /**
   * PHASE 10: Strict Live Order Execution with Balance Validation & Audit Logging
   */
  async _executeLiveBuy(marketDetails) {
    this.log('Executing LIVE BUY order on CoinDCX exchange...', 'warn');

    // 1. Validate API Credentials
    if (!config.coindcx.apiKey || !config.coindcx.apiSecret) {
      throw new Error('CoinDCX API Key and Secret must be configured in .env for live orders.');
    }

    // 2. Query Exchange Balance
    const quoteCurrency = this.pair.endsWith('INR') ? 'INR' : 'USDT';
    const balances = await this.coindcxService.getBalances();
    const quoteWallet = balances.find((b) => b.currency === quoteCurrency);
    const availableBalance = quoteWallet ? parseFloat(quoteWallet.balance) : 0;

    if (availableBalance < this.tradeAmount) {
      throw new Error(`Insufficient real exchange balance: Available ${availableBalance} ${quoteCurrency}, required ${this.tradeAmount} ${quoteCurrency}`);
    }

    // 3. Compute Quantity conforming to step precision
    const rawQty = this.tradeAmount / this.currentPrice;
    const precision = marketDetails?.target_currency_precision || 5;
    const quantity = parseFloat(rawQty.toFixed(precision));

    if (quantity < (marketDetails?.min_quantity || 0.00001)) {
      throw new Error(`Calculated quantity ${quantity} is below market minimum ${marketDetails?.min_quantity}`);
    }

    const clientOrderId = `LIVE_ORD_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const liveOrderPayload = {
      side: 'buy',
      order_type: 'market_order',
      market: this.pair,
      total_quantity: quantity,
      client_order_id: clientOrderId,
    };

    // Log request parameters (never logging keys/secrets)
    this.log(`Submitting Live Order to CoinDCX: ${JSON.stringify(liveOrderPayload)}`, 'trade');

    const exchangeResponse = await this.coindcxService.createOrder(liveOrderPayload);
    this.log(`CoinDCX Live Order Response: ${JSON.stringify(exchangeResponse)}`, 'trade');

    const exchangeOrderId = exchangeResponse?.orders?.[0]?.id || exchangeResponse?.id || clientOrderId;

    // Track active position
    const stopLossPrice = this.currentPrice * (1 - this.riskManager.stopLossPercent / 100);
    const takeProfitPrice = this.currentPrice * (1 + this.riskManager.takeProfitPercent / 100);

    this.activePosition = {
      positionId: `LIVE_POS_${Date.now()}`,
      pair: this.pair,
      side: 'buy',
      entryPrice: this.currentPrice,
      quantity,
      stopLossPrice,
      takeProfitPrice,
      strategy: this.strategy.name,
      createdAt: new Date(),
    };

    this.riskManager.recordTradeExecution();

    await this.orderService.recordOrder({
      exchangeOrderId,
      clientOrderId,
      pair: this.pair,
      side: 'buy',
      type: 'market_order',
      price: this.currentPrice,
      quantity,
      status: 'filled',
      mode: 'LIVE_TRADING',
    });
  }

  async _handleSellSignal(signalResult) {
    const isStopLoss = signalResult.reason.toLowerCase().includes('stop-loss');
    const isTakeProfit = signalResult.reason.toLowerCase().includes('take-profit');
    const logType = isStopLoss ? 'warn' : isTakeProfit ? 'info' : 'info';

    this.log(`Signal generated: SELL on ${this.pair} - Reason: ${signalResult.reason}`, logType);

    if (config.tradingMode === 'PAPER_TRADING') {
      try {
        const sellExecution = await this.paperEngine.executeSell({
          pair: this.pair,
          positionId: this.activePosition.positionId,
          currentPrice: this.currentPrice,
          reason: signalResult.reason,
        });

        const pnlStr = sellExecution.pnl >= 0 ? `+$${sellExecution.pnl.toFixed(2)}` : `-$${Math.abs(sellExecution.pnl).toFixed(2)}`;
        this.log(
          `Paper SELL executed: Closed @ $${sellExecution.order.price.toFixed(2)} | P&L: ${pnlStr} (${sellExecution.pnlPercent.toFixed(2)}%)`,
          'trade'
        );

        // Record in OrderService
        await this.orderService.recordOrder(sellExecution.order);
        await this.orderService.recordTrade(sellExecution.trade);

        this.riskManager.recordRealizedPnL(sellExecution.pnl);
        this.activePosition = null;
      } catch (err) {
        this.log(`Paper SELL execution error: ${err.message}`, 'error');
      }
    } else if (config.tradingMode === 'LIVE_TRADING') {
      try {
        await this._executeLiveSell(signalResult);
      } catch (err) {
        this.log(`Live SELL execution error: ${err.message}`, 'error');
      }
    }
  }

  /**
   * PHASE 10: Live Exit Order Execution
   */
  async _executeLiveSell(signalResult) {
    this.log('Executing LIVE SELL order on CoinDCX exchange...', 'warn');

    const quantity = this.activePosition?.quantity;
    if (!quantity) {
      throw new Error('No active position quantity to sell.');
    }

    const clientOrderId = `LIVE_SELL_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const liveOrderPayload = {
      side: 'sell',
      order_type: 'market_order',
      market: this.pair,
      total_quantity: quantity,
      client_order_id: clientOrderId,
    };

    this.log(`Submitting Live Exit Order: ${JSON.stringify(liveOrderPayload)}`, 'trade');
    const exchangeResponse = await this.coindcxService.createOrder(liveOrderPayload);
    this.log(`CoinDCX Live Exit Response: ${JSON.stringify(exchangeResponse)}`, 'trade');

    const exitPrice = this.currentPrice;
    const entryPrice = this.activePosition.entryPrice;
    const grossPnL = (exitPrice - entryPrice) * quantity;
    const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;

    await this.orderService.recordOrder({
      exchangeOrderId: exchangeResponse?.id || clientOrderId,
      clientOrderId,
      pair: this.pair,
      side: 'sell',
      type: 'market_order',
      price: exitPrice,
      quantity,
      status: 'filled',
      mode: 'LIVE_TRADING',
      reason: signalResult.reason,
    });

    await this.orderService.recordTrade({
      pair: this.pair,
      side: 'buy_then_sell',
      entryPrice,
      exitPrice,
      quantity,
      profit: grossPnL,
      pnlPercent,
      fee: 0,
      reason: signalResult.reason,
      mode: 'LIVE_TRADING',
      strategy: this.strategy.name,
      status: 'closed',
      closedAt: new Date(),
    });

    this.riskManager.recordRealizedPnL(grossPnL);
    this.activePosition = null;
  }

  getStatus() {
    const riskSummary = this.riskManager.getRiskSummary();
    const paperBalances = this.paperEngine.getBalances();
    const activePositions = this.paperEngine.getPositionsWithPnL({ [this.pair]: this.currentPrice });

    return {
      isRunning: this.isRunning,
      emergencyStop: riskSummary.emergencyStop,
      mode: config.tradingMode,
      pair: this.pair,
      currentPrice: this.currentPrice,
      tradeAmount: this.tradeAmount,
      activePosition: activePositions.length > 0 ? activePositions[0] : null,
      lastSignal: this.lastSignal,
      indicators: this.lastIndicators,
      dailyRealizedPnL: this.paperEngine.getDailyPnL(),
      balances: paperBalances,
      riskLimits: riskSummary,
      strategy: this.strategy.name,
      recentLogs: this.logs.slice(0, 30),
      lastError: this.lastError,
    };
  }

  async updateSettings(newSettings = {}) {
    if (newSettings.pair) this.pair = newSettings.pair.toUpperCase().replace(/[\/\-_]/g, '');
    if (newSettings.tradeAmount) this.tradeAmount = parseFloat(newSettings.tradeAmount);

    this.riskManager.updateLimits(newSettings);

    // Save to Database
    if (getIsConnected()) {
      try {
        await BotSettings.findOneAndUpdate(
          {},
          {
            pair: this.pair,
            tradeAmount: this.tradeAmount,
            stopLossPercent: this.riskManager.stopLossPercent,
            takeProfitPercent: this.riskManager.takeProfitPercent,
            maxDailyLoss: this.riskManager.maxDailyLoss,
            maxOpenPositions: this.riskManager.maxOpenPositions,
            cooldownSeconds: this.riskManager.cooldownSeconds,
            strategy: this.strategy.name,
          },
          { upsert: true, new: true }
        );
      } catch (err) {
        console.warn('Could not persist updated settings to MongoDB:', err.message);
      }
    }

    this.log(`Bot settings updated: Pair=${this.pair}, Amount=$${this.tradeAmount}`);
    this._notifyStateChange('settings_change');
    return this.getStatus();
  }
}

// Export singleton instance
const botInstance = new TradingBot();

module.exports = botInstance;
