const config = require('../config/env');
const CoinDCXService = require('../services/coindcxService');

const coindcxService = new CoinDCXService();

// In-memory paper balance fallback if database is not queried directly
let virtualBalances = {
  USDT: config.paper.initialBalanceUSDT,
  INR: config.paper.initialBalanceINR,
  BTC: 0.0,
  ETH: 0.0,
};

/**
 * Returns current account balance (either simulated paper balance or real CoinDCX balance)
 */
async function getBalance(req, res, next) {
  try {
    const isLiveMode = config.tradingMode === 'LIVE_TRADING';

    if (isLiveMode && config.coindcx.apiKey && config.coindcx.apiSecret) {
      try {
        const liveBalances = await coindcxService.getBalances();
        return res.json({
          success: true,
          mode: 'LIVE_TRADING',
          isPaper: false,
          balances: liveBalances,
        });
      } catch (err) {
        console.error('Failed to fetch live balances from CoinDCX:', err.message);
        return res.status(502).json({
          success: false,
          mode: 'LIVE_TRADING',
          error: 'Failed to retrieve live balances from CoinDCX API. Check credentials or network.',
          details: err.message,
        });
      }
    }

    // Default: Return Paper Trading Balances
    return res.json({
      success: true,
      mode: 'PAPER_TRADING',
      isPaper: true,
      balances: [
        { currency: 'USDT', balance: virtualBalances.USDT.toFixed(2), locked_balance: '0.00' },
        { currency: 'INR', balance: virtualBalances.INR.toFixed(2), locked_balance: '0.00' },
        { currency: 'BTC', balance: virtualBalances.BTC.toFixed(6), locked_balance: '0.000000' },
        { currency: 'ETH', balance: virtualBalances.ETH.toFixed(6), locked_balance: '0.000000' },
      ],
      notice: 'Operating in simulated PAPER_TRADING mode. No real capital at risk.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update virtual balances (used by paper trading engine)
 */
function updateVirtualBalance(newBalances) {
  virtualBalances = { ...virtualBalances, ...newBalances };
}

function getVirtualBalances() {
  return { ...virtualBalances };
}

module.exports = {
  getBalance,
  updateVirtualBalance,
  getVirtualBalances,
};
