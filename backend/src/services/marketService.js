const CoinDCXService = require('./coindcxService');

class MarketService {
  constructor(coindcxService = null) {
    this.coindcx = coindcxService || new CoinDCXService();
    this.marketDetailsCache = new Map();
    this.lastCacheTime = 0;
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes cache for market specifications

    // In-memory ticker cache to avoid downloading full exchange ticker array repeatedly
    this.tickersCache = null;
    this.lastTickerCacheTime = 0;
    this.tickerCacheTTL = 3000; // 3 seconds cache
    this.lastPairPriceCache = new Map(); // Last known price per pair for fallback
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
   * Retrieves ticker for a specific pair or all tickers with caching and fallback
   */
  async getTicker(pair = null) {
    const normalized = pair ? this.normalizePair(pair) : null;
    const now = Date.now();

    // Check ticker cache if fresh
    if (this.tickersCache && now - this.lastTickerCacheTime < this.tickerCacheTTL) {
      if (normalized) {
        const found = this.tickersCache.find((t) => t.market === normalized);
        if (found) return found;
      } else {
        return this.tickersCache;
      }
    }

    try {
      const result = await this.coindcx.getTicker(normalized);
      if (normalized && result && result.last_price) {
        this.lastPairPriceCache.set(normalized, result);
        return result;
      } else if (Array.isArray(result)) {
        this.tickersCache = result;
        this.lastTickerCacheTime = now;
        for (const t of result) {
          if (t.market) this.lastPairPriceCache.set(t.market, t);
        }
        return result;
      }
      return result;
    } catch (err) {
      // If network timed out, use last known ticker from cache
      if (normalized && this.lastPairPriceCache.has(normalized)) {
        return this.lastPairPriceCache.get(normalized);
      }
      throw err;
    }
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
   * Aggregate 1m candles into 5m or custom interval candle buckets
   */
  aggregateCandles(candles, factorMinutes = 5) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const intervalMs = factorMinutes * 60 * 1000;
    const groups = new Map();

    for (const c of candles) {
      const timeMs = typeof c.time === 'number' ? c.time : new Date(c.time).getTime();
      const bucket = Math.floor(timeMs / intervalMs) * intervalMs;
      if (!groups.has(bucket)) {
        groups.set(bucket, []);
      }
      groups.get(bucket).push(c);
    }

    const aggregated = [];
    const sortedBuckets = Array.from(groups.keys()).sort((a, b) => a - b);

    for (const bucket of sortedBuckets) {
      const items = groups.get(bucket);
      if (!items || items.length === 0) continue;

      const open = parseFloat(items[0].open);
      const close = parseFloat(items[items.length - 1].close);
      let high = -Infinity;
      let low = Infinity;
      let volume = 0;

      for (const item of items) {
        const h = parseFloat(item.high);
        const l = parseFloat(item.low);
        const v = parseFloat(item.volume || 0);
        if (h > high) high = h;
        if (l < low) low = l;
        volume += v;
      }

      aggregated.push({
        open,
        high: high === -Infinity ? open : high,
        low: low === Infinity ? open : low,
        close,
        volume: parseFloat(volume.toFixed(4)),
        time: bucket,
      });
    }

    return aggregated;
  }

  /**
   * Get historical candlestick data for charting and technical indicator computation.
   * CoinDCX native intervals are strictly: ['1m', '15m', '1h', '1d'].
   * When '5m' is requested, fetches 1m candles and aggregates them cleanly.
   */
  async getCandles(pair, interval = '1m', limit = 100) {
    const exchangePair = await this.getExchangePairName(pair);

    // If 5m is requested, fetch 1m candles (limit * 5) and aggregate into 5m candles
    if (interval === '5m') {
      const rawLimit = Math.min(Math.max(limit * 5, 50), 500);
      try {
        const oneMinCandles = await this.coindcx.getCandles({
          pair: exchangePair,
          interval: '1m',
          limit: rawLimit,
        });
        const aggregated = this.aggregateCandles(oneMinCandles, 5);
        if (aggregated.length > 0) {
          return aggregated.slice(-limit);
        }
      } catch (err) {
        console.warn(`5m candle aggregation warning: ${err.message}. Falling back to 1m.`);
      }
    }

    const nativeIntervals = ['1m', '15m', '1h', '1d'];
    const safeInterval = nativeIntervals.includes(interval) ? interval : '1m';

    return await this.coindcx.getCandles({ pair: exchangePair, interval: safeInterval, limit });
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
