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
    this.strategy = strategyRegistry.get(config.defaultStrategy || 'SCALPER_3M');
    this.riskManager = riskManager;
    this.paperEngine = paperTradingEngine;
    this.orderService = orderService;

    // Bot Operational State
    this.isRunning = false;
    this.pair = config.defaultPair; // e.g. 'BTCUSDT'
    this.tradeAmount = config.maxTradeAmount; // Quote currency value to trade per signal
    this.leverage = config.defaultLeverage || 1; // Leverage multiplier (1x = spot, 2x-100x = margin/futures)
    this.evalIntervalMs = config.evalIntervalMs || 10000; // Evaluate strategy interval
    this.intervalTimer = null;
    this.isEvaluating = false;

    // Active Positions Array (supports multi-position tracking)
    this.activePositions = [];
    this.lastSignal = null;
    this.lastIndicators = null;
    this.currentPrice = 0;
    this.lastError = null;

    // Real-time Status Logging & Heartbeat State
    this.lastLoggedReason = null;
    this.tickCounter = 0;
    this.lastHeartbeatTime = 0;

    // In-memory Structured Logs (last 100 entries, safe from credentials)
    this.logs = [];

    // Live Account Balances Cache
    this.liveBalances = {
      USDT: 0,
      INR: 0,
      BTC: 0,
      ETH: 0,
    };
    this.lastBalanceFetchTime = 0;

    // Cycle Timing State (User-controlled: starts strictly on start(), resets to 1s on sell)
    this.cycleStartTime = null;
    this.lastSellTime = null;

    // Purchase & Sell Activity Tracking (Real-time timestamps & details)
    this.lastBuy = null;
    this.lastSell = null;

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
   * Fetches real account balances from CoinDCX when in LIVE_TRADING mode
   */
  async fetchLiveBalances() {
    if (config.tradingMode !== 'LIVE_TRADING') return this.paperEngine.getBalances();
    if (!config.coindcx.apiKey || !config.coindcx.apiSecret) return this.liveBalances;

    try {
      const rawBalances = await this.coindcxService.getBalances();
      if (Array.isArray(rawBalances)) {
        const parsed = { USDT: 0, INR: 0, BTC: 0, ETH: 0 };
        const nonZero = [];
        for (const item of rawBalances) {
          const curr = item.currency;
          const bal = parseFloat(item.balance || 0);
          const locked = parseFloat(item.locked_balance || 0);
          if (curr) {
            parsed[curr] = bal;
            if (bal > 0 || locked > 0) {
              nonZero.push(`${curr}: ${bal}`);
            }
          }
        }
        this.liveBalances = parsed;
        this.lastBalanceFetchTime = Date.now();
        if (nonZero.length > 0) {
          this.log(`CoinDCX Assets Found: ${nonZero.join(', ')}`, 'info');
        }
        this._notifyStateChange('status_change');
        return this.liveBalances;
      }
    } catch (err) {
      console.warn('[BOT] Error fetching live CoinDCX balance:', err.message);
    }
    return this.liveBalances;
  }

  /**
   * Dynamically switch active strategy
   */
  setStrategy(strategyName) {
    const chosen = strategyRegistry.get(strategyName);
    if (chosen) {
      this.strategy = chosen;
      this.log(`Strategy set to: ${chosen.name} (${chosen.description || ''})`, 'info');
    }
  }

  /**
   * Initializes and restores state on server start
   */
  async initialize() {
    this.log('Initializing CoinDCX Trading Bot system...');
    try {
      // 1. Initialize Paper Engine state from DB
      await this.paperEngine.initialize();
      if (config.tradingMode === 'PAPER_TRADING') {
        this.activePositions = [...this.paperEngine.positions];
        if (this.activePositions.length > 0) {
          this.log(`Restored ${this.activePositions.length} active paper position(s) from persistent state.`);
        }
      }

      // 2. Load Settings from Database if exists
      if (getIsConnected()) {
        const savedSettings = await BotSettings.findOne();
        if (savedSettings) {
          this.pair = savedSettings.pair || this.pair;
          this.tradeAmount = savedSettings.tradeAmount || this.tradeAmount;
          this.leverage = savedSettings.leverage || this.leverage;
          this.evalIntervalMs = savedSettings.evalIntervalMs || this.evalIntervalMs;
          if (savedSettings.strategy) {
            this.setStrategy(savedSettings.strategy);
          }
          this.riskManager.updateLimits({
            leverage: this.leverage,
            maxTradeAmount: savedSettings.tradeAmount,
            maxDailyLoss: savedSettings.maxDailyLoss,
            maxOpenPositions: savedSettings.maxOpenPositions,
            stopLossPercent: savedSettings.stopLossPercent,
            takeProfitPercent: savedSettings.takeProfitPercent,
            trailingActivationPercent: savedSettings.trailingActivationPercent,
            trailingGivebackPercent: savedSettings.trailingGivebackPercent,
            breakevenTriggerPercent: savedSettings.breakevenTriggerPercent,
            cooldownSeconds: savedSettings.cooldownSeconds,
          });
          this.log(`Restored persistent settings for pair: ${this.pair}, leverage: ${this.leverage}x, interval: ${this.evalIntervalMs}ms`);
        }
      }

      // 3. Reconcile open orders safely
      await this.orderService.reconcileOpenOrders(
        config.tradingMode === 'LIVE_TRADING' ? this.coindcxService : null
      );

      // 4. Fetch initial market ticker
      const ticker = await this.marketService.getTicker(this.pair);
      if (ticker && ticker.last_price) {
        if (!ticker.isSyntheticFallback && !ticker.isFakePrice) {
          this.currentPrice = parseFloat(ticker.last_price);
          this.log(`Market connection verified. Current ${this.pair} price: $${this.currentPrice}`);
        } else {
          this.log(`Market feed offline: Synthetic fallback detected. Waiting for real feed.`, 'warn');
        }
      }

      // 5. Fetch real CoinDCX wallet balances in LIVE mode
      if (config.tradingMode === 'LIVE_TRADING') {
        await this.fetchLiveBalances();
        const usdt = (this.liveBalances.USDT || 0).toFixed(2);
        const inr = (this.liveBalances.INR || 0).toFixed(2);
        this.log(`Live CoinDCX wallet loaded: $${usdt} USDT | ₹${inr} INR`, 'info');
      }

      // 6. Restore last buy and sell metadata from DB
      if (getIsConnected()) {
        try {
          const Order = require('../models/Order');
          const Trade = require('../models/Trade');
          const lastBuyDoc = await Order.findOne({ side: 'buy' }).sort({ createdAt: -1 });
          if (lastBuyDoc) {
            this.lastBuy = {
              timestamp: lastBuyDoc.createdAt,
              timeFormatted: new Date(lastBuyDoc.createdAt).toLocaleTimeString(),
              price: lastBuyDoc.price,
              quantity: lastBuyDoc.quantity,
              orderValue: (lastBuyDoc.price * lastBuyDoc.quantity),
              pair: lastBuyDoc.pair,
              mode: lastBuyDoc.mode,
            };
          }
          const lastSellDoc = await Trade.findOne({ status: 'closed' }).sort({ closedAt: -1, createdAt: -1 });
          if (lastSellDoc) {
            this.lastSell = {
              timestamp: lastSellDoc.closedAt || lastSellDoc.createdAt,
              timeFormatted: new Date(lastSellDoc.closedAt || lastSellDoc.createdAt).toLocaleTimeString(),
              entryPrice: lastSellDoc.entryPrice,
              exitPrice: lastSellDoc.exitPrice,
              quantity: lastSellDoc.quantity,
              profit: lastSellDoc.profit,
              pnlPercent: lastSellDoc.pnlPercent,
              reason: lastSellDoc.reason,
              pair: lastSellDoc.pair,
              mode: lastSellDoc.mode,
            };
          }
        } catch (dbErr) {
          console.warn('[BOT] DB fetch for last buy/sell: ', dbErr.message);
        }
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
    this.cycleStartTime = Date.now(); // Start timing strictly when Start Bot is clicked
    this.riskManager.setBotEnabled(true);
    this.lastError = null;
    this.lastLoggedReason = null;
    this.tickCounter = 0;
    this.lastHeartbeatTime = 0;

    this.log(`Bot started in [${config.tradingMode}] on pair ${this.pair} (Interval: ${this.evalIntervalMs}ms)`, 'info');

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
    this.cycleStartTime = null; // Clear timing on stop
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
    this.cycleStartTime = null; // Clear timing on emergency stop
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
      // 1. Fetch current ticker price with cached price fallback
      let ticker = null;
      try {
        ticker = await this.marketService.getTicker(this.pair);
      } catch (tickerErr) {
        if (!this.currentPrice || this.currentPrice <= 0) {
          throw tickerErr;
        }
        console.warn(`[BOT] Ticker fetch blip, using current price ($${this.currentPrice}): ${tickerErr.message}`);
      }

      // 🛑 SAFEGUARD: REJECT SYNTHETIC FALLBACK PRICE (POINT 5)
      if (ticker?.isSyntheticFallback || ticker?.isFakePrice || (ticker?.isFallback && ticker?.last_price === '85000.00')) {
        this.log('⚠️ Synthetic fallback price detected. Market data offline. Skipping trade evaluation to protect capital.', 'warn');
        this.lastSignal = { signal: 'HOLD', reason: 'Market feed offline (synthetic fallback rejected)' };
        this._notifyStateChange('tick', {
          pair: this.pair,
          price: this.currentPrice,
          signal: this.lastSignal,
          indicators: this.lastIndicators,
        });
        return;
      }

      if (ticker && ticker.last_price) {
        this.currentPrice = parseFloat(ticker.last_price);
      }

      // Refresh live CoinDCX balances periodically (~every 25s) in LIVE mode
      if (config.tradingMode === 'LIVE_TRADING' && (Date.now() - (this.lastBalanceFetchTime || 0)) >= 25000) {
        this.fetchLiveBalances().catch(() => {});
      }

      // 2. Dynamic Trailing Take-Profit & Trailing Stop-Loss Evaluation (Strict Priority Order)
      if (this.activePositions.length > 0 && this.currentPrice > 0) {
        const positionsToClose = [];

        for (const pos of this.activePositions) {
          const entryPrice = pos.entryPrice;
          const currentProfitPercent = ((this.currentPrice - entryPrice) / entryPrice) * 100;

          // ⚡ Scalper Cycle (3M or 15M / EMA_RSI): Dynamic Trailing Profit + Fixed Minimum Stop-Loss + Cycle Auto-Exit
          const isCycleScalper = this.strategy?.name === 'SCALPER_3M' || this.strategy?.name === 'SCALPER_15M' || this.strategy?.name === 'EMA_RSI';
          if (isCycleScalper) {
            const is3M = this.strategy?.name === 'SCALPER_3M';
            const entryTime = pos.createdAt ? new Date(pos.createdAt).getTime() : Date.now();
            const elapsedSec = Math.floor((Date.now() - entryTime) / 1000);
            const fixedStopLoss = this.strategy.fixedStopLoss || this.riskManager.stopLossPercent || (is3M ? 0.35 : 0.80);
            const trailingActivation = this.strategy.trailingActivation || this.riskManager.trailingActivationPercent || (is3M ? 0.30 : 0.60);
            const trailingGiveback = this.strategy.trailingGiveback || this.riskManager.trailingGivebackPercent || (is3M ? 0.15 : 0.25);
            const breakevenThreshold = is3M ? 0.25 : 0.40;
            const maxHoldSec = is3M ? 180 : 900; // 3-minute cycle (180s) or 15-minute cycle (900s)

            // Update peak profit % for dynamic trailing (profit runs as high as market goes!)
            if (pos.peakProfitPercent === undefined) pos.peakProfitPercent = 0;
            if (currentProfitPercent > pos.peakProfitPercent) {
              pos.peakProfitPercent = currentProfitPercent;
            }
            const peak = pos.peakProfitPercent;

            // 1. Strict Fixed Minimum Stop-Loss
            if (currentProfitPercent <= -fixedStopLoss) {
              positionsToClose.push({
                position: pos,
                reason: `Fixed Stop-Loss Hit: Loss (${currentProfitPercent.toFixed(2)}%) reached fixed limit (-${fixedStopLoss}%). Minimum loss strictly protected!`,
              });
              continue;
            }

            // 2. Dynamic Trailing Take-Profit (UNLIMITED PROFIT: rides momentum, locks profit on pull-back)
            if (peak >= trailingActivation && (peak - currentProfitPercent) >= trailingGiveback) {
              positionsToClose.push({
                position: pos,
                reason: `Dynamic Trailing Profit Locked: Peaked at +${peak.toFixed(2)}% | Locked at +${currentProfitPercent.toFixed(2)}% (Pulled back ${(peak - currentProfitPercent).toFixed(2)}%)`,
              });
              continue;
            }

            // 3. Breakeven Protection (Guaranteed zero loss if trade was in profit)
            if (peak >= breakevenThreshold && currentProfitPercent <= 0) {
              positionsToClose.push({
                position: pos,
                reason: `Breakeven Exit: Trade peaked in profit (+${peak.toFixed(2)}%), closed at 0% to prevent loss!`,
              });
              continue;
            }

            // 4. Cycle Auto-Exit (180s for 3M, 900s for 15M)
            if (elapsedSec >= maxHoldSec) {
              positionsToClose.push({
                position: pos,
                reason: `${is3M ? '3-Minute' : '15-Minute'} Scalp Cycle Complete (${elapsedSec}s elapsed). Auto-closing to start next trade cycle. Net P&L: ${currentProfitPercent >= 0 ? '+' : ''}${currentProfitPercent.toFixed(2)}%`,
              });
              continue;
            }

            // Still inside active trade window and risk bounds: continue holding and let profit run
            continue;
          }

          // Track peak profit % reached since entry
          if (pos.peakProfitPercent === undefined) pos.peakProfitPercent = 0;
          if (currentProfitPercent > pos.peakProfitPercent) {
            pos.peakProfitPercent = currentProfitPercent;
          }

          // Trailing & Safety thresholds
          const activationThreshold = this.riskManager.trailingActivationPercent || 3.5;
          const givebackThreshold = this.riskManager.trailingGivebackPercent || 0.3;
          const breakevenThreshold = this.riskManager.breakevenTriggerPercent || 1.0;
          const hardTakeProfit = this.riskManager.takeProfitPercent || 4.0;
          const hardStopLoss = this.riskManager.stopLossPercent || 2.0;

          // Check if trailing activation threshold reached
          if (!pos.trailingActive && pos.peakProfitPercent >= activationThreshold) {
            pos.trailingActive = true;
            this.log(`🚀 Trailing Take-Profit ACTIVATED for position ${pos.positionId} (Peak: +${pos.peakProfitPercent.toFixed(2)}%)`, 'info');
          }

          // Dynamic effective stop-loss recalculation
          if (pos.peakProfitPercent >= activationThreshold) {
            const trailingExitPercent = pos.peakProfitPercent - givebackThreshold;
            pos.effectiveStopLossPrice = entryPrice * (1 + trailingExitPercent / 100);
          } else if (pos.peakProfitPercent >= breakevenThreshold) {
            pos.effectiveStopLossPrice = entryPrice; // Breakeven floor
          } else {
            pos.effectiveStopLossPrice = entryPrice * (1 - hardStopLoss / 100); // Original floor
          }

          // Liquidation check for leveraged positions
          if (pos.liquidationPrice && this.currentPrice <= pos.liquidationPrice) {
            positionsToClose.push({
              position: pos,
              reason: `🚨 LIQUIDATION STOP: Price reached $${this.currentPrice.toFixed(2)} <= Est. Liquidation Price $${pos.liquidationPrice.toFixed(2)} (${pos.leverage || 1}x Leverage)`,
            });
          }
          // Rule a: Hard ceiling hit (profit% >= TAKE_PROFIT_PERCENT)
          else if (currentProfitPercent >= hardTakeProfit) {
            positionsToClose.push({
              position: pos,
              reason: `Hard Take-Profit Ceiling Hit: Current profit (+${currentProfitPercent.toFixed(2)}%) >= Ceiling (+${hardTakeProfit.toFixed(2)}%)`,
            });
          }
          // Rule b: Hard floor hit (profit% <= -STOP_LOSS_PERCENT)
          else if (currentProfitPercent <= -hardStopLoss) {
            positionsToClose.push({
              position: pos,
              reason: `Hard Stop-Loss Floor Hit: Current loss (${currentProfitPercent.toFixed(2)}%) <= Floor (-${hardStopLoss.toFixed(2)}%)`,
            });
          }
          // Rule c: Trailing Take-Profit lock (trailingActive AND giveback >= TRAILING_GIVEBACK_PERCENT)
          else if (pos.trailingActive && (pos.peakProfitPercent - currentProfitPercent) >= givebackThreshold) {
            positionsToClose.push({
              position: pos,
              reason: `Trailing Take-Profit Locked: Drop of ${(pos.peakProfitPercent - currentProfitPercent).toFixed(2)}% from peak +${pos.peakProfitPercent.toFixed(2)}% (Exit @ $${this.currentPrice} | Net: +${currentProfitPercent.toFixed(2)}%)`,
            });
          }
          // Rule d: Breakeven stop hit (peak >= breakevenThreshold AND currentProfit <= 0)
          else if (pos.peakProfitPercent >= breakevenThreshold && currentProfitPercent <= 0) {
            positionsToClose.push({
              position: pos,
              reason: `Breakeven Stop Hit: Profit dropped back to ${currentProfitPercent.toFixed(2)}% after peaking at +${pos.peakProfitPercent.toFixed(2)}% (Guaranteed Zero Loss)`,
            });
          }
          // Rule e: 15-Minute Cycle Complete (Trade held for full 15 minutes - auto-exit and restart cycle from 1s)
          else if (pos.createdAt && Math.floor((Date.now() - new Date(pos.createdAt).getTime()) / 1000) >= 900) {
            const holdSec = Math.floor((Date.now() - new Date(pos.createdAt).getTime()) / 1000);
            positionsToClose.push({
              position: pos,
              reason: `15-Minute Cycle Complete (${holdSec}s elapsed). Auto-closing trade to start next 15-min cycle. Net: ${currentProfitPercent >= 0 ? '+' : ''}${currentProfitPercent.toFixed(2)}%`,
            });
          }
          // Rule f: Otherwise HOLD, persist updated trailing state in paper engine
          else {
            if (config.tradingMode === 'PAPER_TRADING') {
              this.paperEngine.updatePositionTrailing(pos.positionId, {
                peakProfitPercent: pos.peakProfitPercent,
                trailingActive: pos.trailingActive,
                effectiveStopLossPrice: pos.effectiveStopLossPrice,
              }).catch(() => {});
            }
          }
        }

        for (const { position, reason } of positionsToClose) {
          await this._handleSellPosition(position, reason);
        }
      }

      // 3. Fetch candles for technical indicator calculation (15m for trend following, 1m for scalper)
      let candles = [];
      const candleInterval = this.strategy?.name === 'SCALPER_3M' ? '1m' : '15m';
      try {
        candles = await this.marketService.getCandles(this.pair, candleInterval, 60);
      } catch (candleErr) {
        console.warn(`[BOT] Candles fetch blip: ${candleErr.message}`);
      }

      // If candles are temporarily unavailable or insufficient, safely hold, log status, and continue monitoring
      const minCandlesNeeded = (this.strategy?.slowPeriod || 50) + 2;
      if (!candles || candles.length < minCandlesNeeded) {
        this.lastSignal = { signal: 'HOLD', reason: `Refreshing market candles (${candles?.length || 0}/${minCandlesNeeded})...` };
        this._handleHoldStatusLog(this.lastSignal);
        this._notifyStateChange('tick', {
          pair: this.pair,
          price: this.currentPrice,
          signal: this.lastSignal,
          indicators: this.lastIndicators,
        });
        return;
      }

      // 4. Generate Trading Signal
      const signalResult = this.strategy.generateSignal({
        candles,
        currentPrice: this.currentPrice,
        position: this.activePositions.length > 0 ? this.activePositions[0] : null,
      });

      this.lastSignal = signalResult;
      this.lastIndicators = signalResult.indicators;

      // 5. Act on BUY Signal (Allowed up to maxOpenPositions)
      if (signalResult.signal === 'BUY' && this.activePositions.length < this.riskManager.maxOpenPositions) {
        await this._handleBuySignal(signalResult);
        this.lastLoggedReason = null;
      }
      // 6. Act on SELL Signal (Strategy exit signal, e.g. Bearish reversal)
      else if (signalResult.signal === 'SELL' && this.activePositions.length > 0) {
        await this._handleSellAllPositions(signalResult.reason);
        this.lastLoggedReason = null;
      }
      // 7. Real-Time Status Logging (Waiting / Holding states)
      else {
        this._handleHoldStatusLog(signalResult);
      }

      // 8. Periodic Heartbeat Log (Every ~60s)
      this._handleHeartbeatLog(signalResult.indicators);

      const now = Date.now();
      const cycleDurationSeconds = this.strategy?.name === 'SCALPER_3M' ? 180 : 900;

      // Rollover 15-minute search cycle if no active positions and 15 mins elapsed
      if (this.isRunning && this.cycleStartTime && this.activePositions.length === 0) {
        const totalElapsed = Math.floor((now - this.cycleStartTime) / 1000);
        if (totalElapsed >= cycleDurationSeconds) {
          this.cycleStartTime = Date.now();
          this.log(`⏱️ 15-Minute cycle finished. Restarting new 15-minute evaluation cycle from 1 sec...`, 'info');
        }
      }

      let cycleElapsedSeconds = 0;
      let cycleRemainingSeconds = cycleDurationSeconds;

      if (this.isRunning && this.cycleStartTime) {
        const rawElapsed = Math.max(0, Math.floor((now - this.cycleStartTime) / 1000));
        // Starts from 1 second as user requested
        cycleElapsedSeconds = (rawElapsed % cycleDurationSeconds) + 1;
        cycleRemainingSeconds = Math.max(0, cycleDurationSeconds - (rawElapsed % cycleDurationSeconds));
      }

      const activePos = this.activePositions[0] || null;
      const posElapsedSec = activePos && activePos.createdAt
        ? Math.floor((now - new Date(activePos.createdAt).getTime()) / 1000)
        : 0;

      const cycleInfo = {
        strategy: this.strategy.name,
        is15M: this.strategy.name === 'EMA_RSI' || this.strategy.name === 'SCALPER_15M' || this.strategy.name === 'MACD_RSI',
        is3M: this.strategy.name === 'SCALPER_3M',
        isRunning: this.isRunning,
        cycleStartTime: this.cycleStartTime,
        lastSellTime: this.lastSellTime,
        candleIntervalMinutes: this.strategy.name === 'SCALPER_3M' ? 3 : 15,
        candleDurationSeconds: cycleDurationSeconds,
        candleElapsedSeconds: cycleElapsedSeconds,
        candleRemainingSeconds: cycleRemainingSeconds,
        hasActivePosition: Boolean(activePos),
        positionElapsedSeconds: posElapsedSec,
        positionCreatedAt: activePos ? activePos.createdAt : null,
        entryPrice: activePos ? activePos.entryPrice : null,
      };

      this._notifyStateChange('tick', {
        pair: this.pair,
        price: this.currentPrice,
        signal: this.lastSignal,
        indicators: this.lastIndicators,
        scalper3M: cycleInfo,
        cycleInfo,
      });
    } catch (err) {
      this.lastError = err.message;
      this.log(`Evaluation tick warning: ${err.message}`, 'warn');
    } finally {
      this.isEvaluating = false;
    }
  }

  /**
   * Throttled and deduped real-time status logging for HOLD state
   */
  _handleHoldStatusLog(signalResult) {
    this.tickCounter = (this.tickCounter || 0) + 1;
    const reasonChanged = signalResult.reason !== this.lastLoggedReason;
    const isPeriodicTick = (this.tickCounter % 6 === 0);

    if (reasonChanged || isPeriodicTick) {
      this.lastLoggedReason = signalResult.reason;
      const priceStr = this.currentPrice ? this.currentPrice.toFixed(2) : '---';

      if (this.activePositions.length === 0) {
        // ⏳ WAITING — No open position
        this.log(`⏳ WAITING — ${this.pair} @ $${priceStr} | ${signalResult.reason}`, 'info');
      } else {
        // 📊 HOLDING — Active position exists
        const primaryPos = this.activePositions[0];
        const entryPriceStr = primaryPos.entryPrice ? primaryPos.entryPrice.toFixed(2) : '---';
        const pnl = primaryPos.entryPrice ? (this.currentPrice - primaryPos.entryPrice) * primaryPos.quantity : 0;
        const pnlPercent = primaryPos.entryPrice ? ((this.currentPrice - primaryPos.entryPrice) / primaryPos.entryPrice) * 100 : 0;
        const pnlSign = pnlPercent >= 0 ? '+' : '';
        this.log(
          `📊 HOLDING position — ${this.pair} @ $${priceStr} | Entry: $${entryPriceStr} | Unrealized P&L: ${pnlSign}${pnlPercent.toFixed(2)}% | ${signalResult.reason}`,
          'info'
        );
      }
    }
  }

  /**
   * Periodic heartbeat log (every ~60s) during evaluation
   */
  _handleHeartbeatLog(indicators = {}) {
    const now = Date.now();
    if (!this.lastHeartbeatTime || (now - this.lastHeartbeatTime) >= 60000) {
      this.lastHeartbeatTime = now;
      const rsiVal = indicators?.rsi !== undefined ? indicators.rsi : 'N/A';
      const fastEma = indicators?.fastEma !== undefined ? indicators.fastEma : (indicators?.emaFast ?? 'N/A');
      const slowEma = indicators?.slowEma !== undefined ? indicators.slowEma : (indicators?.emaSlow ?? 'N/A');
      const priceStr = this.currentPrice ? this.currentPrice.toFixed(2) : '---';

      this.log(
        `💓 Bot alive — Evaluating ${this.pair} | Price: $${priceStr} | RSI: ${rsiVal} | Fast EMA: ${fastEma} | Slow EMA: ${slowEma}`,
        'info'
      );
    }
  }

  async _handleBuySignal(signalResult) {
    this.log(`Signal generated: BUY on ${this.pair} - Reason: ${signalResult.reason}`, 'info');

    // Risk Pre-Check with current open positions count
    const marketDetails = await this.marketService.getMarketDetails(this.pair);
    const riskCheck = this.riskManager.validateOrderPreCheck({
      pair: this.pair,
      side: 'buy',
      amountQuote: this.tradeAmount,
      leverage: this.leverage,
      currentPrice: this.currentPrice,
      marketDetails,
      openPositionsCount: this.activePositions.length,
      strategy: this.strategy.name,
    });

    if (!riskCheck.passed) {
      this.log(`Risk check failed: ${riskCheck.reason}`, 'risk');
      return;
    }

    this.log(`Risk check passed. Executing BUY order (${this.leverage}x Leverage)...`, 'risk');

    // Execute in PAPER_TRADING
    if (config.tradingMode === 'PAPER_TRADING') {
      try {
        const buyExecution = await this.paperEngine.executeBuy({
          pair: this.pair,
          amountQuote: this.tradeAmount,
          leverage: this.leverage,
          currentPrice: this.currentPrice,
          stopLossPercent: this.riskManager.stopLossPercent,
          takeProfitPercent: this.riskManager.takeProfitPercent,
          strategy: this.strategy.name,
        });

        this.activePositions.push(buyExecution.position);
        this.riskManager.recordTradeExecution();

        // Record in OrderService
        await this.orderService.recordOrder(buyExecution.order);

        this.lastBuy = {
          timestamp: new Date().toISOString(),
          timeFormatted: new Date().toLocaleTimeString(),
          price: buyExecution.position.entryPrice,
          quantity: buyExecution.position.quantity,
          leverage: this.leverage,
          margin: this.tradeAmount,
          orderValue: buyExecution.position.entryPrice * buyExecution.position.quantity,
          pair: this.pair,
          reason: signalResult.reason,
          mode: 'PAPER_TRADING',
        };

        const timeStr = new Date().toLocaleTimeString();
        const is3M = this.strategy.name === 'SCALPER_3M';
        const is15M = this.strategy.name === 'SCALPER_15M' || this.strategy.name === 'EMA_RSI';
        const tag = is3M ? '⚡ [3M SCALP]' : (is15M ? '⚡ [15M SCALP]' : '✅');
        const levTag = this.leverage > 1 ? ` [${this.leverage}x Leverage | Margin: $${this.tradeAmount}]` : '';
        this.log(
          `${tag} BOUGHT at ${timeStr} — ${buyExecution.position.quantity.toFixed(6)} ${this.pair} @ $${buyExecution.position.entryPrice.toFixed(2)}${levTag} | Reason: ${signalResult.reason}`,
          'trade'
        );
        this.lastLoggedReason = null;

        this._notifyStateChange('status_change');
        this._notifyStateChange('trade', buyExecution.order);
      } catch (err) {
        this.log(`Paper BUY execution error: ${err.message}`, 'error');
      }
    } else if (config.tradingMode === 'LIVE_TRADING') {
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

    if (!config.coindcx.apiKey || !config.coindcx.apiSecret) {
      throw new Error('CoinDCX API Key and Secret must be configured in .env for live orders.');
    }

    const quoteCurrency = this.pair.endsWith('INR') ? 'INR' : 'USDT';
    const balances = await this.coindcxService.getBalances();
    const quoteWallet = balances.find((b) => b.currency === quoteCurrency);
    const availableBalance = quoteWallet ? parseFloat(quoteWallet.balance) : 0;

    const minNotional = marketDetails?.min_notional || (quoteCurrency === 'INR' ? 100 : 10);
    const precision = marketDetails?.target_currency_precision || 5;
    const step = marketDetails?.step ? parseFloat(marketDetails.step) : (1 / Math.pow(10, precision));

    // Calculate required quote amount that strictly exceeds minNotional (> 100 INR)
    const targetQuote = Math.max(this.tradeAmount, minNotional + 1);
    const rawQty = targetQuote / this.currentPrice;

    // Round UP to the nearest exchange lot step so order value is strictly > minNotional
    let quantity = parseFloat((Math.ceil(rawQty / step) * step).toFixed(precision));

    // Ensure strictly greater than min_notional to prevent OMS-VF-0041 error
    while ((quantity * this.currentPrice) <= minNotional) {
      quantity = parseFloat((quantity + step).toFixed(precision));
    }

    const effectiveOrderValue = quantity * this.currentPrice;

    if (availableBalance < effectiveOrderValue) {
      throw new Error(`Insufficient real exchange balance: Available ₹${availableBalance.toFixed(2)} ${quoteCurrency}, required ₹${effectiveOrderValue.toFixed(2)} ${quoteCurrency}`);
    }

    if (quantity < (marketDetails?.min_quantity || 0.00001)) {
      throw new Error(`Calculated quantity ${quantity} is below market minimum ${marketDetails?.min_quantity}`);
    }

    this.log(`Order calculated: ${quantity} ${this.pair} (~₹${effectiveOrderValue.toFixed(2)} ${quoteCurrency}) to satisfy CoinDCX minimum value (> 100 INR)`, 'info');

    const clientOrderId = `LIVE_ORD_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const liveOrderPayload = {
      side: 'buy',
      order_type: 'market_order',
      market: this.pair,
      total_quantity: quantity,
      client_order_id: clientOrderId,
    };
    if (this.leverage > 1) {
      liveOrderPayload.leverage = this.leverage;
    }

    this.log(`Submitting Live Order to CoinDCX: ${JSON.stringify(liveOrderPayload)}`, 'trade');
    let exchangeResponse;
    if (this.leverage > 1) {
      try {
        exchangeResponse = await this.coindcxService.createFuturesOrder(liveOrderPayload);
      } catch (futuresErr) {
        this.log(`Futures endpoint fallback to standard createOrder: ${futuresErr.message}`, 'warn');
        exchangeResponse = await this.coindcxService.createOrder(liveOrderPayload);
      }
    } else {
      exchangeResponse = await this.coindcxService.createOrder(liveOrderPayload);
    }
    this.log(`CoinDCX Live Order Response: ${JSON.stringify(exchangeResponse)}`, 'trade');

    const exchangeOrderId = exchangeResponse?.orders?.[0]?.id || exchangeResponse?.id || clientOrderId;

    const stopLossPrice = this.currentPrice * (1 - this.riskManager.stopLossPercent / 100);
    const takeProfitPrice = this.currentPrice * (1 + this.riskManager.takeProfitPercent / 100);
    const liquidationPrice = this.riskManager.calculateLiquidationPrice(this.currentPrice, this.leverage, 'buy');

    const livePosition = {
      positionId: `LIVE_POS_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      pair: this.pair,
      side: 'buy',
      entryPrice: this.currentPrice,
      quantity,
      margin: this.tradeAmount,
      leverage: this.leverage,
      liquidationPrice,
      stopLossPrice,
      takeProfitPrice,
      effectiveStopLossPrice: stopLossPrice,
      peakProfitPercent: 0,
      trailingActive: false,
      strategy: this.strategy.name,
      createdAt: new Date(),
    };

    this.activePositions.push(livePosition);
    this.riskManager.recordTradeExecution();

    this.lastBuy = {
      timestamp: new Date().toISOString(),
      timeFormatted: new Date().toLocaleTimeString(),
      price: this.currentPrice,
      quantity,
      leverage: this.leverage,
      margin: this.tradeAmount,
      orderValue: quantity * this.currentPrice,
      pair: this.pair,
      reason: this.lastSignal?.reason || 'Strategy Buy Signal',
      mode: 'LIVE_TRADING',
    };

    await this.orderService.recordOrder({
      exchangeOrderId,
      clientOrderId,
      pair: this.pair,
      side: 'buy',
      type: 'market_order',
      price: this.currentPrice,
      quantity,
      leverage: this.leverage,
      margin: this.tradeAmount,
      status: 'filled',
      mode: 'LIVE_TRADING',
    });

    this._notifyStateChange('status_change');
    this._notifyStateChange('trade', liveOrderPayload);

    const timeStr = new Date().toLocaleTimeString();
    this.log(
      `✅ BOUGHT at ${timeStr} — ${quantity} ${this.pair} @ $${this.currentPrice.toFixed(2)} | Reason: ${this.lastSignal?.reason || 'Strategy Buy Signal'}`,
      'trade'
    );
    this.lastLoggedReason = null;
  }

  /**
   * Close a specific position (SL, TP, or manual exit)
   */
  async _handleSellPosition(position, reason) {
    const isStopLoss = reason.toLowerCase().includes('stop-loss');
    const isTakeProfit = reason.toLowerCase().includes('take-profit');
    const logType = isStopLoss ? 'warn' : isTakeProfit ? 'info' : 'info';

    this.log(`Closing position ${position.positionId} on ${this.pair} - Reason: ${reason}`, logType);

    if (config.tradingMode === 'PAPER_TRADING') {
      try {
        const sellExecution = await this.paperEngine.executeSell({
          pair: position.pair || this.pair,
          positionId: position.positionId,
          currentPrice: this.currentPrice,
          reason,
        });

        const pnl = sellExecution.pnl;
        const pnlSign = pnl >= 0 ? '+' : '';
        const timeStr = new Date().toLocaleTimeString();
        const is3M = this.strategy.name === 'SCALPER_3M';
        const is15M = this.strategy.name === 'SCALPER_15M' || this.strategy.name === 'EMA_RSI';
        const tag = is3M ? '⚡ [3M SCALP]' : (is15M ? '⚡ [15M SCALP]' : '💰');
        this.log(
          `${tag} SOLD at ${timeStr} — ${this.pair} @ $${sellExecution.order.price.toFixed(2)} | P&L: ${pnlSign}${pnl.toFixed(2)}$ (${sellExecution.pnlPercent.toFixed(2)}%) | Reason: ${reason}`,
          'trade'
        );

        await this.orderService.recordOrder(sellExecution.order);
        await this.orderService.recordTrade(sellExecution.trade);
        this.riskManager.recordRealizedPnL(sellExecution.pnl);

        // Remove from active positions array
        this.activePositions = this.activePositions.filter((p) => p.positionId !== position.positionId);
        this.lastLoggedReason = null;

        this.lastSell = {
          timestamp: new Date().toISOString(),
          timeFormatted: new Date().toLocaleTimeString(),
          entryPrice: position.entryPrice,
          exitPrice: sellExecution.order.price,
          quantity: position.quantity,
          profit: pnl,
          pnlPercent: sellExecution.pnlPercent,
          reason,
          holdDurationSeconds: position.createdAt ? Math.floor((Date.now() - new Date(position.createdAt).getTime()) / 1000) : 0,
          pair: this.pair,
          mode: 'PAPER_TRADING',
        };

        // Reset cycle timing strictly from 1 second on sell
        this.cycleStartTime = Date.now();
        this.lastSellTime = Date.now();
        this.log(`🔄 Position closed & sold! Cycle timer reset to start from 1 sec for next cycle.`, 'info');

        this._notifyStateChange('status_change');
        this._notifyStateChange('trade', sellExecution.trade);
      } catch (err) {
        this.log(`Paper SELL execution error: ${err.message}`, 'error');
      }
    } else if (config.tradingMode === 'LIVE_TRADING') {
      try {
        await this._executeLiveSell(position, reason);
      } catch (err) {
        this.log(`Live SELL execution error: ${err.message}`, 'error');
      }
    }
  }

  /**
   * Close all active positions (used on global reversal exit signals)
   */
  async _handleSellAllPositions(reason) {
    const positions = [...this.activePositions];
    for (const pos of positions) {
      await this._handleSellPosition(pos, reason);
    }
  }

  /**
   * PHASE 10: Live Exit Order Execution for a specific position
   */
  async _executeLiveSell(position, reason) {
    this.log('Executing LIVE SELL order on CoinDCX exchange...', 'warn');

    const quantity = position?.quantity;
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
    const entryPrice = position.entryPrice;
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
      reason,
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
      reason,
      mode: 'LIVE_TRADING',
      strategy: this.strategy.name,
      status: 'closed',
      createdAt: position.createdAt || new Date(),
      closedAt: new Date(),
    });

    const pnlSign = grossPnL >= 0 ? '+' : '';
    const timeStr = new Date().toLocaleTimeString();
    this.log(
      `💰 SOLD at ${timeStr} — ${this.pair} @ $${exitPrice.toFixed(2)} | P&L: ${pnlSign}${grossPnL.toFixed(2)}$ (${pnlPercent.toFixed(2)}%) | Reason: ${reason}`,
      'trade'
    );
    this.lastLoggedReason = null;

    this.riskManager.recordRealizedPnL(grossPnL);
    this.activePositions = this.activePositions.filter((p) => p.positionId !== position.positionId);

    this.lastSell = {
      timestamp: new Date().toISOString(),
      timeFormatted: new Date().toLocaleTimeString(),
      entryPrice,
      exitPrice,
      quantity,
      profit: grossPnL,
      pnlPercent,
      reason,
      holdDurationSeconds: position.createdAt ? Math.floor((Date.now() - new Date(position.createdAt).getTime()) / 1000) : 0,
      pair: this.pair,
      mode: 'LIVE_TRADING',
    };

    // Reset cycle timing strictly from 1 second on sell
    this.cycleStartTime = Date.now();
    this.lastSellTime = Date.now();
    this.log(`🔄 Live position sold on exchange! Cycle timer reset to start from 1 sec for next cycle.`, 'info');

    this._notifyStateChange('status_change');
    this._notifyStateChange('trade', {
      pair: this.pair,
      profit: grossPnL,
      pnlPercent,
      reason,
    });
  }

  getStatus() {
    // Auto-refresh live CoinDCX balance if older than 10s
    if (config.tradingMode === 'LIVE_TRADING' && (Date.now() - (this.lastBalanceFetchTime || 0)) >= 10000) {
      this.fetchLiveBalances().catch(() => {});
    }

    const riskSummary = this.riskManager.getRiskSummary();
    const paperBalances = this.paperEngine.getBalances();

    // Enrich all active positions with live unrealized P&L and trailing parameters
    const enrichedPositions = this.activePositions.map((pos) => {
      const curPrice = this.currentPrice || pos.entryPrice;
      const lev = pos.leverage || this.leverage || 1;
      const unrealizedPnL = (curPrice - pos.entryPrice) * pos.quantity;
      const unrealizedPnLPercent = pos.margin && pos.margin > 0
        ? (unrealizedPnL / pos.margin) * 100
        : (pos.entryPrice > 0 ? ((curPrice - pos.entryPrice) / pos.entryPrice) * 100 * lev : 0);
      const peakProfitPercent = pos.peakProfitPercent || 0;
      const givebackPercent = peakProfitPercent > 0 ? Math.max(0, peakProfitPercent - unrealizedPnLPercent) : 0;
      const liqPrice = pos.liquidationPrice || (lev > 1 ? this.riskManager.calculateLiquidationPrice(pos.entryPrice, lev, pos.side || 'buy') : null);

      return {
        ...pos,
        leverage: lev,
        margin: pos.margin || (pos.entryPrice * pos.quantity / lev),
        liquidationPrice: liqPrice,
        currentPrice: curPrice,
        unrealizedPnL,
        unrealizedPnLPercent,
        currentProfitPercent: unrealizedPnLPercent,
        peakProfitPercent,
        trailingActive: Boolean(pos.trailingActive),
        effectiveStopLossPrice: pos.effectiveStopLossPrice || pos.stopLossPrice,
        givebackPercent: parseFloat(givebackPercent.toFixed(2)),
      };
    });

    const cycleDuration = this.strategy?.name === 'SCALPER_3M' ? 180 : 900;
    const now = Date.now();
    let cycleElapsedSeconds = 0;
    let cycleRemainingSeconds = cycleDuration;

    if (this.isRunning && this.cycleStartTime) {
      const rawElapsed = Math.max(0, Math.floor((now - this.cycleStartTime) / 1000));
      cycleElapsedSeconds = (rawElapsed % cycleDuration) + 1;
      cycleRemainingSeconds = Math.max(0, cycleDuration - (rawElapsed % cycleDuration));
    }

    const activePos = enrichedPositions[0] || null;
    const posElapsedSec = activePos && activePos.createdAt
      ? Math.floor((now - new Date(activePos.createdAt).getTime()) / 1000)
      : 0;

    return {
      isRunning: this.isRunning,
      cycleStartTime: this.cycleStartTime,
      lastSellTime: this.lastSellTime,
      lastBuy: this.lastBuy,
      lastSell: this.lastSell,
      emergencyStop: riskSummary.emergencyStop,
      mode: config.tradingMode,
      pair: this.pair,
      currentPrice: this.currentPrice,
      tradeAmount: this.tradeAmount,
      leverage: this.leverage,
      evalIntervalMs: this.evalIntervalMs,
      activePositions: enrichedPositions,
      activePosition: activePos, // Full backwards compatibility with existing UI
      lastSignal: this.lastSignal,
      indicators: this.lastIndicators,
      dailyRealizedPnL: this.paperEngine.getDailyPnL(),
      balances: config.tradingMode === 'LIVE_TRADING' ? this.liveBalances : paperBalances,
      isLive: config.tradingMode === 'LIVE_TRADING',
      riskLimits: riskSummary,
      strategy: this.strategy.name,
      availableStrategies: strategyRegistry.list(),
      recentLogs: this.logs.slice(0, 30),
      lastError: this.lastError,
      scalper3M: {
        isActive: this.strategy?.name === 'SCALPER_3M',
        elapsedSeconds: this.isRunning ? cycleElapsedSeconds : 0,
        cycleDurationSeconds: 180,
        timeRemainingSeconds: this.isRunning ? cycleRemainingSeconds : 180,
        hasActivePosition: Boolean(activePos),
      },
      scalper15M: {
        isActive: this.strategy?.name === 'SCALPER_15M' || this.strategy?.name === 'EMA_RSI',
        elapsedSeconds: this.isRunning ? cycleElapsedSeconds : 0,
        cycleDurationSeconds: 900,
        timeRemainingSeconds: this.isRunning ? cycleRemainingSeconds : 900,
        hasActivePosition: Boolean(activePos),
      },
      cycleInfo: {
        strategy: this.strategy.name,
        is15M: this.strategy.name === 'EMA_RSI' || this.strategy.name === 'SCALPER_15M' || this.strategy.name === 'MACD_RSI',
        is3M: this.strategy.name === 'SCALPER_3M',
        isRunning: this.isRunning,
        cycleStartTime: this.cycleStartTime,
        lastSellTime: this.lastSellTime,
        candleIntervalMinutes: this.strategy.name === 'SCALPER_3M' ? 3 : 15,
        candleDurationSeconds: cycleDuration,
        candleElapsedSeconds: this.isRunning ? cycleElapsedSeconds : 0,
        candleRemainingSeconds: this.isRunning ? cycleRemainingSeconds : cycleDuration,
        hasActivePosition: Boolean(activePos),
        positionElapsedSeconds: posElapsedSec,
        positionCreatedAt: activePos ? activePos.createdAt : null,
        entryPrice: activePos ? activePos.entryPrice : null,
      },
    };
  }

  async updateSettings(newSettings = {}) {
    if (newSettings.pair) this.pair = newSettings.pair.toUpperCase().replace(/[\/\-_]/g, '');
    if (newSettings.tradeAmount) this.tradeAmount = parseFloat(newSettings.tradeAmount);
    if (newSettings.leverage !== undefined) {
      const lev = parseInt(newSettings.leverage, 10);
      if (!isNaN(lev) && lev >= 1 && lev <= 100) {
        this.leverage = lev;
      }
    }

    if (newSettings.strategy) {
      this.setStrategy(newSettings.strategy);
    }

    if (newSettings.evalIntervalMs) {
      const newInterval = parseInt(newSettings.evalIntervalMs, 10);
      if (newInterval >= 1000 && newInterval !== this.evalIntervalMs) {
        this.evalIntervalMs = newInterval;
        if (this.isRunning) {
          clearInterval(this.intervalTimer);
          this.intervalTimer = setInterval(() => this.evaluateTick(), this.evalIntervalMs);
          this.log(`Evaluation interval updated to ${this.evalIntervalMs}ms`);
        }
      }
    }

    this.riskManager.updateLimits({ ...newSettings, leverage: this.leverage });

    // Save to Database
    if (getIsConnected()) {
      try {
        await BotSettings.findOneAndUpdate(
          {},
          {
            pair: this.pair,
            tradeAmount: this.tradeAmount,
            leverage: this.leverage,
            stopLossPercent: this.riskManager.stopLossPercent,
            takeProfitPercent: this.riskManager.takeProfitPercent,
            trailingActivationPercent: this.riskManager.trailingActivationPercent,
            trailingGivebackPercent: this.riskManager.trailingGivebackPercent,
            breakevenTriggerPercent: this.riskManager.breakevenTriggerPercent,
            maxDailyLoss: this.riskManager.maxDailyLoss,
            maxOpenPositions: this.riskManager.maxOpenPositions,
            cooldownSeconds: this.riskManager.cooldownSeconds,
            strategy: this.strategy.name,
            evalIntervalMs: this.evalIntervalMs,
          },
          { upsert: true, new: true }
        );
      } catch (err) {
        console.warn('Could not persist updated settings to MongoDB:', err.message);
      }
    }

    this.log(`Bot settings updated: Pair=${this.pair}, Amount=$${this.tradeAmount}, Leverage=${this.leverage}x, Strategy=${this.strategy.name}, Interval=${this.evalIntervalMs}ms`);
    this._notifyStateChange('settings_change');
    return this.getStatus();
  }

  /**
   * Instantly executes a simulated paper trade cycle (BUY + SELL with profit)
   */
  async simulateDemoTrade({ profitPercent = 1.5 } = {}) {
    if (config.tradingMode !== 'PAPER_TRADING') {
      return {
        success: false,
        message: 'Simulated trades are strictly allowed only in PAPER_TRADING mode.',
      };
    }

    if (this.riskManager.emergencyStop) {
      return {
        success: false,
        message: 'Cannot simulate trade while Emergency Stop is active.',
      };
    }

    try {
      this.log('⚡ Starting instantaneous Demo Trade simulation...', 'info');

      let executionPrice = this.currentPrice;
      try {
        const ticker = await this.marketService.getTicker(this.pair);
        if (ticker && ticker.last_price && !ticker.isSyntheticFallback && !ticker.isFakePrice) {
          executionPrice = parseFloat(ticker.last_price);
          this.currentPrice = executionPrice;
        }
      } catch (err) {
        if (!executionPrice || executionPrice <= 0) executionPrice = 85000;
      }

      // Execute Paper BUY
      const buyExecution = await this.paperEngine.executeBuy({
        pair: this.pair,
        amountQuote: this.tradeAmount || 50,
        leverage: this.leverage || 1,
        currentPrice: executionPrice,
        stopLossPercent: this.riskManager.stopLossPercent || 2.0,
        takeProfitPercent: this.riskManager.takeProfitPercent || 4.0,
        strategy: 'DEMO_SIMULATION',
      });

      this.activePositions.push(buyExecution.position);
      await this.orderService.recordOrder(buyExecution.order);
      const timeStrBuy = new Date().toLocaleTimeString();
      const levBadge = (this.leverage || 1) > 1 ? ` [${this.leverage}x Leverage]` : '';
      this.log(
        `✅ BOUGHT at ${timeStrBuy} — ${buyExecution.position.quantity.toFixed(6)} ${this.pair} @ $${buyExecution.position.entryPrice.toFixed(2)}${levBadge} | Reason: Demo Simulation`,
        'trade'
      );

      // Immediately simulate profitable SELL
      const exitPrice = executionPrice * (1 + profitPercent / 100);
      const sellExecution = await this.paperEngine.executeSell({
        pair: this.pair,
        positionId: buyExecution.position.positionId,
        currentPrice: exitPrice,
        reason: `Demo Simulation: Target Profit Hit (+${profitPercent}%)`,
      });

      this.activePositions = this.activePositions.filter((p) => p.positionId !== buyExecution.position.positionId);
      await this.orderService.recordOrder(sellExecution.order);
      await this.orderService.recordTrade(sellExecution.trade);
      this.riskManager.recordRealizedPnL(sellExecution.pnl);

      const pnlFormatted = sellExecution.pnl >= 0 ? `+$${sellExecution.pnl.toFixed(2)}` : `-$${Math.abs(sellExecution.pnl).toFixed(2)}`;
      const pnlSign = sellExecution.pnl >= 0 ? '+' : '';
      const timeStrSell = new Date().toLocaleTimeString();
      this.log(
        `💰 SOLD at ${timeStrSell} — ${this.pair} @ $${sellExecution.order.price.toFixed(2)} | P&L: ${pnlSign}${sellExecution.pnl.toFixed(2)}$ (${sellExecution.pnlPercent.toFixed(2)}%) | Reason: Demo Simulation: Target Profit Hit (+${profitPercent}%)`,
        'trade'
      );

      this._notifyStateChange('status_change');
      this._notifyStateChange('trade', sellExecution.trade);

      return {
        success: true,
        message: `Demo trade executed successfully! Realized P&L: ${pnlFormatted}`,
        trade: sellExecution.trade,
        status: this.getStatus(),
      };
    } catch (err) {
      this.log(`Demo trade simulation error: ${err.message}`, 'error');
      return { success: false, message: err.message };
    }
  }
}

// Export singleton instance
const botInstance = new TradingBot();

module.exports = botInstance;
