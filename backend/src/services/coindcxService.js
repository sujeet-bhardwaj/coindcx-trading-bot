const crypto = require('crypto');
const axios = require('axios');
const config = require('../config/env');

class CoinDCXService {
  constructor(options = {}) {
    this.apiKey = options.apiKey || config.coindcx.apiKey;
    this.apiSecret = options.apiSecret || config.coindcx.apiSecret;
    this.apiBaseUrl = options.apiBaseUrl || config.coindcx.apiBaseUrl;
    this.publicBaseUrl = options.publicBaseUrl || config.coindcx.publicBaseUrl;

    this.client = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Generates HMAC-SHA256 signature for private CoinDCX API requests.
   * @param {Object|string} payload - The body/parameters payload to sign.
   * @returns {string} - Hexadecimal signature string.
   */
  generateSignature(payload) {
    if (!this.apiSecret) {
      throw new Error('CoinDCX API Secret is required to generate signature');
    }
    const jsonString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(jsonString)
      .digest('hex');
  }

  /**
   * Generates authentication headers for CoinDCX private endpoints.
   * @param {Object} body - Request body containing at least a timestamp.
   * @returns {Object} Headers with X-AUTH-APIKEY, X-AUTH-SIGNATURE, Content-Type
   */
  getAuthHeaders(body) {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('CoinDCX API Key and Secret must be configured for private requests');
    }
    const signature = this.generateSignature(body);
    return {
      'X-AUTH-APIKEY': this.apiKey,
      'X-AUTH-SIGNATURE': signature,
      'Content-Type': 'application/json',
    };
  }

  /**
   * PUBLIC: Fetches real-time tickers for all active pairs.
   * Endpoint: GET https://api.coindcx.com/exchange/ticker
   */
  async getTicker(pair = null) {
    try {
      const response = await this.client.get(`${this.apiBaseUrl}/exchange/ticker`);
      const tickers = response.data;
      if (pair) {
        const normalizedPair = pair.toUpperCase().replace(/[-_]/g, '');
        const match = tickers.find((t) => t.market === normalizedPair || t.market === pair);
        if (!match) {
          throw new Error(`Market ticker not found for pair: ${pair}`);
        }
        return match;
      }
      return tickers;
    } catch (error) {
      this._handleError('getTicker', error);
    }
  }

  /**
   * PUBLIC: Fetches market list.
   * Endpoint: GET https://api.coindcx.com/exchange/v1/markets
   */
  async getMarkets() {
    try {
      const response = await this.client.get(`${this.apiBaseUrl}/exchange/v1/markets`);
      return response.data;
    } catch (error) {
      this._handleError('getMarkets', error);
    }
  }

  /**
   * PUBLIC: Fetches detailed specifications for all pairs (min_quantity, min_notional, step, etc.).
   * Endpoint: GET https://api.coindcx.com/exchange/v1/markets_details
   */
  async getMarketsDetails(pair = null) {
    try {
      const response = await this.client.get(`${this.apiBaseUrl}/exchange/v1/markets_details`);
      const markets = response.data;
      if (pair) {
        const normalizedPair = pair.toUpperCase().replace(/[-_]/g, '');
        const match = markets.find(
          (m) =>
            m.symbol === normalizedPair ||
            m.coindcx_name === normalizedPair ||
            m.pair === pair
        );
        return match || null;
      }
      return markets;
    } catch (error) {
      this._handleError('getMarketsDetails', error);
    }
  }

  /**
   * PUBLIC: Fetches order book depth.
   * Endpoint: GET https://public.coindcx.com/market_data/orderbook?pair=...
   */
  async getOrderBook(pair = 'B-BTC_USDT') {
    try {
      const response = await this.client.get(`${this.publicBaseUrl}/market_data/orderbook`, {
        params: { pair },
      });
      return response.data;
    } catch (error) {
      this._handleError('getOrderBook', error);
    }
  }

  /**
   * PUBLIC: Fetches historical OHLCV candlestick data for strategy indicator calculation.
   * Endpoint: GET https://public.coindcx.com/market_data/candles
   * @param {Object} params - { pair, interval, limit, startTime, endTime }
   */
  async getCandles({ pair = 'B-BTC_USDT', interval = '1m', limit = 100 } = {}) {
    try {
      const response = await this.client.get(`${this.publicBaseUrl}/market_data/candles`, {
        params: { pair, interval, limit },
      });
      // Response is usually array of { open, high, low, close, volume, time }
      // Sorted chronologically oldest to newest for indicator analysis
      const candles = Array.isArray(response.data) ? response.data : [];
      return candles.slice().reverse();
    } catch (error) {
      this._handleError('getCandles', error);
    }
  }

  /**
   * PRIVATE: Fetches real account balances from CoinDCX.
   * Endpoint: POST https://api.coindcx.com/exchange/v1/users/balances
   */
  async getBalances() {
    try {
      const body = {
        timestamp: Date.now(),
      };
      const headers = this.getAuthHeaders(body);
      const response = await this.client.post(
        `${this.apiBaseUrl}/exchange/v1/users/balances`,
        body,
        { headers }
      );
      return response.data;
    } catch (error) {
      this._handleError('getBalances', error);
    }
  }

  /**
   * PRIVATE: Submits an order to CoinDCX exchange.
   * Endpoint: POST https://api.coindcx.com/exchange/v1/orders/create
   * @param {Object} orderData - { side, order_type, market, price_per_unit, total_quantity, client_order_id }
   */
  async createOrder(orderData) {
    try {
      const body = {
        side: orderData.side, // 'buy' or 'sell'
        order_type: orderData.order_type || 'market_order', // 'market_order' or 'limit_order'
        market: orderData.market, // e.g. 'BTCUSDT'
        total_quantity: orderData.total_quantity,
        timestamp: Date.now(),
      };

      if (orderData.price_per_unit && orderData.order_type !== 'market_order') {
        body.price_per_unit = orderData.price_per_unit;
      }

      if (orderData.client_order_id) {
        body.client_order_id = orderData.client_order_id;
      }

      const headers = this.getAuthHeaders(body);
      const response = await this.client.post(
        `${this.apiBaseUrl}/exchange/v1/orders/create`,
        body,
        { headers }
      );
      return response.data;
    } catch (error) {
      this._handleError('createOrder', error);
    }
  }

  /**
   * PRIVATE: Fetches the status of an existing order.
   * Endpoint: POST https://api.coindcx.com/exchange/v1/orders/status
   * @param {string} orderId - CoinDCX order ID or client_order_id
   */
  async getOrderStatus(orderId) {
    try {
      const body = {
        id: orderId,
        timestamp: Date.now(),
      };
      const headers = this.getAuthHeaders(body);
      const response = await this.client.post(
        `${this.apiBaseUrl}/exchange/v1/orders/status`,
        body,
        { headers }
      );
      return response.data;
    } catch (error) {
      this._handleError('getOrderStatus', error);
    }
  }

  /**
   * PRIVATE: Cancels an open order.
   * Endpoint: POST https://api.coindcx.com/exchange/v1/orders/cancel
   * @param {string} orderId - CoinDCX order ID
   */
  async cancelOrder(orderId) {
    try {
      const body = {
        id: orderId,
        timestamp: Date.now(),
      };
      const headers = this.getAuthHeaders(body);
      const response = await this.client.post(
        `${this.apiBaseUrl}/exchange/v1/orders/cancel`,
        body,
        { headers }
      );
      return response.data;
    } catch (error) {
      this._handleError('cancelOrder', error);
    }
  }

  /**
   * PRIVATE: Retrieves active/open orders for a specific market.
   * Endpoint: POST https://api.coindcx.com/exchange/v1/orders/active_orders
   */
  async getActiveOrders(market = null) {
    try {
      const body = {
        timestamp: Date.now(),
      };
      if (market) {
        body.market = market;
      }
      const headers = this.getAuthHeaders(body);
      const response = await this.client.post(
        `${this.apiBaseUrl}/exchange/v1/orders/active_orders`,
        body,
        { headers }
      );
      return response.data;
    } catch (error) {
      this._handleError('getActiveOrders', error);
    }
  }

  /**
   * Centralized safe error handler.
   * Formats error message without exposing secret keys or sensitive tokens.
   */
  _handleError(action, error) {
    let message = `CoinDCXService [${action}] failed: `;
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      message += `Status ${status} - ${typeof data === 'object' ? JSON.stringify(data) : data}`;
    } else if (error.request) {
      message += `No response from server. Network timeout or connectivity issue.`;
    } else {
      message += error.message;
    }
    const safeError = new Error(message);
    safeError.originalError = error;
    throw safeError;
  }
}

module.exports = CoinDCXService;
