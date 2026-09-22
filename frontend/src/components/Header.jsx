import React from 'react';
import { ShieldCheck, AlertTriangle, Activity, Wifi, WifiOff } from 'lucide-react';

export default function Header({ botStatus, isConnected }) {
  const isRunning = botStatus?.isRunning;
  const isEmergency = botStatus?.emergencyStop;
  const mode = botStatus?.mode || 'PAPER_TRADING';

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
