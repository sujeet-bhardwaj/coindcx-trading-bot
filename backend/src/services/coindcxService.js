const crypto = require('crypto');
const axios = require('axios');
const config = require('../config/env');

class CoinDCXService {
  constructor(options = {}) {
    this.apiKey = options.apiKey !== undefined ? options.apiKey : config.coindcx.apiKey;
    this.apiSecret = options.apiSecret !== undefined ? options.apiSecret : config.coindcx.apiSecret;
    this.apiBaseUrl = options.apiBaseUrl || config.coindcx.apiBaseUrl;
    this.publicBaseUrl = options.publicBaseUrl || config.coindcx.publicBaseUrl;

    this.client = axios.create({
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });
  }

  /**
   * Checks whether CoinDCX API Key is set and non-empty.
   * @returns {boolean}
   */
  hasApiKey() {
    return Boolean(this.apiKey && typeof this.apiKey === 'string' && this.apiKey.trim().length > 0);
  }

  /**
   * Checks whether CoinDCX API Secret is set and non-empty.
   * @returns {boolean}
   */
  hasApiSecret() {
    return Boolean(this.apiSecret && typeof this.apiSecret === 'string' && this.apiSecret.trim().length > 0);
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
    const normalizedPair = pair ? pair.toUpperCase().replace(/[-_]/g, '') : null;

    // 1. Try Primary CoinDCX endpoint
    try {
      const response = await this.client.get(`${this.apiBaseUrl}/exchange/ticker`);
      const tickers = response.data;
      if (normalizedPair) {
        const match = Array.isArray(tickers) ? tickers.find((t) => t.market === normalizedPair || t.market === pair) : null;
        if (match) return match;
        throw new Error(`Ticker not found for ${normalizedPair} on primary endpoint`);
      } else {
        return Array.isArray(tickers) ? tickers : [];
      }
    } catch (primaryError) {
      // 2. Try Secondary Public CoinDCX endpoint
      try {
        const fallbackRes = await this.client.get(`${this.publicBaseUrl}/exchange/ticker`);
        const tickers = fallbackRes.data;
        if (normalizedPair) {
          const match = Array.isArray(tickers) ? tickers.find((t) => t.market === normalizedPair || t.market === pair) : null;
          if (match) return match;
          throw new Error(`Ticker not found for ${normalizedPair} on secondary endpoint`);
        } else {
          return Array.isArray(tickers) ? tickers : [];
        }
      } catch (secondaryError) {
        // 3. Fallback to Binance public ticker if USDT pair (Real live exchange price)
        if (normalizedPair && (normalizedPair.endsWith('USDT') || normalizedPair.endsWith('BUSD'))) {
          try {
            const binanceRes = await this.client.get(
              `https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${normalizedPair}`
            );
            const b = binanceRes.data;
            if (b && b.lastPrice) {
              return {
                market: normalizedPair,
                last_price: b.lastPrice,
                change_24_hour: b.priceChangePercent,
                high: b.highPrice,
                low: b.lowPrice,
                volume: b.volume,
                isFallback: true,
                isSyntheticFallback: false,
                source: 'binance_mirror',
              };
            }
          } catch (binanceErr) {
            // pass through to error handler
          }
        }
        // 4. Return mock synthetic fallback object (MUST be rejected by tradingBot)
        if (normalizedPair) {
          return {
            market: normalizedPair,
            last_price: '85000.00',
            change_24_hour: '0.00',
            high: '85000.00',
            low: '85000.00',
            volume: '0.00',
            isFallback: true,
            isSyntheticFallback: true,
            isFakePrice: true,
            source: 'synthetic_mock',
          };
        }
        this._handleError('getTicker', primaryError);
      }
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
    const allowedIntervals = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '1d'];
    const safeInterval = allowedIntervals.includes(interval) ? interval : '1m';

    try {
      const response = await this.client.get(`${this.publicBaseUrl}/market_data/candles`, {
        params: { pair, interval: safeInterval, limit },
      });
      const candles = Array.isArray(response.data) ? response.data : [];
      if (candles.length > 0) {
        return candles.slice().reverse();
      }
      throw new Error(`Primary endpoint returned empty candle array for ${pair}`);
    } catch (error) {
      // Robust fallback to Binance klines for USDT pairs if CoinDCX endpoint times out
      const cleanPair = pair.replace(/^B-|^I-/, '').replace(/_/g, '');
      if (cleanPair.endsWith('USDT')) {
        try {
          const binanceInterval = interval || '1m';
          const binanceUrl = `https://data-api.binance.vision/api/v3/klines?symbol=${cleanPair}&interval=${binanceInterval}&limit=${limit}`;
          const binanceRes = await this.client.get(binanceUrl);
          if (Array.isArray(binanceRes.data) && binanceRes.data.length > 0) {
            return binanceRes.data.map((k) => ({
              time: k[0],
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              volume: parseFloat(k[5]),
            }));
          }
        } catch (bErr) {
          // ignore fallback error
        }
      }
      // Never return undefined; return empty array so UI routes don't crash
      return [];
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

      if (orderData.leverage && orderData.leverage > 1) {
        body.leverage = parseInt(orderData.leverage, 10);
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
   * PRIVATE: Submits a derivatives/futures order with leverage to CoinDCX.
   * Endpoint: POST https://api.coindcx.com/exchange/v1/derivatives/futures/orders/create
   * @param {Object} orderData - { side, pair, order_type, price, total_quantity, leverage, client_order_id }
   */
  async createFuturesOrder(orderData) {
    try {
      const body = {
        side: orderData.side,
        pair: orderData.pair || orderData.market,
        order_type: orderData.order_type || 'market_order',
        total_quantity: orderData.total_quantity,
        leverage: parseInt(orderData.leverage, 10) || 1,
        timestamp: Date.now(),
      };

      if (orderData.price && orderData.order_type !== 'market_order') {
        body.price = orderData.price;
      }

      if (orderData.client_order_id) {
        body.client_order_id = orderData.client_order_id;
      }

      const headers = this.getAuthHeaders(body);
      const response = await this.client.post(
        `${this.apiBaseUrl}/exchange/v1/derivatives/futures/orders/create`,
        body,
        { headers }
      );
      return response.data;
    } catch (error) {
      this._handleError('createFuturesOrder', error);
    }
  }

  /**
   * PRIVATE: Updates user leverage on CoinDCX derivatives/futures market.
   * Endpoint: POST https://api.coindcx.com/exchange/v1/derivatives/futures/positions/create_leverage
   */
  async setLeverage(pair, leverage = 1) {
    try {
      const body = {
        pair,
        leverage: parseInt(leverage, 10) || 1,
        timestamp: Date.now(),
      };
      const headers = this.getAuthHeaders(body);
      const response = await this.client.post(
        `${this.apiBaseUrl}/exchange/v1/derivatives/futures/positions/create_leverage`,
        body,
        { headers }
      );
      return response.data;
    } catch (error) {
      console.warn(`[COINDCX] setLeverage blip: ${error.message}`);
      return null;
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
