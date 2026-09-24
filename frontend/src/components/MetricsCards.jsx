import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Target, Wallet, Cpu, Zap, Clock } from 'lucide-react';

export default function MetricsCards({
  botStatus,
  pairs = [],
  selectedPair,
  onPairChange,
  currentPrice,
  tickerData,
  pnl5m = 0,
  recent5mTradeCount = 0,
  orders = [],
  trades = [],
}) {
  const isINR = selectedPair?.endsWith('INR');
  const currencySymbol = isINR ? '₹' : '$';

  // Live second-by-second clock for smooth countdown timers
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const price = currentPrice || botStatus?.currentPrice || 0;
  const change24h = tickerData?.change_24_hour ? parseFloat(tickerData.change_24_hour) : 0;
  const isPriceUp = change24h >= 0;

  const dailyPnL = botStatus?.dailyRealizedPnL || 0;
  const isPnLPositive = dailyPnL >= 0;

  const activePosition = botStatus?.activePosition;
  const balances = botStatus?.balances || {};
  const lastSignal = botStatus?.lastSignal;

  // Extract effective last buy and sell from botStatus or orders/trades
  const effectiveLastBuy = botStatus?.lastBuy || orders.find((o) => o.side === 'buy' && o.status === 'filled') || null;
  const effectiveLastSell = botStatus?.lastSell || trades.find((t) => t.status === 'closed') || orders.find((o) => o.side === 'sell' && o.status === 'filled') || null;

  const isRunning = botStatus?.isRunning;
  const is3M = botStatus?.strategy === 'SCALPER_3M' || botStatus?.scalper3M?.isActive;
  const cycleDurationSec = is3M ? 180 : 900;

  // Cycle Timing: strictly runs when bot is started, starts from 1s, resets to 1s on sell
  let cycleElapsedSec = 0;
  let cycleRemainingSec = cycleDurationSec;

  if (isRunning && botStatus?.cycleStartTime) {
    const cycleStartMs = new Date(botStatus.cycleStartTime).getTime();
    const rawElapsed = Math.max(0, Math.floor((now - cycleStartMs) / 1000));
    cycleElapsedSec = (rawElapsed % cycleDurationSec) + 1; // starts strictly from 1s as requested
    cycleRemainingSec = Math.max(0, cycleDurationSec - (rawElapsed % cycleDurationSec));
  }

  const cycleProgressPercent = isRunning ? Math.min(100, Math.max(0, (cycleElapsedSec / cycleDurationSec) * 100)) : 0;
  const elMins = Math.floor(cycleElapsedSec / 60);
  const elSecs = cycleElapsedSec % 60;
  const cycleElapsedFormatted = `${String(elMins).padStart(2, '0')}:${String(elSecs).padStart(2, '0')}`;

  const remMins = Math.floor(cycleRemainingSec / 60);
  const remSecs = cycleRemainingSec % 60;
  const cycleRemainingFormatted = `${String(remMins).padStart(2, '0')}:${String(remSecs).padStart(2, '0')}`;

  // Active trade duration / hold timer
  const posHoldSeconds = activePosition?.createdAt
    ? Math.floor((now - new Date(activePosition.createdAt).getTime()) / 1000)
    : 0;
  const posHoldMins = Math.floor(posHoldSeconds / 60);
  const posHoldSecs = posHoldSeconds % 60;
  const posHoldFormatted = `${String(posHoldMins).padStart(2, '0')}:${String(posHoldSecs).padStart(2, '0')}`;

  // Real-time dynamic unrealized P&L based on live ticker price (supports Long & Short)
  const effectivePrice = price || activePosition?.entryPrice || 0;
  const isShort = activePosition?.side === 'short';
  const liveUnrealizedPnL = activePosition && effectivePrice
    ? (isShort
        ? (activePosition.entryPrice - effectivePrice) * activePosition.quantity
        : (effectivePrice - activePosition.entryPrice) * activePosition.quantity)
    : (activePosition?.unrealizedPnL || 0);
  const liveUnrealizedPnLPercent = activePosition && activePosition.entryPrice > 0 && effectivePrice
    ? (isShort
        ? ((activePosition.entryPrice - effectivePrice) / activePosition.entryPrice) * 100
        : ((effectivePrice - activePosition.entryPrice) / activePosition.entryPrice) * 100)
    : (activePosition?.unrealizedPnLPercent || 0);

  // 3-Minute Scalper timing
  const scalperRemainingSec = activePosition ? Math.max(0, 180 - posHoldSeconds) : null;
  const sMins = scalperRemainingSec !== null ? Math.floor(scalperRemainingSec / 60) : 0;
  const sSecs = scalperRemainingSec !== null ? scalperRemainingSec % 60 : 0;
  const scalperTimeFormatted = scalperRemainingSec !== null ? `${String(sMins).padStart(2, '0')}:${String(sSecs).padStart(2, '0')}` : null;

  return (
    <>
      {/* ⚡ 3-MINUTE SCALPER LIVE CYCLE MONITOR */}
      {is3M && (
        <div
          className="glass-panel"
          style={{
            padding: '16px 20px',
            marginBottom: '16px',
            background: 'linear-gradient(90deg, rgba(234, 179, 8, 0.08) 0%, rgba(249, 115, 22, 0.08) 100%)',
            border: '1px solid rgba(234, 179, 8, 0.35)',
            borderRadius: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(234, 179, 8, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#facc15',
                  fontWeight: '800',
                  fontSize: '16px',
                }}
              >
                ⚡
              </div>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: '800', margin: 0, color: '#fef08a' }}>
                  ⚡ 3-Minute Scalper Live Cycle Monitor
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: 0 }}>
                  Dynamic Trailing Profit (Max Upside) • Strict Fixed Stop-Loss (-0.35% / 35 paise) • 3-Min Auto-Cycle
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>
                  {!isRunning ? 'Scalper Status' : scalperRemainingSec !== null ? 'Time Left in Trade' : '3M Cycle Status'}
                </span>
                <span style={{ fontSize: '1.2rem', fontWeight: '800', color: !isRunning ? '#9ca3af' : scalperRemainingSec !== null ? '#fde047' : '#4ade80', fontFamily: 'var(--font-mono)' }}>
                  {!isRunning ? '⏸️ Stopped' : scalperRemainingSec !== null ? `⏱️ ${scalperTimeFormatted}` : `⚡ ${cycleElapsedFormatted} / 03:00`}
                </span>
              </div>
            </div>
          </div>

          {/* Cycle Progress Bar */}
          {isRunning && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '4px' }}>
                <span>{activePosition ? `Trade Progress: ${posHoldSeconds}s / 180s` : `Cycle Progress: ${cycleElapsedSec}s / 180s`}</span>
                <span>Auto-Exit at 180s (3m) • Resets on Sell</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '9999px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${cycleProgressPercent}%`,
                    background: 'linear-gradient(90deg, #eab308 0%, #f97316 100%)',
                    transition: 'width 1s linear',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 📈 15-MINUTE CYCLE MONITOR */}
      {!is3M && (
        <div
          className="glass-panel"
          style={{
            padding: '16px 20px',
            marginBottom: '16px',
            background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.08) 0%, rgba(6, 182, 212, 0.08) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderRadius: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(16, 185, 129, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#34d399',
                  fontWeight: '800',
                  fontSize: '16px',
                }}
              >
                📈
              </div>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: '800', margin: 0, color: '#a7f3d0' }}>
                  15-Minute Cycle Monitor (EMA 9/21 + RSI Momentum)
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: 0 }}>
                  Dynamic Trailing Profit (+0.60%) • Strict Stop-Loss (-0.80%) • 15-Min Auto-Cycle • Resets on Sell
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>
                  {!isRunning ? 'Cycle Status' : activePosition ? 'Trade Duration / Cycle' : '15-Min Cycle Timer'}
                </span>
                <span
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: '800',
                    color: !isRunning ? '#9ca3af' : activePosition ? '#34d399' : '#67e8f9',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {!isRunning ? '⏸️ Stopped' : `⏱️ ${cycleElapsedFormatted} / 15:00`}
                </span>
                {isRunning && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block', marginTop: '2px' }}>
                    {activePosition ? `Trade Held: ${posHoldFormatted}` : `Time Left: ${cycleRemainingFormatted}`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 15-Minute Cycle Progress Bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-dim)', marginBottom: '6px', flexWrap: 'wrap', gap: '4px' }}>
              <span>
                {!isRunning ? (
                  <span style={{ color: '#9ca3af' }}>⏸️ Bot is Stopped • Press <strong>START BOT</strong> above to begin 15-minute cycle from 1 sec</span>
                ) : activePosition ? (
                  <span>
                    <strong style={{ color: '#34d399' }}>🟢 Active Trade:</strong> {activePosition.quantity} {selectedPair} @ {currencySymbol}{Number(activePosition.entryPrice).toLocaleString()} | P&L: <strong style={{ color: liveUnrealizedPnLPercent >= 0 ? '#4ade80' : '#f87171' }}>{liveUnrealizedPnLPercent >= 0 ? '+' : ''}{liveUnrealizedPnLPercent.toFixed(2)}%</strong> (Held: {posHoldFormatted})
                  </span>
                ) : (
                  <span>
                    <strong style={{ color: '#67e8f9' }}>🔍 15-Minute Cycle Running:</strong> {elMins}m {elSecs}s / 15m ({cycleProgressPercent.toFixed(0)}%) • Scanning for Buy Signals
                  </span>
                )}
              </span>
              <span style={{ color: !isRunning ? '#6b7280' : '#a7f3d0', fontWeight: '500' }}>
                {!isRunning ? 'Timer Paused' : 'Resets to 1 sec on Sell'}
              </span>
            </div>
            <div style={{ height: '7px', background: 'rgba(255,255,255,0.08)', borderRadius: '9999px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${cycleProgressPercent}%`,
                  background: !isRunning
                    ? 'rgba(255,255,255,0.15)'
                    : activePosition
                    ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)'
                    : 'linear-gradient(90deg, #06b6d4 0%, #10b981 100%)',
                  transition: 'width 1s linear',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 🛒 LIVE PURCHASE & SELL MONITOR (कब खरीदा / कब बेचेगा) */}
      <div
        className="glass-panel"
        style={{
          padding: '18px 22px',
          marginBottom: '20px',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.75) 0%, rgba(30, 41, 59, 0.65) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '14px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #06b6d4 0%, #10b981 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
              }}
            >
              🔄
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800', margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Live Buy & Sell Activity Monitor</span>
                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--accent-cyan)', background: 'rgba(6, 182, 212, 0.15)', padding: '2px 8px', borderRadius: '6px' }}>
                  कब खरीदा / कब बेचेगा
                </span>
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: 0 }}>
                Real-time purchase timestamps, sell triggers, live profit tracking, and next order timing
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: '700',
                padding: '4px 10px',
                borderRadius: '6px',
                background: activePosition ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                color: activePosition ? '#34d399' : '#facc15',
                border: `1px solid ${activePosition ? 'rgba(16, 185, 129, 0.35)' : 'rgba(234, 179, 8, 0.35)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span className={`pulse-dot ${activePosition ? 'pulse-green' : 'pulse-yellow'}`} style={{ width: '7px', height: '7px' }}></span>
              {activePosition ? '🟢 POSITION ACTIVE (Holding Bought Coin)' : '🔍 WAITING FOR BUY SIGNAL'}
            </span>
          </div>
        </div>

        {/* 2-COLUMN GRID: LEFT = PURCHASE DETAILS, RIGHT = SELL DETAILS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          
          {/* COLUMN 1: PURCHASE (KAB KHAREEDA / KAB KHAREEDEGA) */}
          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.05)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem' }}>🟢</span>
                <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {activePosition ? 'Active Purchase (अभी क्या खरीदा है)' : 'Next Purchase (कब खरीदेगा?)'}
                </span>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px' }}>
                BUY STATUS
              </span>
            </div>

            {activePosition ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>⏰ Khareeda Kab (Buy Time):</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#fff', fontFamily: 'var(--font-mono)' }}>
                    {activePosition.createdAt ? new Date(activePosition.createdAt).toLocaleTimeString() : 'Just now'} ({posHoldFormatted} pehle)
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>💰 Buy Entry Price:</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#34d399', fontFamily: 'var(--font-mono)' }}>
                    {currencySymbol}{Number(activePosition.entryPrice).toLocaleString()}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>📦 Quantity & Order Value:</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
                    {activePosition.quantity} {selectedPair} (~{currencySymbol}{(activePosition.quantity * activePosition.entryPrice).toFixed(2)})
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>⚡ Leverage & Margin:</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>
                    {activePosition.leverage || botStatus?.leverage || 1}x Multiplier (Margin: {currencySymbol}{Number(activePosition.margin || ((activePosition.quantity * activePosition.entryPrice) / (activePosition.leverage || 1))).toFixed(2)})
                  </span>
                </div>
                {activePosition.liquidationPrice && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', color: '#f87171' }}>🚨 Est. Liquidation Price:</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#f87171', fontFamily: 'var(--font-mono)' }}>
                      {currencySymbol}{Number(activePosition.liquidationPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>⏱️ Hold Time:</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#67e8f9', fontFamily: 'var(--font-mono)' }}>
                    {posHoldMins}m {posHoldSecs}s / 15m (Auto-exits at 15m)
                  </span>
                </div>
                <div style={{ marginTop: '4px', padding: '8px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                  💡 <strong>Kyun khareeda:</strong> {botStatus?.lastSignal?.reason || 'EMA Golden Crossover & RSI Bullish Momentum Signal'}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>🎯 Buy Rule (कब खरीदेगा?):</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#facc15' }}>
                    EMA 9 &gt; EMA 21 & RSI &gt; 50
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>📊 Live RSI Indicator:</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: '700', color: Number(botStatus?.indicators?.rsi || 0) >= 50 ? '#34d399' : '#facc15', fontFamily: 'var(--font-mono)' }}>
                    {botStatus?.indicators?.rsi !== undefined ? Number(botStatus.indicators.rsi).toFixed(1) : 'Scanning...'} {Number(botStatus?.indicators?.rsi || 0) >= 50 ? '✅ (Bullish)' : '⏳ (Waiting for > 50)'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>📈 Market Price:</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#fff', fontFamily: 'var(--font-mono)' }}>
                    {currencySymbol}{price ? Number(price).toLocaleString() : '---'}
                  </span>
                </div>
                {effectiveLastBuy && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>⏮️ Pichla Buy:</span>
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                      {effectiveLastBuy.timeFormatted || new Date(effectiveLastBuy.timestamp).toLocaleTimeString()} @ {currencySymbol}{Number(effectiveLastBuy.price).toLocaleString()}
                    </span>
                  </div>
                )}
                <div style={{ marginTop: '4px', padding: '8px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                  ⏳ <strong>Status:</strong> {isRunning ? (botStatus?.lastSignal?.reason || '15-Minute candle scan chalu hai, signal aate hi buy hoga') : 'Bot Stopped hai. "START BOT" dabaiye buy start karne ke liye.'}
                </div>
              </div>
            )}
          </div>

          {/* COLUMN 2: SELL (KAB BECHEGA / KAB BECHA) */}
          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              background: 'rgba(244, 63, 94, 0.05)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem' }}>🔴</span>
                <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#fda4af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {activePosition ? 'Target Sell Rules (कब बेचेगा?)' : 'Last Sold Trade (पिछला कब बेचा?)'}
                </span>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px' }}>
                SELL STATUS
              </span>
            </div>

            {activePosition ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>🔒 Stepped Profit Lock:</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: '700', color: activePosition.lockedProfitPercent > 0 ? '#4ade80' : '#c084fc', fontFamily: 'var(--font-mono)' }}>
                    {activePosition.lockedProfitPercent > 0
                      ? `Locked at +${activePosition.lockedProfitPercent.toFixed(2)}% (Peak: +${(activePosition.peakProfitPercent || 0).toFixed(2)}%)`
                      : `Next Lock: +0.50% (Peak: +${(activePosition.peakProfitPercent || 0).toFixed(2)}%)`}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>🛑 Hard Max-Loss Floor:</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#f87171', fontFamily: 'var(--font-mono)' }}>
                    {currencySymbol}{activePosition.entryPrice ? (activePosition.entryPrice * (1 - (botStatus?.riskLimits?.maxLossPercent || 0.75) / 100)).toFixed(isINR ? 0 : 2) : '---'} (-{botStatus?.riskLimits?.maxLossPercent || 0.75}%)
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>🚀 Profit Ceiling:</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#67e8f9', fontFamily: 'var(--font-mono)' }}>
                    Unlimited (No fixed TP — winner runs)
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#fff' }}>📊 Current Live P&L:</span>
                  <span style={{ fontSize: '1rem', fontWeight: '800', color: liveUnrealizedPnL >= 0 ? '#4ade80' : '#f87171', fontFamily: 'var(--font-mono)' }}>
                    {liveUnrealizedPnL >= 0 ? '+' : ''}{currencySymbol}{liveUnrealizedPnL.toFixed(2)} ({liveUnrealizedPnLPercent.toFixed(2)}%)
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {effectiveLastSell ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>⏰ Becha Kab (Sell Time):</span>
                      <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#fff', fontFamily: 'var(--font-mono)' }}>
                        {effectiveLastSell.timeFormatted || new Date(effectiveLastSell.timestamp || effectiveLastSell.closedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>💰 Sell Exit Price:</span>
                      <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
                        {currencySymbol}{Number(effectiveLastSell.exitPrice || effectiveLastSell.price).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>💵 Net Profit / Loss:</span>
                      <span
                        style={{
                          fontSize: '0.95rem',
                          fontWeight: '800',
                          color: Number(effectiveLastSell.profit || 0) >= 0 ? '#4ade80' : '#f87171',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {Number(effectiveLastSell.profit || 0) >= 0 ? '+' : ''}{currencySymbol}{Number(effectiveLastSell.profit || 0).toFixed(2)} ({Number(effectiveLastSell.pnlPercent || 0).toFixed(2)}%)
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>📝 Becha Kyun (Reason):</span>
                      <span style={{ fontSize: '0.78rem', color: '#94a3b8', maxWidth: '60%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={effectiveLastSell.reason}>
                        {effectiveLastSell.reason || 'Take-profit / Stop-loss hit'}
                      </span>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '80px', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Abhi tak koi sell trade execute nahi hua</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Bot start hone par trade complete hote hi yahan show hoga</span>
                  </div>
                )}
                <div style={{ marginTop: '4px', padding: '8px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                  🔄 <strong>Sell ke baad:</strong> Bot sell karte hi cycle timer turant wapas 1 second se restart ho jata hai agle trade ke liye.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
      {/* 1. TRADING PAIR & LIVE PRICE */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: '600', textTransform: 'uppercase' }}>
            Trading Pair & Price
          </span>
          <select
            id="select-trading-pair"
            value={selectedPair}
            onChange={(e) => onPairChange(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--accent-cyan)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              borderRadius: '6px',
              padding: '3px 8px',
              fontSize: '0.8rem',
              fontWeight: '600',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {pairs.length > 0 ? (
              pairs.map((p) => (
                <option key={p.market} value={p.market} style={{ background: '#0f1422', color: '#fff' }}>
                  {p.market}
                </option>
              ))
            ) : (
              <>
                <option value="BTCUSDT">BTCUSDT</option>
                <option value="BTCINR">BTCINR</option>
                <option value="ETHUSDT">ETHUSDT</option>
              </>
            )}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
          <span className="font-mono" style={{ fontSize: '1.75rem', fontWeight: '800', color: '#fff' }}>
            {currencySymbol} {price ? Number(price).toLocaleString(undefined, { minimumFractionDigits: isINR ? 0 : 2, maximumFractionDigits: 4 }) : '---'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
          {isPriceUp ? (
            <span style={{ color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: '600' }}>
              <TrendingUp size={14} /> +{change24h.toFixed(2)}%
            </span>
          ) : (
            <span style={{ color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: '600' }}>
              <TrendingDown size={14} /> {change24h.toFixed(2)}%
            </span>
          )}
          <span style={{ color: 'var(--text-dim)' }}>24h change</span>
        </div>
      </div>

      {/* 2. VIRTUAL / REAL BALANCE */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '0.78rem', color: botStatus?.mode === 'LIVE_TRADING' ? '#4ade80' : 'var(--text-dim)', fontWeight: '700', textTransform: 'uppercase' }}>
            {botStatus?.mode === 'LIVE_TRADING' ? '🟢 CoinDCX Real Balance' : 'Virtual Balance (Paper)'}
          </span>
          <Wallet size={16} style={{ color: botStatus?.mode === 'LIVE_TRADING' ? '#4ade80' : 'var(--accent-cyan)' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>USDT:</span>
            <span className="font-mono" style={{ fontSize: '1.25rem', fontWeight: '700', color: '#fff' }}>
              ${Number(balances.USDT || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>INR:</span>
            <span className="font-mono" style={{ fontSize: '1.05rem', fontWeight: '600', color: botStatus?.mode === 'LIVE_TRADING' ? '#4ade80' : 'var(--text-muted)' }}>
              ₹{Number(balances.INR || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Crypto (BTC):</span>
            <span className="font-mono" style={{ fontSize: '0.85rem', color: 'var(--accent-cyan)' }}>
              {Number(balances.BTC || 0).toFixed(6)} BTC
            </span>
          </div>
          {botStatus?.mode === 'LIVE_TRADING' && (
            <div style={{ fontSize: '0.7rem', color: '#4ade80', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '500' }}>
              <span className="pulse-dot pulse-green" style={{ width: '6px', height: '6px' }}></span>
              <span>Live Synced with CoinDCX Wallet</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. TODAY'S REALIZED P&L + 5-MIN P&L */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: '600', textTransform: 'uppercase' }}>
            Today's Realized P&L
          </span>
          <DollarSign size={16} style={{ color: isPnLPositive ? 'var(--accent-green)' : 'var(--accent-red)' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
          <span
            className="font-mono"
            style={{
              fontSize: '1.75rem',
              fontWeight: '800',
              color: isPnLPositive ? 'var(--accent-green)' : 'var(--accent-red)',
            }}
          >
            {isPnLPositive ? '+' : '-'}${Math.abs(dailyPnL).toFixed(2)}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ color: 'var(--accent-cyan)', fontWeight: '600' }}>5-Min P&L:</span>
          <span
            className="font-mono"
            style={{
              fontWeight: '700',
              color: (pnl5m || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
            }}
          >
            {(pnl5m || 0) >= 0 ? '+' : '-'}${Math.abs(pnl5m || 0).toFixed(2)} ({recent5mTradeCount} trades)
          </span>
        </div>
      </div>

      {/* 4. ACTIVE POSITION & TARGETS (SUPPORTS MULTI-POSITION) */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: '600', textTransform: 'uppercase' }}>
            Active Positions ({(botStatus?.activePositions || (activePosition ? [activePosition] : [])).length}/{botStatus?.riskLimits?.maxOpenPositions || 1})
          </span>
          <Target size={16} style={{ color: activePosition ? 'var(--accent-green)' : 'var(--text-dim)' }} />
        </div>

        {activePosition ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Primary Entry:</span>
              <span className="font-mono" style={{ fontWeight: '700', color: '#fff' }}>
                ${activePosition.entryPrice?.toFixed(2)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Leverage / Margin:</span>
              <span className="font-mono" style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f59e0b' }}>
                {activePosition.leverage || botStatus?.leverage || 1}x (${Number(activePosition.margin || ((activePosition.quantity * activePosition.entryPrice) / (activePosition.leverage || 1))).toFixed(2)})
              </span>
            </div>
            {activePosition.liquidationPrice && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.85rem', color: '#f87171' }}>Est. Liquidation:</span>
                <span className="font-mono" style={{ fontSize: '0.85rem', fontWeight: '800', color: '#f87171' }}>
                  ${Number(activePosition.liquidationPrice).toFixed(2)}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Unrealized P&L:</span>
              <span
                className="font-mono"
                style={{
                  fontWeight: '700',
                  color: liveUnrealizedPnL >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                }}
              >
                {liveUnrealizedPnL >= 0 ? '+' : ''}
                ${liveUnrealizedPnL.toFixed(2)} ({liveUnrealizedPnLPercent.toFixed(2)}%)
              </span>
            </div>

            {/* Peak & Profit-Lock Status Indicator */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                margin: '6px 0',
                padding: '4px 8px',
                borderRadius: '6px',
                background: activePosition.lockedProfitPercent > 0
                  ? 'rgba(34, 197, 94, 0.15)'
                  : 'rgba(255, 255, 255, 0.04)',
                border: `1px solid ${
                  activePosition.lockedProfitPercent > 0
                    ? 'rgba(34, 197, 94, 0.35)'
                    : 'rgba(255, 255, 255, 0.08)'
                }`,
                fontSize: '0.74rem',
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>
                Peak: <strong style={{ color: '#fff' }}>+{Math.max(activePosition.peakProfitPercent || 0, liveUnrealizedPnLPercent || 0).toFixed(2)}%</strong>
              </span>
              <span
                style={{
                  fontWeight: '600',
                  color: activePosition.lockedProfitPercent > 0 ? '#4ade80' : 'var(--text-dim)',
                }}
              >
                {activePosition.lockedProfitPercent > 0
                  ? `🔒 Locked +${activePosition.lockedProfitPercent.toFixed(2)}%`
                  : 'Floor: -0.75%'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              <span>
                Stop Floor: ${(activePosition.entryPrice * (1 - (botStatus?.riskLimits?.maxLossPercent || 0.75) / 100)).toFixed(2)} (-{botStatus?.riskLimits?.maxLossPercent || 0.75}%)
              </span>
              <span>Lock: {activePosition.lockedProfitPercent > 0 ? `+${activePosition.lockedProfitPercent}%` : 'Unarmed'}</span>
            </div>
            {(botStatus?.activePositions?.length > 1) && (
              <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '0.74rem', color: 'var(--accent-cyan)' }}>
                + {botStatus.activePositions.length - 1} additional position(s) active
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '65px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No open positions</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Waiting for strategy trigger</span>
          </div>
        )}
      </div>

      {/* 5. STRATEGY SIGNAL STATUS */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: '600', textTransform: 'uppercase' }}>
            Strategy Signal
          </span>
          <Cpu size={16} style={{ color: 'var(--accent-purple)' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span
            className="badge"
            style={{
              fontSize: '0.85rem',
              padding: '4px 10px',
              background:
                lastSignal?.signal === 'BUY'
                  ? 'var(--accent-green-bg)'
                  : lastSignal?.signal === 'SELL'
                  ? 'var(--accent-red-bg)'
                  : 'rgba(255,255,255,0.06)',
              color:
                lastSignal?.signal === 'BUY'
                  ? '#34d399'
                  : lastSignal?.signal === 'SELL'
                  ? '#f87171'
                  : '#9ca3af',
              border: `1px solid ${
                lastSignal?.signal === 'BUY'
                  ? 'rgba(16, 185, 129, 0.4)'
                  : lastSignal?.signal === 'SELL'
                  ? 'rgba(239, 68, 68, 0.4)'
                  : 'rgba(255,255,255,0.1)'
              }`,
            }}
          >
            {lastSignal?.signal || 'HOLD'}
          </span>
          <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            RSI: {lastSignal?.indicators?.rsi || '---'}
          </span>
        </div>

        <div
          title={lastSignal?.reason || 'Monitoring market conditions'}
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-dim)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {lastSignal?.reason || 'Monitoring market conditions...'}
        </div>
      </div>
    </div>
  </>
);
}
