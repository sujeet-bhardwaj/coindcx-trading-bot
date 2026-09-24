const MarketService = require('../services/marketService');

const marketService = new MarketService();

async function getTicker(req, res, next) {
  try {
    const pair = req.params.pair || 'BTCUSDT';
    const ticker = await marketService.getTicker(pair);
    return res.json({
      success: true,
      pair,
      ticker,
    });
  } catch (error) {
    next(error);
  }
}

async function getSupportedPairs(req, res, next) {
  try {
    const pairs = await marketService.getSupportedPairs();
    return res.json({
      success: true,
      count: pairs.length,
      pairs,
    });
  } catch (error) {
    next(error);
  }
}

async function getMarketDetails(req, res, next) {
  try {
    const pair = req.params.pair || 'BTCUSDT';
    const details = await marketService.getMarketDetails(pair);
    return res.json({
      success: true,
      pair,
      details,
    });
  } catch (error) {
    next(error);
  }
}

async function getCandles(req, res, next) {
  try {
    const pair = req.params.pair || 'BTCUSDT';
    const interval = req.query.interval || '1m';
    const limit = parseInt(req.query.limit, 10) || 50;

    const rawCandles = await marketService.getCandles(pair, interval, limit);
    const candles = Array.isArray(rawCandles) ? rawCandles : [];
    return res.json({
      success: true,
      pair,
      interval,
      count: candles.length,
      candles,
    });
  } catch (error) {
    next(error);
  }
}

async function getOrderBook(req, res, next) {
  try {
    const pair = req.params.pair || 'BTCUSDT';
    const orderBook = await marketService.getOrderBook(pair);
    return res.json({
      success: true,
      pair,
      orderBook,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getTicker,
  getSupportedPairs,
  getMarketDetails,
  getCandles,
  getOrderBook,
};
