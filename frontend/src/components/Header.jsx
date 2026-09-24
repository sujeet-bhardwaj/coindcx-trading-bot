import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, Activity, Wifi, WifiOff, Zap, Clock, TrendingUp } from 'lucide-react';

export default function Header({ botStatus, isConnected }) {
  const isRunning = botStatus?.isRunning;
  const isEmergency = botStatus?.emergencyStop;
  const mode = botStatus?.mode || 'PAPER_TRADING';
  const is3M = botStatus?.strategy === 'SCALPER_3M' || botStatus?.scalper3M?.isActive;
  const is4H = botStatus?.strategy === 'TREND_4H' || botStatus?.scalper4H?.isActive;

  // Real-time second-by-second live clock for accurate countdowns
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Cycle Timer: strictly starts when bot starts, resets to 1s on sell, stops when bot is stopped
  const cycleDurationSec = is4H ? 14400 : (is3M ? 180 : 900);
  let cycleElapsedSec = 0;
  let cycleRemainingSec = cycleDurationSec;

  if (isRunning && botStatus?.cycleStartTime) {
    const cycleStartMs = new Date(botStatus.cycleStartTime).getTime();
    const rawElapsed = Math.max(0, Math.floor((now - cycleStartMs) / 1000));
    cycleElapsedSec = (rawElapsed % cycleDurationSec) + 1; // 1-indexed, starts from 1s
    cycleRemainingSec = Math.max(0, cycleDurationSec - (rawElapsed % cycleDurationSec));
  }

  const elHours = Math.floor(cycleElapsedSec / 3600);
  const elMins = Math.floor((cycleElapsedSec % 3600) / 60);
  const elSecs = cycleElapsedSec % 60;
  const cycleElapsedFormatted = is4H
    ? `${String(elHours).padStart(2, '0')}:${String(elMins).padStart(2, '0')}:${String(elSecs).padStart(2, '0')}`
    : `${String(elMins).padStart(2, '0')}:${String(elSecs).padStart(2, '0')}`;

  const remHours = Math.floor(cycleRemainingSec / 3600);
  const remMins = Math.floor((cycleRemainingSec % 3600) / 60);
  const remSecs = cycleRemainingSec % 60;
  const cycleRemainingFormatted = is4H
    ? `${String(remHours).padStart(2, '0')}:${String(remMins).padStart(2, '0')}:${String(remSecs).padStart(2, '0')}`
    : `${String(remMins).padStart(2, '0')}:${String(remSecs).padStart(2, '0')}`;

  // Active position hold timer
  const activePosition = botStatus?.activePosition;
  const posHoldSeconds = activePosition?.createdAt
    ? Math.floor((now - new Date(activePosition.createdAt).getTime()) / 1000)
    : 0;
  const posHoldMins = Math.floor(posHoldSeconds / 60);
  const posHoldSecs = posHoldSeconds % 60;
  const posHoldFormatted = `${String(posHoldMins).padStart(2, '0')}:${String(posHoldSecs).padStart(2, '0')}`;

  // 3M Scalper timing
  const scalperRemainingSec = activePosition ? Math.max(0, 180 - posHoldSeconds) : null;
  const sMins = scalperRemainingSec !== null ? Math.floor(scalperRemainingSec / 60) : 0;
  const sSecs = scalperRemainingSec !== null ? scalperRemainingSec % 60 : 0;
  const scalperTimeFormatted = scalperRemainingSec !== null ? `${String(sMins).padStart(2, '0')}:${String(sSecs).padStart(2, '0')}` : null;

  return (
    <header className="glass-panel" style={{ padding: '16px 24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        {/* Brand & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)',
            }}
          >
            🤖
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: '800', letterSpacing: '-0.5px' }}>
                CoinDCX Trading Bot
              </h1>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '6px' }}>
                v1.0.0
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Official API Automated Execution • Modular Strategy • Strict Risk Engine
            </p>
          </div>
        </div>

        {/* Status Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* TRADING MODE BADGE */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span
              className={`badge ${mode === 'PAPER_TRADING' ? 'badge-paper' : 'badge-live'}`}
              style={{ fontSize: '0.85rem', padding: '6px 14px' }}
            >
              {mode === 'PAPER_TRADING' ? (
                <>
                  <ShieldCheck size={16} /> PAPER TRADING
                </>
              ) : (
                <>
                  <AlertTriangle size={16} /> LIVE TRADING
                </>
              )}
            </span>
            <span style={{ fontSize: '0.7rem', color: mode === 'PAPER_TRADING' ? '#22d3ee' : '#f87171', marginTop: '2px', fontWeight: '500' }}>
              {mode === 'PAPER_TRADING' ? 'Simulation Active • Real Funds Safe' : 'REAL CAPITAL AT RISK'}
            </span>
          </div>

          {/* LEVERAGE MULTIPLIER BADGE */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span
              className="badge"
              style={{
                fontSize: '0.85rem',
                padding: '6px 14px',
                background:
                  (botStatus?.leverage || 1) === 1
                    ? 'rgba(16, 185, 129, 0.15)'
                    : (botStatus?.leverage || 1) <= 5
                    ? 'rgba(6, 182, 212, 0.15)'
                    : 'rgba(245, 158, 11, 0.15)',
                color:
                  (botStatus?.leverage || 1) === 1
                    ? '#34d399'
                    : (botStatus?.leverage || 1) <= 5
                    ? '#22d3ee'
                    : '#fbbf24',
                border: `1px solid ${
                  (botStatus?.leverage || 1) === 1
                    ? 'rgba(16, 185, 129, 0.3)'
                    : (botStatus?.leverage || 1) <= 5
                    ? 'rgba(6, 182, 212, 0.3)'
                    : 'rgba(245, 158, 11, 0.3)'
                }`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Zap size={15} style={{ color: (botStatus?.leverage || 1) > 1 ? '#f59e0b' : '#34d399' }} />
              {(botStatus?.leverage || 1) > 1 ? `${botStatus.leverage}x LEVERAGE` : '1x SPOT'}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px', fontWeight: '500' }}>
              {(botStatus?.leverage || 1) > 1 ? `${botStatus.leverage}x Margin Multiplier` : 'Zero Borrowing'}
            </span>
          </div>

          {/* BOT EXECUTION STATE */}
          <div>
            {isEmergency ? (
              <span className="badge badge-emergency" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
                <span className="pulse-dot pulse-red"></span> EMERGENCY STOP
              </span>
            ) : isRunning ? (
              <span className="badge badge-running" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
                <span className="pulse-dot pulse-green"></span> RUNNING
              </span>
            ) : (
              <span className="badge badge-stopped" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
                <span className="pulse-dot" style={{ background: '#6b7280' }}></span> STOPPED
              </span>
            )}
          </div>

          {/* ACTIVE STRATEGY BADGE */}
          {is3M ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.18) 0%, rgba(249, 115, 22, 0.18) 100%)',
                border: '1px solid rgba(234, 179, 8, 0.45)',
                boxShadow: '0 0 15px rgba(234, 179, 8, 0.25)',
              }}
            >
              <Zap size={18} style={{ color: '#facc15' }} className="pulse-yellow" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#fef08a', letterSpacing: '0.5px' }}>
                  3-MIN SCALPER
                </span>
                <span style={{ fontSize: '0.72rem', color: '#fde047', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
                  {!isRunning
                    ? '⏸️ Stopped (Click Start Bot)'
                    : scalperRemainingSec !== null
                    ? `⏱️ Auto-Exit in ${scalperTimeFormatted}`
                    : `⚡ 3M Cycle: ${cycleElapsedFormatted} / 03:00`}
                </span>
              </div>
            </div>
          ) : is4H ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.18) 0%, rgba(59, 130, 246, 0.18) 100%)',
                border: '1px solid rgba(147, 51, 234, 0.45)',
                boxShadow: '0 0 15px rgba(147, 51, 234, 0.25)',
              }}
            >
              <TrendingUp size={18} style={{ color: '#c084fc' }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#e9d5ff', letterSpacing: '0.5px' }}>
                  📈 4H TREND & SWING
                </span>
                <span style={{ fontSize: '0.72rem', color: '#d8b4fe', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
                  {!isRunning
                    ? '⏸️ Stopped (Click Start Bot)'
                    : activePosition
                    ? `⏱️ In Trade: ${posHoldFormatted} | Cycle: ${cycleElapsedFormatted} / 04:00:00`
                    : `⏱️ 4H Cycle: ${cycleElapsedFormatted} / 04:00:00 (Left: ${cycleRemainingFormatted})`}
                </span>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 182, 212, 0.15) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                boxShadow: '0 0 15px rgba(16, 185, 129, 0.2)',
              }}
            >
              <Activity size={18} style={{ color: '#34d399' }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#a7f3d0', letterSpacing: '0.5px' }}>
                  📈 15M TREND FOLLOWER
                </span>
                <span style={{ fontSize: '0.72rem', color: '#6ee7b7', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
                  {!isRunning
                    ? '⏸️ Stopped (Click Start Bot)'
                    : activePosition
                    ? `⏱️ In Trade: ${posHoldFormatted} | Cycle: ${cycleElapsedFormatted} / 15:00`
                    : `⏱️ 15M Cycle: ${cycleElapsedFormatted} / 15:00 (Left: ${cycleRemainingFormatted})`}
                </span>
              </div>
            </div>
          )}

          {/* SOCKET CONNECTION INDICATOR */}
          <div
            title={isConnected ? 'WebSocket Stream Connected' : 'Polling Backend (WebSocket Disconnected)'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '9999px',
              background: 'rgba(255, 255, 255, 0.04)',
              fontSize: '0.75rem',
              color: isConnected ? 'var(--accent-green)' : 'var(--text-dim)',
            }}
          >
            {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{isConnected ? 'Real-time' : 'Polling'}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
