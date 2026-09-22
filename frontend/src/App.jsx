import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import GlobalControls from './components/GlobalControls';
import MetricsCards from './components/MetricsCards';
import PriceChart from './components/PriceChart';
import StrategySettings from './components/StrategySettings';
import OrdersTable from './components/OrdersTable';
import TradeHistoryTable from './components/TradeHistoryTable';
import LogConsole from './components/LogConsole';
import api from './services/api';
import { getSocket } from './services/socket';

export default function App() {
  const [botStatus, setBotStatus] = useState(null);
  const [selectedPair, setSelectedPair] = useState('BTCUSDT');
  const [currentPrice, setCurrentPrice] = useState(null);
  const [tickerData, setTickerData] = useState(null);
  const [pairs, setPairs] = useState([]);
  const [candles, setCandles] = useState([]);
  const [orders, setOrders] = useState([]);
  const [trades, setTrades] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  // Load Initial Market Data & Pairs
  const loadInitialData = useCallback(async () => {
    try {
      const [statusData, pairsData, ordersData, tradesData] = await Promise.all([
        api.getBotStatus(),
        api.getPairs(),
        api.getOrders(),
        api.getTrades(),
      ]);

      setBotStatus(statusData);
      if (statusData?.pair) setSelectedPair(statusData.pair);
      if (statusData?.recentLogs) setLogs(statusData.recentLogs);
      setPairs(pairsData);
      setOrders(ordersData);
      setTrades(tradesData);
    } catch (err) {
      console.warn('Initial data fetch warning:', err.message);
    }
  }, []);

  // Fetch Market Ticker & Candles for Selected Pair
  const loadPairData = useCallback(async (pair) => {
    try {
      const [ticker, candleData] = await Promise.all([
        api.getTicker(pair),
        api.getCandles(pair, 40),
      ]);
      setTickerData(ticker);
      if (ticker?.last_price) {
        setCurrentPrice(parseFloat(ticker.last_price));
      }
      setCandles(candleData);
    } catch (err) {
      console.warn(`Pair data fetch error for ${pair}:`, err.message);
    }
  }, []);

  // Socket.IO Real-Time Subscriptions
  useEffect(() => {
    const socket = getSocket();

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    const handleBotStatus = (data) => {
      setBotStatus(data);
      if (data?.currentPrice) setCurrentPrice(data.currentPrice);
    };

    const handlePriceTick = (tick) => {
      if (tick.pair === selectedPair && tick.price) {
        setCurrentPrice(tick.price);
      }
      if (tick.signal || tick.indicators) {
        setBotStatus((prev) => ({
          ...prev,
          lastSignal: tick.signal || prev?.lastSignal,
          indicators: tick.indicators || prev?.indicators,
        }));
      }
    };

    const handleBotLog = (logEntry) => {
      setLogs((prev) => [logEntry, ...prev.slice(0, 99)]);
      // If a trade occurred, refresh orders & trades
      if (logEntry.type === 'trade') {
        api.getOrders().then(setOrders).catch(console.warn);
        api.getTrades().then(setTrades).catch(console.warn);
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('bot_status', handleBotStatus);
    socket.on('price_tick', handlePriceTick);
    socket.on('bot_log', handleBotLog);

    if (socket.connected) {
      setIsConnected(true);
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('bot_status', handleBotStatus);
      socket.off('price_tick', handlePriceTick);
      socket.off('bot_log', handleBotLog);
    };
  }, [selectedPair]);

  // Initial Load & Selected Pair Change
  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    loadPairData(selectedPair);
  }, [selectedPair, loadPairData]);

  // Fallback high-frequency polling every 5s
  useEffect(() => {
    const timer = setInterval(() => {
      api.getBotStatus().then((s) => {
        setBotStatus(s);
        if (s?.currentPrice) setCurrentPrice(s.currentPrice);
      }).catch(console.warn);

      loadPairData(selectedPair);
      api.getOrders().then(setOrders).catch(console.warn);
      api.getTrades().then(setTrades).catch(console.warn);
    }, 5000);

    return () => clearInterval(timer);
  }, [selectedPair, loadPairData]);

  const handlePairChange = async (newPair) => {
    setSelectedPair(newPair);
    try {
      await api.updateSettings({ pair: newPair });
      loadPairData(newPair);
    } catch (err) {
      console.error('Failed to update pair in bot settings:', err.message);
    }
  };

  const handleRefresh = () => {
    loadInitialData();
    loadPairData(selectedPair);
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px 48px' }}>
      {/* 1. Header */}
      <Header botStatus={botStatus} isConnected={isConnected} />

      {/* 2. Global Action Controls (Start / Stop / Emergency Stop) */}
      <GlobalControls botStatus={botStatus} onActionSuccess={handleRefresh} />

      {/* 3. Top Metrics Cards (Price, Balance, Daily PnL, Active Position, Signal) */}
      <MetricsCards
        botStatus={botStatus}
        pairs={pairs}
        selectedPair={selectedPair}
        onPairChange={handlePairChange}
        currentPrice={currentPrice}
        tickerData={tickerData}
      />

      {/* 4. Interactive Live Price & Indicator Chart */}
      <PriceChart candles={candles} pair={selectedPair} />

      {/* 5. Strategy & Risk Parameters */}
      <StrategySettings botStatus={botStatus} onSettingsUpdated={handleRefresh} />

      {/* 6. Active Orders Table */}
      <OrdersTable orders={orders} />

      {/* 7. Trade History Table */}
      <TradeHistoryTable trades={trades} />

      {/* 8. Live Activity & Audit Log Stream */}
      <LogConsole logs={logs} onClearLogs={() => setLogs([])} />

      {/* Footer */}
      <footer style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.78rem', marginTop: '32px' }}>
        CoinDCX Automated Cryptocurrency Trading System • Operating in <strong>PAPER_TRADING</strong> Mode
        <br />
        Risk Warning: Automated trading involves financial risk. No profit guarantee is implied or claimed.
      </footer>
    </div>
  );
}
