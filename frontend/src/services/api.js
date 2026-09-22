import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

const client = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 10000,
});

export const api = {
  // Bot control
  getBotStatus: () => client.get('/bot/status').then((r) => r.data.status),
  startBot: () => client.post('/bot/start').then((r) => r.data),
  stopBot: () => client.post('/bot/stop').then((r) => r.data),
  emergencyStop: () => client.post('/bot/emergency-stop').then((r) => r.data),
  resetEmergencyStop: () => client.post('/bot/reset-emergency-stop').then((r) => r.data),
  getSettings: () => client.get('/bot/settings').then((r) => r.data.settings),
  updateSettings: (settings) => client.patch('/bot/settings', settings).then((r) => r.data),

  // Account
  getBalance: () => client.get('/account/balance').then((r) => r.data),

  // Market data
  getPairs: () => client.get('/market/pairs').then((r) => r.data.pairs || []),
  getTicker: (pair) => client.get(`/market/ticker/${pair}`).then((r) => r.data.ticker),
  getMarketDetails: (pair) => client.get(`/market/details/${pair}`).then((r) => r.data.details),
  getCandles: (pair, limit = 40) => client.get(`/market/candles/${pair}?limit=${limit}`).then((r) => r.data.candles || []),

  // Orders & Trades
  getOrders: () => client.get('/orders').then((r) => r.data.orders || []),
  getTrades: () => client.get('/trades').then((r) => r.data.trades || []),
};

export default api;
