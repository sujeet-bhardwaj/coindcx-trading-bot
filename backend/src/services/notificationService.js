/**
 * Multi-Channel Notification Service (Rules #88 & #89)
 *
 * Decoupled notification architecture supporting console, webhooks, Telegram, etc.
 * Does not hard-code any single provider into the core trading engine.
 */

const AlertTypes = {
  BUY_EXECUTED: 'BUY_EXECUTED',
  SHORT_EXECUTED: 'SHORT_EXECUTED',
  SELL_EXECUTED: 'SELL_EXECUTED',
  STOP_LOSS_TRIGGERED: 'STOP_LOSS_TRIGGERED',
  PROFIT_LOCK_ACTIVATED: 'PROFIT_LOCK_ACTIVATED',
  PROFIT_LOCK_INCREASED: 'PROFIT_LOCK_INCREASED',
  PROFIT_LOCK_EXIT: 'PROFIT_LOCK_EXIT',
  API_FAILURE: 'API_FAILURE',
  REPEATED_API_FAILURE: 'REPEATED_API_FAILURE',
  HTTP_429: 'HTTP_429',
  ORDER_REJECTED: 'ORDER_REJECTED',
  PARTIAL_FILL: 'PARTIAL_FILL',
  PROTECTION_FAILED: 'PROTECTION_FAILED',
  UNEXPECTED_POSITION: 'UNEXPECTED_POSITION',
  STATE_MISMATCH: 'STATE_MISMATCH',
  DAILY_LOSS_LIMIT_REACHED: 'DAILY_LOSS_LIMIT_REACHED',
  CONSECUTIVE_LOSS_LIMIT_REACHED: 'CONSECUTIVE_LOSS_LIMIT_REACHED',
  EMERGENCY_STOP_ACTIVATED: 'EMERGENCY_STOP_ACTIVATED',
  BOT_RESTARTED: 'BOT_RESTARTED',
  EXCHANGE_MAINTENANCE: 'EXCHANGE_MAINTENANCE',
  BOT_CRASHED: 'BOT_CRASHED',
  BOT_RECOVERED: 'BOT_RECOVERED',
};

class BaseNotificationProvider {
  constructor(name = 'base') {
    this.name = name;
  }
  async send(alert) {
    throw new Error('send() must be implemented by provider');
  }
}

class ConsoleNotificationProvider extends BaseNotificationProvider {
  constructor() {
    super('console');
  }
  async send(alert) {
    const icon = alert.severity === 'CRITICAL' ? '🚨' : alert.severity === 'WARN' ? '⚠️' : '📢';
    const logMethod = alert.severity === 'CRITICAL' ? console.error : alert.severity === 'WARN' ? console.warn : console.log;
    logMethod(`[NOTIFY] ${icon} [${alert.type}] ${alert.title}: ${alert.message}`);
    return { success: true, provider: this.name };
  }
}

class WebhookNotificationProvider extends BaseNotificationProvider {
  constructor(webhookUrl = null) {
    super('webhook');
    this.webhookUrl = webhookUrl;
  }
  async send(alert) {
    if (!this.webhookUrl) return { skipped: true, reason: 'No webhook URL configured' };
    try {
      const axios = require('axios');
      await axios.post(this.webhookUrl, alert, { timeout: 3000 });
      return { success: true, provider: this.name };
    } catch (err) {
      return { success: false, provider: this.name, error: err.message };
    }
  }
}

class TelegramNotificationProvider extends BaseNotificationProvider {
  constructor(botToken = null, chatId = null) {
    super('telegram');
    this.botToken = botToken;
    this.chatId = chatId;
  }
  async send(alert) {
    if (!this.botToken || !this.chatId) {
      return { skipped: true, reason: 'Telegram credentials not configured' };
    }
    try {
      const axios = require('axios');
      const text = `🔔 *CoinDCX Bot Alert*\n*Type:* ${alert.type}\n*Message:* ${alert.message}\n*Time:* ${alert.timestamp}`;
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      await axios.post(url, {
        chat_id: this.chatId,
        text,
        parse_mode: 'Markdown',
      }, { timeout: 4000 });
      return { success: true, provider: this.name };
    } catch (err) {
      return { success: false, provider: this.name, error: err.message };
    }
  }
}

class NotificationService {
  constructor() {
    this.providers = [];
    this.alertHistory = [];
    this.maxHistory = 100;

    // Register default console provider
    this.addProvider(new ConsoleNotificationProvider());

    // Register optional Telegram provider if env variables exist
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (token && chatId) {
      this.addProvider(new TelegramNotificationProvider(token, chatId));
    }
  }

  addProvider(provider) {
    if (provider && typeof provider.send === 'function') {
      this.providers.push(provider);
    }
  }

  /**
   * Broadcasts alert across all registered providers
   * @param {string} type - From AlertTypes
   * @param {Object} options - { title, message, severity, meta }
   */
  async sendAlert(type, { title = '', message = '', severity = 'INFO', meta = {} } = {}) {
    const alert = {
      id: `ALT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: type || AlertTypes.BUY_EXECUTED,
      title: title || type,
      message,
      severity, // 'INFO' | 'WARN' | 'CRITICAL'
      timestamp: new Date().toISOString(),
      meta,
    };

    this.alertHistory.unshift(alert);
    if (this.alertHistory.length > this.maxHistory) {
      this.alertHistory.pop();
    }

    // Dispatch to all providers asynchronously without blocking caller
    const dispatchPromises = this.providers.map((p) =>
      p.send(alert).catch((err) => ({ provider: p.name, error: err.message }))
    );

    return Promise.allSettled(dispatchPromises);
  }

  getRecentAlerts(limit = 20) {
    return this.alertHistory.slice(0, limit);
  }
}

const defaultNotificationService = new NotificationService();

module.exports = {
  AlertTypes,
  NotificationService,
  BaseNotificationProvider,
  ConsoleNotificationProvider,
  WebhookNotificationProvider,
  TelegramNotificationProvider,
  notificationService: defaultNotificationService,
};
