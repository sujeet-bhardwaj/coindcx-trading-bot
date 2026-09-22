const CoinDCXService = require('./coindcxService');

class MarketService {
  constructor(coindcxService = null) {
    this.coindcx = coindcxService || new CoinDCXService();
    this.marketDetailsCache = new Map();
    this.lastCacheTime = 0;
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes cache for market specifications
  }

  /**
   * Normalize user pair format e.g. "BTC/USDT", "btc-usdt", "BTC_USDT" -> "BTCUSDT"
   */
  normalizePair(pair) {
    if (!pair) return 'BTCUSDT';
    return pair.toUpperCase().replace(/[\/\-_]/g, '');
  }

  /**
   * Get formatted pair for CoinDCX public candle/orderbook endpoints (e.g., 'B-BTC_USDT' or 'I-BTC_INR')
   */
  async getExchangePairName(pair) {
    const details = await this.getMarketDetails(pair);
    if (details && details.pair) {
      return details.pair;
    }
    const clean = this.normalizePair(pair);
    if (clean.endsWith('USDT')) {
      return `B-${clean.slice(0, -4)}_USDT`;
    }
    if (clean.endsWith('INR')) {
      return `I-${clean.slice(0, -3)}_INR`;
    }
    return `B-${clean}`;
  }

  /**
   * Retrieves ticker for a specific pair or all tickers
   */
  async getTicker(pair = null) {
    if (pair) {
      const normalized = this.normalizePair(pair);
      return await this.coindcx.getTicker(normalized);
    }
    return await this.coindcx.getTicker();
  }

  /**
   * Retrieves specifications for a trading pair (precision, min_quantity, min_notional, etc.)
   */
  async getMarketDetails(pair) {
    const normalized = this.normalizePair(pair);
    const now = Date.now();

    // Check cache
    if (this.marketDetailsCache.has(normalized) && now - this.lastCacheTime < this.cacheTTL) {
      return this.marketDetailsCache.get(normalized);
    }

    const allMarkets = await this.coindcx.getMarketsDetails();
    if (Array.isArray(allMarkets)) {
      this.marketDetailsCache.clear();
      for (const m of allMarkets) {
        if (m.symbol) this.marketDetailsCache.set(m.symbol, m);
        if (m.coindcx_name) this.marketDetailsCache.set(m.coindcx_name, m);
      }
      this.lastCacheTime = now;
    }

    return this.marketDetailsCache.get(normalized) || null;
  }

  /**
   * List popular and supported trading pairs for the bot
   */
  async getSupportedPairs() {
    const preferred = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BTCINR', 'ETHINR', 'DOGEUSDT', 'ADAUSDT'];
    const tickers = await this.getTicker();
    if (!Array.isArray(tickers)) return [];

    const available = tickers
      .filter((t) => preferred.includes(t.market) || t.market.endsWith('USDT') || t.market.endsWith('INR'))
      .map((t) => ({
        market: t.market,
        last_price: parseFloat(t.last_price),
        change_24h: parseFloat(t.change_24_hour),
        high: parseFloat(t.high),
        low: parseFloat(t.low),
        volume: parseFloat(t.volume),
      }));

    // Prioritize preferred pairs
    available.sort((a, b) => {
      const aPref = preferred.indexOf(a.market);
      const bPref = preferred.indexOf(b.market);
      if (aPref !== -1 && bPref !== -1) return aPref - bPref;
      if (aPref !== -1) return -1;
      if (bPref !== -1) return 1;
      return b.volume - a.volume;
    });

    return available.slice(0, 30);
  }

  /**
   * Get historical candlestick data for charting and technical indicator computation
   */
  async getCandles(pair, interval = '1m', limit = 100) {
    const exchangePair = await this.getExchangePairName(pair);
    return await this.coindcx.getCandles({ pair: exchangePair, interval, limit });
  }

  /**
   * Get order book depth
   */
  async getOrderBook(pair) {
    const exchangePair = await this.getExchangePairName(pair);
    return await this.coindcx.getOrderBook(exchangePair);
  }
}

module.exports = MarketService;
