const orderService = require('../services/orderService');

async function getOrders(req, res, next) {
  try {
    const { limit, mode, pair } = req.query;
    const orders = await orderService.getOrders({
      limit: limit ? parseInt(limit, 10) : 50,
      mode: mode || null,
      pair: pair || null,
    });
    return res.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    next(error);
  }
}

async function getTrades(req, res, next) {
  try {
    const { limit, mode, pair } = req.query;
    const trades = await orderService.getTrades({
      limit: limit ? parseInt(limit, 10) : 50,
      mode: mode || null,
      pair: pair || null,
    });
    return res.json({
      success: true,
      count: trades.length,
      trades,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOrders,
  getTrades,
};
