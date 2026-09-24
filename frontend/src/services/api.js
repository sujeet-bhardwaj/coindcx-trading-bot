import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const API_SECRET_KEY = import.meta.env.VITE_API_SECRET_KEY || 'dev-secret-key';

const client = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 15000,
});

// Automatically inject Authorization header on outgoing requests
client.interceptors.request.use((config) => {
  if (API_SECRET_KEY) {
    config.headers.Authorization = `Bearer ${API_SECRET_KEY}`;
    config.headers['x-api-key'] = API_SECRET_KEY;
  }
  return config;
});

export const api = {
  // Bot control
  getBotStatus: () =>
    client.get('/bot/status').then((r) => ({
      ...(r.data.status || r.data),
      availableStrategies: r.data.availableStrategies || [],
    })),
  startBot: () => client.post('/bot/start').then((r) => r.data),
  stopBot: () => client.post('/bot/stop').then((r) => r.data),
  emergencyStop: () => client.post('/bot/emergency-stop').then((r) => r.data),
  resetEmergencyStop: () => client.post('/bot/reset-emergency-stop').then((r) => r.data),
  getSettings: () => client.get('/bot/settings').then((r) => r.data.settings || r.data),
  updateSettings: (settings) => client.patch('/bot/settings', settings).then((r) => r.data),
  switchMode: (payload = {}) => client.post('/bot/mode', payload).then((r) => r.data),
  simulateTrade: (payload = {}) => client.post('/bot/simulate-trade', payload).then((r) => r.data),
  runBacktest: (payload = {}) => client.post('/bot/backtest', payload).then((r) => r.data),

  // Account
  getBalance: () => client.get('/account/balance').then((r) => r.data),

  // Market data
  getPairs: () => client.get('/market/pairs').then((r) => r.data.pairs || []),
  getTicker: (pair) => client.get(`/market/ticker/${pair}`).then((r) => r.data.ticker),
  getMarketDetails: (pair) => client.get(`/market/details/${pair}`).then((r) => r.data.details),
  getCandles: (pair, limit = 40, interval = '5m') =>
    client.get(`/market/candles/${pair}?limit=${limit}&interval=${interval}`).then((r) => r.data.candles || []),

  // Orders & Trades
  getOrders: () => client.get('/orders').then((r) => r.data.orders || []),
  getTrades: () => client.get('/trades').then((r) => r.data.trades || []),
};

export default api;
