import React, { useState, useEffect } from 'react';
import { Sliders, Save, Check, Play, TrendingUp, ShieldAlert, BarChart2, Activity, Zap } from 'lucide-react';
import api from '../services/api';

const STRATEGY_DEFINITIONS = [
  {
    id: 'SCALPER_3M',
    name: '⚡ 3-Minute Scalper (Dynamic Trailing Profit)',
    badge: '3-Min Fast Scalp',
    desc: 'Rapid 3-minute execution: Micro EMA (3/8) + RSI (7) with Dynamic Trailing Profit (unlimited upside), strict fixed stop-loss (-0.35%), and 3-min auto-exit.',
  },
  {
    id: 'SCALPER_15M',
    name: '⚡ 15-Minute Scalper (Dynamic Trailing Profit)',
    badge: '15-Min Scalper',
    desc: 'Continuous 15-minute execution: EMA (9/21) + RSI (14) with Dynamic Trailing Profit (+0.60%), strict fixed stop-loss (-0.80%), and 15-min auto-exit.',
  },
  {
    id: 'EMA_RSI',
    name: 'EMA Crossover + RSI (15M Dynamic)',
    badge: '15-Min Trend / Scalp',
    desc: 'Active 15-minute trading: Fast & slow EMA crossover + momentum buying, dynamic trailing profit, and 15-min auto-exit.',
  },
  {
    id: 'BOLLINGER_BANDS',
    name: 'Bollinger Bands (Mean Reversion)',
    badge: 'Mean Reversion',
    desc: 'Buys extreme oversold dips at the lower band and exits at the upper band or overbought RSI.',
  },
  {
    id: 'GRID',
    name: 'Grid Trading',
    badge: 'Range Bound',
    desc: 'Systematic stepped grid buying on dips and taking profit at upper volatility levels.',
  },
  {
    id: 'MACD_RSI',
    name: 'MACD + RSI Breakout',
    badge: 'Momentum Breakout',
    desc: 'Captures explosive trend movements when MACD histogram flips positive with healthy RSI.',
  },
];

export default function StrategySettings({ botStatus, onSettingsUpdated }) {
  const [activeTab, setActiveTab] = useState('settings'); // 'settings' | 'backtest'

  // Settings State
  const [settings, setSettings] = useState({
    strategy: 'EMA_RSI',
    tradeAmount: 50,
    leverage: 1,
    stopLossPercent: 2.0,
    takeProfitPercent: 4.0,
    trailingActivationPercent: 3.5,
    trailingGivebackPercent: 0.3,
    breakevenTriggerPercent: 1.0,
    maxDailyLoss: 100,
    maxOpenPositions: 1,
    cooldownSeconds: 60,
    evalIntervalMs: 10000,
    fastEmaPeriod: 20,
    slowEmaPeriod: 50,
    rsiPeriod: 14,
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Backtest State
  const [backtestConfig, setBacktestConfig] = useState({
    pair: 'BTCUSDT',
    strategyName: 'EMA_RSI',
    interval: '15m',
    limit: 200,
    tradeAmount: 100,
    leverage: 1,
    stopLossPercent: 2.0,
    takeProfitPercent: 4.0,
    trailingActivationPercent: 3.5,
    trailingGivebackPercent: 0.3,
    breakevenTriggerPercent: 1.0,
  });
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestResult, setBacktestResult] = useState(null);
  const [backtestError, setBacktestError] = useState(null);

  useEffect(() => {
    if (botStatus) {
      setSettings((prev) => ({
        ...prev,
        strategy: botStatus.strategy || prev.strategy,
        tradeAmount: botStatus.tradeAmount || prev.tradeAmount,
        leverage: botStatus.leverage ?? botStatus.riskLimits?.leverage ?? prev.leverage,
        evalIntervalMs: botStatus.evalIntervalMs || prev.evalIntervalMs,
        stopLossPercent: botStatus.riskLimits?.stopLossPercent ?? prev.stopLossPercent,
        takeProfitPercent: botStatus.riskLimits?.takeProfitPercent ?? prev.takeProfitPercent,
        trailingActivationPercent: botStatus.riskLimits?.trailingActivationPercent ?? prev.trailingActivationPercent,
        trailingGivebackPercent: botStatus.riskLimits?.trailingGivebackPercent ?? prev.trailingGivebackPercent,
        breakevenTriggerPercent: botStatus.riskLimits?.breakevenTriggerPercent ?? prev.breakevenTriggerPercent,
        maxDailyLoss: botStatus.riskLimits?.maxDailyLoss ?? prev.maxDailyLoss,
        maxOpenPositions: botStatus.riskLimits?.maxOpenPositions ?? prev.maxOpenPositions,
        cooldownSeconds: botStatus.riskLimits?.cooldownSeconds ?? prev.cooldownSeconds,
      }));
      setBacktestConfig((prev) => ({
        ...prev,
        pair: botStatus.pair || prev.pair,
        strategyName: botStatus.strategy || prev.strategyName,
        leverage: botStatus.leverage ?? prev.leverage,
      }));
    }
  }, [botStatus]);

  const handleChange = (field, val) => {
    setSettings((prev) => ({
      ...prev,
      [field]: field === 'strategy' ? val : parseFloat(val) || 0,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSettings(settings);
      setSaved(true);
      if (onSettingsUpdated) onSettingsUpdated();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert(`Failed to save settings: ${err.response?.data?.error || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRunBacktest = async (e) => {
    e.preventDefault();
    setBacktestLoading(true);
    setBacktestError(null);
    setBacktestResult(null);
    try {
      const res = await api.runBacktest({
        pair: backtestConfig.pair,
        strategyName: backtestConfig.strategyName,
        interval: backtestConfig.interval,
        limit: parseInt(backtestConfig.limit, 10),
        tradeAmount: parseFloat(backtestConfig.tradeAmount),
        leverage: parseInt(backtestConfig.leverage, 10) || 1,
        stopLossPercent: parseFloat(backtestConfig.stopLossPercent),
        takeProfitPercent: parseFloat(backtestConfig.takeProfitPercent),
        trailingActivationPercent: parseFloat(backtestConfig.trailingActivationPercent),
        trailingGivebackPercent: parseFloat(backtestConfig.trailingGivebackPercent),
        breakevenTriggerPercent: parseFloat(backtestConfig.breakevenTriggerPercent),
      });
      if (res.success) {
        setBacktestResult(res);
      } else {
        setBacktestError(res.error || 'Backtest failed.');
      }
    } catch (err) {
      setBacktestError(err.response?.data?.error || err.message);
    } finally {
      setBacktestLoading(false);
    }
  };

  const currentStrategyMeta = STRATEGY_DEFINITIONS.find((s) => s.id === settings.strategy) || STRATEGY_DEFINITIONS[0];

  return (
    <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
      {/* Header and Tab Selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sliders size={20} style={{ color: 'var(--accent-cyan)' }} />
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', margin: 0 }}>Strategy & Risk Control Center</h2>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '2px' }}>
              Multi-strategy modular engine with backtesting simulation
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div style={{ display: 'flex', gap: '6px', background: 'rgba(255,255,255,0.04)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            style={{
              padding: '6px 14px',
              fontSize: '0.82rem',
              fontWeight: '600',
              borderRadius: '7px',
              background: activeTab === 'settings' ? 'rgba(6,182,212,0.2)' : 'transparent',
              color: activeTab === 'settings' ? '#22d3ee' : 'var(--text-dim)',
              border: activeTab === 'settings' ? '1px solid rgba(6,182,212,0.4)' : '1px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Activity size={14} /> Live Bot Configuration
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('backtest')}
            style={{
              padding: '6px 14px',
              fontSize: '0.82rem',
              fontWeight: '600',
              borderRadius: '7px',
              background: activeTab === 'backtest' ? 'rgba(168,85,247,0.2)' : 'transparent',
              color: activeTab === 'backtest' ? '#c084fc' : 'var(--text-dim)',
              border: activeTab === 'backtest' ? '1px solid rgba(168,85,247,0.4)' : '1px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <BarChart2 size={14} /> Strategy Backtester
          </button>
        </div>
      </div>

      {/* TAB 1: LIVE BOT SETTINGS */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSave}>
          {/* Strategy Selection Card */}
          <div
            style={{
              background: 'rgba(6,182,212,0.04)',
              border: '1px solid rgba(6,182,212,0.18)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-bright)' }}>
                Select Active Trading Strategy
              </label>
              <span
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--accent-cyan)',
                  background: 'rgba(6,182,212,0.12)',
                  padding: '3px 10px',
                  borderRadius: '9999px',
                  border: '1px solid rgba(6,182,212,0.3)',
                }}
              >
                {currentStrategyMeta.badge}
              </span>
            </div>

            <select
              className="form-input"
              value={settings.strategy}
              onChange={(e) => handleChange('strategy', e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: '0.92rem',
                fontWeight: '600',
                background: '#131b2e',
                color: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid rgba(6,182,212,0.3)',
                marginBottom: '8px',
              }}
            >
              {STRATEGY_DEFINITIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.badge}
                </option>
              ))}
            </select>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.4 }}>
              {currentStrategyMeta.desc}
            </p>
          </div>

          {/* Leverage Multiplier & Margin Control Card */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(239, 68, 68, 0.04) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.28)',
              borderRadius: '12px',
              padding: '18px',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={18} style={{ color: '#f59e0b' }} />
                <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-bright)' }}>
                  Trading Leverage Multiplier (लिवरेज)
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: '700',
                  padding: '3px 10px',
                  borderRadius: '9999px',
                  background:
                    settings.leverage === 1
                      ? 'rgba(16, 185, 129, 0.15)'
                      : settings.leverage <= 5
                      ? 'rgba(6, 182, 212, 0.15)'
                      : settings.leverage <= 20
                      ? 'rgba(245, 158, 11, 0.15)'
                      : 'rgba(239, 68, 68, 0.18)',
                  color:
                    settings.leverage === 1
                      ? '#34d399'
                      : settings.leverage <= 5
                      ? '#22d3ee'
                      : settings.leverage <= 20
                      ? '#fbbf24'
                      : '#f87171',
                  border: `1px solid ${
                    settings.leverage === 1
                      ? 'rgba(16, 185, 129, 0.3)'
                      : settings.leverage <= 5
                      ? 'rgba(6, 182, 212, 0.3)'
                      : settings.leverage <= 20
                      ? 'rgba(245, 158, 11, 0.3)'
                      : 'rgba(239, 68, 68, 0.35)'
                  }`,
                }}
              >
                {settings.leverage === 1
                  ? '1x Spot (Zero Leverage / Cash Margin)'
                  : settings.leverage <= 5
                  ? `${settings.leverage}x Conservative Margin`
                  : settings.leverage <= 20
                  ? `${settings.leverage}x Active Futures`
                  : `⚠️ ${settings.leverage}x High Volatility Risk`}
              </span>
            </div>

            {/* Quick-Select Buttons */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {[1, 2, 3, 5, 10, 20, 25, 50, 75, 100].map((lev) => {
                const isActive = (settings.leverage || 1) === lev;
                return (
                  <button
                    key={lev}
                    type="button"
                    onClick={() => handleChange('leverage', lev)}
                    style={{
                      padding: '5px 12px',
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      background: isActive ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'rgba(255,255,255,0.05)',
                      color: isActive ? '#ffffff' : 'var(--text-dim)',
                      border: isActive ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
                      boxShadow: isActive ? '0 0 10px rgba(245, 158, 11, 0.4)' : 'none',
                    }}
                  >
                    {lev === 1 ? '1x Spot' : `${lev}x`}
                  </button>
                );
              })}
            </div>

            {/* Leverage Slider & Direct Input Row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={settings.leverage || 1}
                  onChange={(e) => handleChange('leverage', e.target.value)}
                  style={{
                    width: '100%',
                    accentColor: '#f59e0b',
                    cursor: 'pointer',
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={settings.leverage || 1}
                  onChange={(e) => handleChange('leverage', e.target.value)}
                  className="form-input"
                  style={{
                    width: '80px',
                    textAlign: 'center',
                    fontWeight: '700',
                    color: '#f59e0b',
                  }}
                  required
                />
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-dim)' }}>Multiplier</span>
              </div>
            </div>

            {/* Real-time Calculation Helper */}
            <div
              style={{
                marginTop: '12px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(0,0,0,0.25)',
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              💰 <strong>Position Sizing:</strong> Margin allocated = <strong>${settings.tradeAmount}</strong> | Total Position Size ={' '}
              <strong style={{ color: '#22d3ee' }}>
                ${(settings.tradeAmount * (settings.leverage || 1)).toLocaleString()}
              </strong>{' '}
              {settings.leverage > 1 ? (
                <>
                  • Est. Liquidation Price distance:{' '}
                  <strong style={{ color: '#f87171' }}>
                    ~{(100 / (settings.leverage || 1) * 0.95).toFixed(1)}% price drop
                  </strong>
                </>
              ) : (
                '• Spot trading mode: No borrowing, no liquidation risk'
              )}
            </div>
          </div>

          {/* Core Parameters Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '16px',
              marginBottom: '20px',
            }}
          >
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                Trade Amount ($ / Quote)
              </label>
              <input
                type="number"
                step="5"
                className="form-input"
                value={settings.tradeAmount}
                onChange={(e) => handleChange('tradeAmount', e.target.value)}
                min="5"
                max="100000"
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                Max Concurrent Positions
              </label>
              <input
                type="number"
                className="form-input"
                value={settings.maxOpenPositions}
                onChange={(e) => handleChange('maxOpenPositions', e.target.value)}
                min="1"
                max="10"
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                Tick Evaluation Loop
              </label>
              <select
                className="form-input"
                value={settings.evalIntervalMs}
                onChange={(e) => handleChange('evalIntervalMs', e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="5000">5 seconds (High Frequency)</option>
                <option value="10000">10 seconds (Standard)</option>
                <option value="15000">15 seconds</option>
                <option value="30000">30 seconds</option>
                <option value="60000">60 seconds (Conservative)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                Stop Loss (%)
              </label>
              <input
                type="number"
                step="0.05"
                className="form-input"
                value={settings.stopLossPercent}
                onChange={(e) => handleChange('stopLossPercent', e.target.value)}
                min="0.05"
                max="30"
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                Take Profit (%)
              </label>
              <input
                type="number"
                step="0.1"
                className="form-input"
                value={settings.takeProfitPercent}
                onChange={(e) => handleChange('takeProfitPercent', e.target.value)}
                min="0.5"
                max="50"
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                Max Daily Loss Limit ($)
              </label>
              <input
                type="number"
                step="10"
                className="form-input"
                value={settings.maxDailyLoss}
                onChange={(e) => handleChange('maxDailyLoss', e.target.value)}
                min="10"
                max="50000"
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                Trade Cooldown (Seconds)
              </label>
              <input
                type="number"
                className="form-input"
                value={settings.cooldownSeconds}
                onChange={(e) => handleChange('cooldownSeconds', e.target.value)}
                min="0"
                max="3600"
                required
              />
            </div>
          </div>

          {/* Dynamic Trailing TP / SL & Breakeven Controls */}
          <div
            style={{
              background: 'rgba(168, 85, 247, 0.05)',
              border: '1px solid rgba(168, 85, 247, 0.2)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={16} style={{ color: '#c084fc' }} />
                <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#e9d5ff' }}>
                  Dynamic Trailing Take-Profit & Breakeven Engine
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.72rem',
                  color: '#c084fc',
                  background: 'rgba(168, 85, 247, 0.15)',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                }}
              >
                Profit-Locking Active
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '14px',
              }}
            >
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Breakeven Trigger (%)
                </label>
                <input
                  type="number"
                  step="0.05"
                  className="form-input"
                  value={settings.breakevenTriggerPercent}
                  onChange={(e) => handleChange('breakevenTriggerPercent', e.target.value)}
                  min="0.05"
                  max="10"
                  required
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                  Moves SL to entry price (0% loss) once profit touches this %
                </span>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Trailing Activation (%)
                </label>
                <input
                  type="number"
                  step="0.05"
                  className="form-input"
                  value={settings.trailingActivationPercent}
                  onChange={(e) => handleChange('trailingActivationPercent', e.target.value)}
                  min="0.05"
                  max="30"
                  required
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                  Arms trailing profit-lock once peak profit reaches this %
                </span>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Trailing Giveback / Drop (%)
                </label>
                <input
                  type="number"
                  step="0.05"
                  className="form-input"
                  value={settings.trailingGivebackPercent}
                  onChange={(e) => handleChange('trailingGivebackPercent', e.target.value)}
                  min="0.05"
                  max="5"
                  required
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                  Auto-sells if profit falls by this % from peak
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="btn btn-start"
              disabled={saving}
              style={{ fontSize: '0.88rem', padding: '10px 22px' }}
            >
              {saved ? (
                <>
                  <Check size={16} /> Saved & Active!
                </>
              ) : (
                <>
                  <Save size={16} /> Save Strategy & Risk Parameters
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: HISTORICAL STRATEGY BACKTESTER */}
      {activeTab === 'backtest' && (
        <div>
          <form onSubmit={handleRunBacktest}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '14px',
                marginBottom: '18px',
              }}
            >
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Target Market Pair
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={backtestConfig.pair}
                  onChange={(e) => setBacktestConfig({ ...backtestConfig, pair: e.target.value.toUpperCase() })}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Backtest Strategy
                </label>
                <select
                  className="form-input"
                  value={backtestConfig.strategyName}
                  onChange={(e) => setBacktestConfig({ ...backtestConfig, strategyName: e.target.value })}
                  style={{ width: '100%' }}
                >
                  {STRATEGY_DEFINITIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Candle Timeframe
                </label>
                <select
                  className="form-input"
                  value={backtestConfig.interval}
                  onChange={(e) => setBacktestConfig({ ...backtestConfig, interval: e.target.value })}
                  style={{ width: '100%' }}
                >
                  <option value="5m">5 Minutes</option>
                  <option value="15m">15 Minutes</option>
                  <option value="1h">1 Hour</option>
                  <option value="4h">4 Hours</option>
                  <option value="1d">1 Day</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Historical Candles
                </label>
                <select
                  className="form-input"
                  value={backtestConfig.limit}
                  onChange={(e) => setBacktestConfig({ ...backtestConfig, limit: e.target.value })}
                  style={{ width: '100%' }}
                >
                  <option value="100">Last 100 Candles</option>
                  <option value="200">Last 200 Candles</option>
                  <option value="500">Last 500 Candles</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Position Size / Margin ($)
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={backtestConfig.tradeAmount}
                  onChange={(e) => setBacktestConfig({ ...backtestConfig, tradeAmount: e.target.value })}
                  min="10"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Leverage Multiplier
                </label>
                <select
                  className="form-input"
                  value={backtestConfig.leverage || 1}
                  onChange={(e) => setBacktestConfig({ ...backtestConfig, leverage: parseInt(e.target.value, 10) || 1 })}
                  style={{ width: '100%', color: '#f59e0b', fontWeight: '700' }}
                >
                  <option value="1">1x (Spot / No Leverage)</option>
                  <option value="2">2x Leverage</option>
                  <option value="3">3x Leverage</option>
                  <option value="5">5x Leverage</option>
                  <option value="10">10x Leverage</option>
                  <option value="20">20x Leverage</option>
                  <option value="50">50x Leverage</option>
                  <option value="100">100x Leverage</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Stop Loss (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  className="form-input"
                  value={backtestConfig.stopLossPercent}
                  onChange={(e) => setBacktestConfig({ ...backtestConfig, stopLossPercent: e.target.value })}
                  min="0.5"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Take Profit (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  className="form-input"
                  value={backtestConfig.takeProfitPercent}
                  onChange={(e) => setBacktestConfig({ ...backtestConfig, takeProfitPercent: e.target.value })}
                  min="0.5"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Breakeven Trigger (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  className="form-input"
                  value={backtestConfig.breakevenTriggerPercent}
                  onChange={(e) => setBacktestConfig({ ...backtestConfig, breakevenTriggerPercent: e.target.value })}
                  min="0.1"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Trailing Activation (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  className="form-input"
                  value={backtestConfig.trailingActivationPercent}
                  onChange={(e) => setBacktestConfig({ ...backtestConfig, trailingActivationPercent: e.target.value })}
                  min="0.5"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Trailing Giveback (%)
                </label>
                <input
                  type="number"
                  step="0.05"
                  className="form-input"
                  value={backtestConfig.trailingGivebackPercent}
                  onChange={(e) => setBacktestConfig({ ...backtestConfig, trailingGivebackPercent: e.target.value })}
                  min="0.05"
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
              <button
                type="submit"
                className="btn btn-simulate"
                disabled={backtestLoading}
                style={{ padding: '10px 24px', fontSize: '0.88rem' }}
              >
                {backtestLoading ? 'Computing Simulation...' : '▶ Run Historical Backtest'}
              </button>
            </div>
          </form>

          {/* Backtest Error */}
          {backtestError && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                marginBottom: '16px',
                fontSize: '0.88rem',
              }}
            >
              <strong>Simulation Error:</strong> {backtestError}
            </div>
          )}

          {/* Backtest Results Card */}
          {backtestResult?.summary && (
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.7)',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid rgba(168,85,247,0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#c084fc', margin: 0 }}>
                  Backtest Performance: {backtestResult.summary.pair} ({backtestResult.summary.strategy}) {backtestResult.summary.leverage > 1 ? `[${backtestResult.summary.leverage}x Leverage]` : '[1x Spot]'}
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  Evaluated {backtestResult.summary.candleCount} candles ({backtestResult.summary.interval})
                </span>
              </div>

              {/* Performance Metrics Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '12px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Net Profit</div>
                  <div
                    style={{
                      fontSize: '1.15rem',
                      fontWeight: '700',
                      color: backtestResult.summary.netProfit >= 0 ? '#34d399' : '#f87171',
                      marginTop: '4px',
                    }}
                  >
                    {backtestResult.summary.netProfit >= 0 ? `+$${backtestResult.summary.netProfit.toFixed(2)}` : `-$${Math.abs(backtestResult.summary.netProfit).toFixed(2)}`}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    ({backtestResult.summary.netProfitPercent >= 0 ? '+' : ''}{backtestResult.summary.netProfitPercent}%)
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Win Rate</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: '700', color: '#38bdf8', marginTop: '4px' }}>
                    {backtestResult.summary.winRatePercent}%
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    {backtestResult.summary.winningTrades} W / {backtestResult.summary.losingTrades} L
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Total Trades</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: '700', color: '#f8fafc', marginTop: '4px' }}>
                    {backtestResult.summary.totalTrades}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '2px' }}>Executed</div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Max Drawdown</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: '700', color: '#f87171', marginTop: '4px' }}>
                    {backtestResult.summary.maxDrawdownPercent}%
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '2px' }}>Peak to Valley</div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Profit Factor</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: '700', color: '#a78bfa', marginTop: '4px' }}>
                    {backtestResult.summary.profitFactor}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '2px' }}>Gains / Losses</div>
                </div>
              </div>

              {/* Recent Backtest Trades Table */}
              {backtestResult.trades?.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '8px' }}>
                    Recent Simulated Trades
                  </h4>
                  <div style={{ overflowX: 'auto', maxHeight: '200px' }}>
                    <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left' }}>
                          <th style={{ padding: '6px' }}>Entry</th>
                          <th style={{ padding: '6px' }}>Exit</th>
                          <th style={{ padding: '6px' }}>P&L ($)</th>
                          <th style={{ padding: '6px' }}>P&L (%)</th>
                          <th style={{ padding: '6px' }}>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backtestResult.trades.map((t) => (
                          <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '6px' }}>${t.entryPrice?.toFixed(2)}</td>
                            <td style={{ padding: '6px' }}>${t.exitPrice?.toFixed(2)}</td>
                            <td style={{ padding: '6px', color: t.pnl >= 0 ? '#34d399' : '#f87171', fontWeight: '600' }}>
                              {t.pnl >= 0 ? `+$${t.pnl}` : `-$${Math.abs(t.pnl)}`}
                            </td>
                            <td style={{ padding: '6px', color: t.pnlPercent >= 0 ? '#34d399' : '#f87171' }}>
                              {t.pnlPercent >= 0 ? `+${t.pnlPercent}%` : `${t.pnlPercent}%`}
                            </td>
                            <td style={{ padding: '6px', color: 'var(--text-dim)' }}>{t.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
