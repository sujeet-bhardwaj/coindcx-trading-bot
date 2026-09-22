const Order = require('../models/Order');
const Trade = require('../models/Trade');
const { getIsConnected } = require('../config/db');

class OrderService {
  constructor() {
    // In-memory fallbacks when MongoDB is offline
    this.memoryOrders = [];
    this.memoryTrades = [];
  }

  /**
   * Save a new order to database (or in-memory store)
   */
  async recordOrder(orderData) {
    try {
      if (getIsConnected()) {
        const order = new Order(orderData);
        return await order.save();
      }
    } catch (err) {
      console.warn('OrderService: DB write failed, storing in-memory fallback:', err.message);
    }
    const memOrder = {
      ...orderData,
      _id: `mem_ord_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.memoryOrders.unshift(memOrder);
    return memOrder;
  }

  /**
   * Update status of an existing order
   */
  async updateOrderStatus(exchangeOrderId, status, extra = {}) {
    try {
      if (getIsConnected()) {
        const updated = await Order.findOneAndUpdate(
          { exchangeOrderId },
          { status, ...extra, updatedAt: new Date() },
          { new: true }
        );
        if (updated) return updated;
      }
    } catch (err) {
      console.warn('OrderService: DB update failed:', err.message);
    }

    const order = this.memoryOrders.find((o) => o.exchangeOrderId === exchangeOrderId);
    if (order) {
      order.status = status;
      Object.assign(order, extra);
      order.updatedAt = new Date();
      return order;
    }
    return null;
  }

  /**
   * Save a completed or closed trade
   */
  async recordTrade(tradeData) {
    try {
      if (getIsConnected()) {
        const trade = new Trade(tradeData);
        return await trade.save();
      }
    } catch (err) {
      console.warn('OrderService: DB trade write failed, storing in-memory:', err.message);
    }
    const memTrade = {
      ...tradeData,
      _id: `mem_trd_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      createdAt: tradeData.createdAt || new Date(),
      closedAt: tradeData.closedAt || new Date(),
    };
    this.memoryTrades.unshift(memTrade);
    return memTrade;
  }

  /**
   * Get recent orders (filtered by pair, mode, status)
   */
  async getOrders({ limit = 50, mode = null, pair = null } = {}) {
    try {
      if (getIsConnected()) {
        const query = {};
        if (mode) query.mode = mode;
        if (pair) query.pair = pair;
        return await Order.find(query).sort({ createdAt: -1 }).limit(limit);
      }
    } catch (err) {
      console.warn('OrderService: DB query failed:', err.message);
    }

    let list = [...this.memoryOrders];
    if (mode) list = list.filter((o) => o.mode === mode);
    if (pair) list = list.filter((o) => o.pair === pair);
    return list.slice(0, limit);
  }

  /**
   * Get trade history
   */
  async getTrades({ limit = 50, mode = null, pair = null } = {}) {
    try {
      if (getIsConnected()) {
        const query = {};
        if (mode) query.mode = mode;
        if (pair) query.pair = pair;
        return await Trade.find(query).sort({ closedAt: -1, createdAt: -1 }).limit(limit);
      }
    } catch (err) {
      console.warn('OrderService: DB trade query failed:', err.message);
    }

    let list = [...this.memoryTrades];
    if (mode) list = list.filter((t) => t.mode === mode);
    if (pair) list = list.filter((t) => t.pair === pair);
    return list.slice(0, limit);
  }

  /**
   * Safe reconciliation of open orders on server restart
   * Checks exchange for order fill statuses if in live mode
   */
  async reconcileOpenOrders(coindcxService = null) {
    console.log('🔄 Reconciling open orders...');
    let openOrders = [];
    try {
      if (getIsConnected()) {
        openOrders = await Order.find({ status: { $in: ['init', 'open', 'partially_filled'] } });
      } else {
        openOrders = this.memoryOrders.filter((o) => ['init', 'open', 'partially_filled'].includes(o.status));
      }
    } catch (err) {
      console.error('Reconciliation fetch error:', err.message);
      return [];
    }

    if (openOrders.length === 0) {
      console.log('✅ Order reconciliation complete: 0 open orders found.');
      return [];
    }

    console.log(`Found ${openOrders.length} unresolved orders to reconcile.`);
    for (const ord of openOrders) {
      if (ord.mode === 'LIVE_TRADING' && coindcxService) {
        try {
          const statusRes = await coindcxService.getOrderStatus(ord.exchangeOrderId);
          if (statusRes && statusRes.status && statusRes.status !== ord.status) {
            console.log(`Updated order ${ord.exchangeOrderId} status from ${ord.status} -> ${statusRes.status}`);
            await this.updateOrderStatus(ord.exchangeOrderId, statusRes.status, {
              filledQuantity: statusRes.total_quantity || ord.quantity,
              fee: statusRes.fee || ord.fee,
            });
          }
        } catch (err) {
          console.warn(`Could not fetch status for live order ${ord.exchangeOrderId}:`, err.message);
        }
      }
    }
    return openOrders;
  }
}

module.exports = new OrderService();
