import React, { useState, useEffect } from 'react';
import { Sliders, Save, Check, Play, TrendingUp, ShieldAlert, BarChart2, Activity, Zap, Clock } from 'lucide-react';
import api from '../services/api';

const STRATEGY_DEFINITIONS = [
  {
    id: 'TREND_PULLBACK_PRO',
    name: '👑 Institutional Trend Pullback Pro (200 EMA + ADX + TDS Shield)',
    badge: 'Institutional Edge',
    timeframe: '15m',
    timeframeLabel: '15 Minutes (Adaptive)',
    cycleSeconds: 900,
    accentColor: '#f59e0b',
    desc: 'High win-rate institutional setup: Trades strictly with the 200 EMA macro trend, filters choppy sideways noise (ADX >= 18), buys 20/50 EMA dynamic pullbacks, and protects net profit after 1% Indian TDS and exchange fees.',
  },
  {
    id: 'SCALPER_3M',
    name: '⚡ 3-Minute Scalper (Dynamic Trailing Profit)',
    badge: '3-Min Fast Scalp',
    timeframe: '3m',
    timeframeLabel: '3 Minutes (03:00 Cycle)',
    cycleSeconds: 180,
    accentColor: '#38bdf8',
    desc: 'Rapid 3-minute execution: Micro EMA (3/8) + RSI (7) with Dynamic Trailing Profit (unlimited upside), strict fixed stop-loss (-0.35%), and 3-min auto-exit.',
  },
  {
    id: 'SCALPER_15M',
    name: '⚡ 15-Minute Scalper (Dynamic Trailing Profit)',
    badge: '15-Min Scalper',
    timeframe: '15m',
    timeframeLabel: '15 Minutes (15:00 Cycle)',
    cycleSeconds: 900,
    accentColor: '#34d399',
    desc: 'Continuous 15-minute execution: EMA (9/21) + RSI (14) with Dynamic Trailing Profit (+0.60%), strict fixed stop-loss (-0.80%), and 15-min auto-exit.',
  },
  {
    id: 'EMA_RSI',
    name: 'EMA Crossover + RSI (15M Dynamic)',
    badge: '15-Min Trend / Scalp',
    timeframe: '15m',
    timeframeLabel: '15 Minutes (15:00 Cycle)',
    cycleSeconds: 900,
    accentColor: '#34d399',
    desc: 'Active 15-minute trading: Fast & slow EMA crossover + momentum buying, dynamic trailing profit, and 15-min auto-exit.',
  },
  {
    id: 'BOLLINGER_BANDS',
    name: 'Bollinger Bands (Mean Reversion)',
    badge: 'Mean Reversion',
    timeframe: '15m',
    timeframeLabel: '15 Minutes (15:00 Cycle)',
    cycleSeconds: 900,
    accentColor: '#34d399',
    desc: 'Buys extreme oversold dips at the lower band and exits at the upper band or overbought RSI.',
  },
  {
    id: 'GRID',
    name: 'Grid Trading',
    badge: 'Range Bound',
    timeframe: '15m',
    timeframeLabel: '15 Minutes (15:00 Cycle)',
    cycleSeconds: 900,
    accentColor: '#34d399',
    desc: 'Systematic stepped grid buying on dips and taking profit at upper volatility levels.',
  },
  {
    id: 'MACD_RSI',
    name: 'MACD + RSI Breakout',
    badge: 'Momentum Breakout',
    timeframe: '15m',
    timeframeLabel: '15 Minutes (15:00 Cycle)',
    cycleSeconds: 900,
    accentColor: '#34d399',
    desc: 'Captures explosive trend movements when MACD histogram flips positive with healthy RSI.',
  },
  {
    id: 'TREND_4H',
    name: '📈 4-Hour Trend & Swing (EMA 20/50 + RSI)',
    badge: '4-Hour Swing',
    timeframe: '4h',
    timeframeLabel: '4 Hours (04:00:00 Cycle)',
    cycleSeconds: 14400,
    accentColor: '#c084fc',
    desc: 'Macro 4-hour trend following: EMA (20/50) golden cross/momentum with RSI (14) filter, unified profit-locking ladder, and strict stop-loss.',
  },
];

const getTimeframeForStrategy = (stratId) => {
  const meta = STRATEGY_DEFINITIONS.find((s) => s.id === stratId);
  return meta ? meta.timeframe : '15m';
};

export default function StrategySettings({ botStatus, onSettingsUpdated }) {
  const [activeTab, setActiveTab] = useState('settings'); // 'settings' | 'backtest'

  // Settings State (Default: High-Profit TDS-Optimized Preset)
  const [settings, setSettings] = useState({
    strategy: 'TREND_PULLBACK_PRO',
    tradeAmount: 2500,
    leverage: 1,
    maxLossPercent: 1.5,
    profitLockLevels: '3.5,5.5,8,12,15',
    profitLockStepAfterLast: 1.5,
    lockBufferPercent: 0.4,
    breakevenTriggerPercent: 2.5,
    maxDailyLoss: 250,
    maxOpenPositions: 1,
    cooldownSeconds: 60,
    evalIntervalMs: 10000,
    fastEmaPeriod: 20,
    slowEmaPeriod: 50,
    rsiPeriod: 14,
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Backtest State (Default: High-Profit 4H Trend Preset)
  const [backtestConfig, setBacktestConfig] = useState({
    pair: 'BTCINR',
    strategyName: 'TREND_4H',
    interval: '4h',
    limit: 200,
    tradeAmount: 2500,
    leverage: 1,
    maxLossPercent: 1.8,
    profitLockLevels: '3,5,8,12,15',
    profitLockStepAfterLast: 1.5,
    lockBufferPercent: 0.3,
    breakevenTriggerPercent: 2.0,
  });
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestResult, setBacktestResult] = useState(null);
  const [backtestError, setBacktestError] = useState(null);

  // Instant leverage auto-save feedback & edit protection
  const [leverageAutoSaving, setLeverageAutoSaving] = useState(false);
  const [leverageFeedback, setLeverageFeedback] = useState('');
  const lastUserLeverageEditTimeRef = React.useRef(0);

  useEffect(() => {
    if (botStatus) {
      const activeStrat = botStatus.strategy || settings.strategy;
      const meta = STRATEGY_DEFINITIONS.find((s) => s.id === activeStrat) || STRATEGY_DEFINITIONS[0];

      // Avoid overwriting leverage if user recently clicked/edited leverage within 4 seconds
      const isRecentUserEdit = (Date.now() - lastUserLeverageEditTimeRef.current) < 4000;
      const effectiveLeverage = isRecentUserEdit
        ? settings.leverage
        : (botStatus.leverage ?? botStatus.riskLimits?.leverage ?? settings.leverage ?? 5);

      setSettings((prev) => ({
        ...prev,
        strategy: activeStrat,
        tradeAmount: botStatus.tradeAmount || prev.tradeAmount,
        leverage: effectiveLeverage,
        evalIntervalMs: botStatus.evalIntervalMs || prev.evalIntervalMs,
        maxLossPercent: botStatus.riskLimits?.maxLossPercent ?? prev.maxLossPercent,
        profitLockLevels: botStatus.riskLimits?.profitLockLevels ?? prev.profitLockLevels,
        profitLockStepAfterLast: botStatus.riskLimits?.profitLockStepAfterLast ?? prev.profitLockStepAfterLast,
        lockBufferPercent: botStatus.riskLimits?.lockBufferPercent ?? prev.lockBufferPercent,
        breakevenTriggerPercent: botStatus.riskLimits?.breakevenTriggerPercent ?? prev.breakevenTriggerPercent,
        maxDailyLoss: botStatus.riskLimits?.maxDailyLoss ?? prev.maxDailyLoss,
        maxOpenPositions: botStatus.riskLimits?.maxOpenPositions ?? prev.maxOpenPositions,
        cooldownSeconds: botStatus.riskLimits?.cooldownSeconds ?? prev.cooldownSeconds,
      }));
      setBacktestConfig((prev) => ({
        ...prev,
        pair: botStatus.pair || prev.pair,
        strategyName: activeStrat,
        interval: meta.timeframe, // Auto-sync interval to strategy timeframe (3m, 15m, 4h)
        leverage: effectiveLeverage,
        maxLossPercent: botStatus.riskLimits?.maxLossPercent ?? prev.maxLossPercent,
        profitLockLevels: botStatus.riskLimits?.profitLockLevels ?? prev.profitLockLevels,
      }));
    }
  }, [botStatus]);

  const handleLeverageSelect = async (newLev, autoSave = true) => {
    const val = Math.min(100, Math.max(1, parseInt(newLev, 10) || 1));
    lastUserLeverageEditTimeRef.current = Date.now();

    setSettings((prev) => ({
      ...prev,
      leverage: val,
    }));
    setBacktestConfig((prev) => ({
      ...prev,
      leverage: val,
    }));

    if (autoSave) {
      setLeverageAutoSaving(true);
      try {
        await api.updateSettings({ leverage: val });
        setLeverageFeedback(`⚡ ${val === 1 ? '1x Spot (Zero Leverage)' : `${val}x Leverage`} Active & Saved!`);
        if (onSettingsUpdated) onSettingsUpdated();
        setTimeout(() => setLeverageFeedback(''), 3000);
      } catch (err) {
        setLeverageFeedback(`⚠️ Failed to apply leverage: ${err.response?.data?.error || err.message}`);
        setTimeout(() => setLeverageFeedback(''), 4000);
      } finally {
        setLeverageAutoSaving(false);
      }
    }
  };

  const handleStrategySelect = (newStrategyId) => {
    const meta = STRATEGY_DEFINITIONS.find((s) => s.id === newStrategyId) || STRATEGY_DEFINITIONS[0];
    setSettings((prev) => ({
      ...prev,
      strategy: newStrategyId,
    }));
    // Auto-update backtester strategy AND timeframe to match selected strategy!
    setBacktestConfig((prev) => ({
      ...prev,
      strategyName: newStrategyId,
      interval: meta.timeframe,
    }));
  };

  const handleBacktestStrategySelect = (stratId) => {
    const meta = STRATEGY_DEFINITIONS.find((s) => s.id === stratId) || STRATEGY_DEFINITIONS[0];
    setBacktestConfig((prev) => ({
      ...prev,
      strategyName: stratId,
      interval: meta.timeframe, // Auto-change candle timeframe to match strategy! (e.g. 3m, 15m, 4h)
    }));
  };

  const handleChange = (field, val) => {
    if (field === 'strategy') {
      handleStrategySelect(val);
      return;
    }
    if (field === 'leverage') {
      handleLeverageSelect(val, false);
      return;
    }
    setSettings((prev) => ({
      ...prev,
      [field]: field === 'profitLockLevels' ? val : (val === '' ? '' : parseFloat(val) || 0),
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSettings(settings);
      setSaved(true);
      if (onSettingsUpdated) onSettingsUpdated(settings.strategy);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert(`Failed to save settings: ${err.response?.data?.error || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const applyHighProfitPreset = async () => {
    const highProfitConfig = {
      strategy: 'TREND_PULLBACK_PRO',
      tradeAmount: 2500,
      leverage: 1,
      maxLossPercent: 1.5,
      profitLockLevels: '3.5,5.5,8,12,15',
      profitLockStepAfterLast: 1.5,
      lockBufferPercent: 0.4,
      breakevenTriggerPercent: 2.5,
      maxDailyLoss: 250,
      cooldownSeconds: 60,
    };
    setSettings((prev) => ({ ...prev, ...highProfitConfig }));
    setBacktestConfig((prev) => ({
      ...prev,
      strategyName: 'TREND_PULLBACK_PRO',
      interval: '15m',
      tradeAmount: 2500,
      leverage: 1,
      maxLossPercent: 1.5,
      profitLockLevels: '3.5,5.5,8,12,15',
      profitLockStepAfterLast: 1.5,
      lockBufferPercent: 0.4,
      breakevenTriggerPercent: 2.5,
    }));
    try {
      setSaving(true);
      await api.updateSettings(highProfitConfig);
      setSaved(true);
      if (onSettingsUpdated) onSettingsUpdated('TREND_PULLBACK_PRO');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert(`Failed to apply high-profit preset: ${err.response?.data?.error || err.message}`);
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
        maxLossPercent: parseFloat(backtestConfig.maxLossPercent),
        profitLockLevels: backtestConfig.profitLockLevels,
        profitLockStepAfterLast: parseFloat(backtestConfig.profitLockStepAfterLast || 1),
        lockBufferPercent: parseFloat(backtestConfig.lockBufferPercent || 0),
        breakevenTriggerPercent: parseFloat(backtestConfig.breakevenTriggerPercent || 0),
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
          {/* Quick High-Profit Preset Recommendation Banner */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 182, 212, 0.08) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              borderRadius: '12px',
              padding: '14px 18px',
              marginBottom: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem' }}>🏆</span>
                <span style={{ fontSize: '0.88rem', fontWeight: '800', color: '#86efac' }}>
                  Recommended High-Profit Profile (Beats Indian 1% TDS & CoinDCX Fees)
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.4 }}>
                Optimized for ₹4,660 Balance: ₹2,500 Trade Size • 1.8% Stop-Loss (Noise Immune) • +3% to +15% Profit Ladder • 4H Trend
              </p>
            </div>
            <button
              type="button"
              onClick={applyHighProfitPreset}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '0.78rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 0 12px rgba(16,185,129,0.3)',
                transition: 'all 0.2s ease',
              }}
            >
              <span>⚡ 1-Click Apply High-Profit Settings</span>
            </button>
          </div>

          {/* Strategy Selection Card */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(6,182,212,0.06) 0%, rgba(15,23,42,0.6) 100%)',
              border: `1px solid ${currentStrategyMeta.accentColor || 'rgba(6,182,212,0.3)'}`,
              borderRadius: '12px',
              padding: '18px',
              marginBottom: '20px',
              transition: 'all 0.3s ease',
            }}
          >
            {/* Top row: Title and Timeframe & Badge indicators */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} style={{ color: currentStrategyMeta.accentColor || 'var(--accent-cyan)' }} />
                <label style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-bright)' }}>
                  Active Trading Strategy & Execution Timeframe
                </label>
              </div>

              {/* Dynamic Auto-Timeframe Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: '700',
                    color: currentStrategyMeta.accentColor || '#38bdf8',
                    background: 'rgba(0,0,0,0.4)',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    border: `1px solid ${currentStrategyMeta.accentColor || '#38bdf8'}55`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <Clock size={13} /> {currentStrategyMeta.timeframeLabel}
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: '#f8fafc',
                    background: `${currentStrategyMeta.accentColor}25`,
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    border: `1px solid ${currentStrategyMeta.accentColor}66`,
                    fontWeight: '600',
                  }}
                >
                  {currentStrategyMeta.badge}
                </span>
              </div>
            </div>

            {/* Strategy Dropdown */}
            <select
              className="form-input"
              value={settings.strategy}
              onChange={(e) => handleChange('strategy', e.target.value)}
              style={{
                width: '100%',
                padding: '11px 14px',
                fontSize: '0.92rem',
                fontWeight: '700',
                background: '#0f172a',
                color: '#f8fafc',
                borderRadius: '8px',
                border: `1px solid ${currentStrategyMeta.accentColor}88`,
                marginBottom: '12px',
                cursor: 'pointer',
              }}
            >
              {STRATEGY_DEFINITIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} [{s.timeframe.toUpperCase()}]
                </option>
              ))}
            </select>

            {/* Quick Strategy Selection Chips */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {STRATEGY_DEFINITIONS.map((s) => {
                const isSelected = settings.strategy === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleStrategySelect(s.id)}
                    style={{
                      padding: '5px 12px',
                      fontSize: '0.76rem',
                      fontWeight: '700',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      background: isSelected ? s.accentColor : 'rgba(255,255,255,0.04)',
                      color: isSelected ? '#0f172a' : 'var(--text-dim)',
                      border: isSelected ? `1px solid ${s.accentColor}` : '1px solid rgba(255,255,255,0.08)',
                      boxShadow: isSelected ? `0 0 12px ${s.accentColor}55` : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>{s.badge}</span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: isSelected ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.08)',
                        color: isSelected ? '#0f172a' : s.accentColor,
                        fontWeight: '800',
                      }}
                    >
                      {s.timeframe.toUpperCase()}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Strategy Info & Timeframe Banner */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.06)',
                flexWrap: 'wrap',
              }}
            >
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-bright)', lineHeight: 1.4, flex: '1 1 300px' }}>
                {currentStrategyMeta.desc}
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.74rem',
                  fontWeight: '700',
                  color: currentStrategyMeta.accentColor,
                  background: `${currentStrategyMeta.accentColor}18`,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${currentStrategyMeta.accentColor}44`,
                  whiteSpace: 'nowrap',
                }}
              >
                <Clock size={13} />
                <span>Auto-Timeframe: {currentStrategyMeta.timeframe.toUpperCase()} ({currentStrategyMeta.cycleSeconds}s cycle)</span>
              </div>
            </div>
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
                {leverageFeedback && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: '700',
                      color: '#34d399',
                      background: 'rgba(16, 185, 129, 0.2)',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                    }}
                  >
                    {leverageFeedback}
                  </span>
                )}
                {leverageAutoSaving && (
                  <span style={{ fontSize: '0.7rem', color: '#fbbf24', fontStyle: 'italic' }}>
                    Applying...
                  </span>
                )}
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
                  ? '✓ 1x Spot (Zero Leverage / Cash Margin)'
                  : settings.leverage <= 5
                  ? `✓ ${settings.leverage}x Active Margin (Live & Working)`
                  : settings.leverage <= 20
                  ? `✓ ${settings.leverage}x Active Futures Multiplier`
                  : `⚠️ ${settings.leverage}x High Volatility Risk Multiplier`}
              </span>
            </div>

            {/* Quick-Select Buttons: Click immediately activates & auto-saves to bot */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {[1, 2, 3, 5, 10, 20, 25, 50, 75, 100].map((lev) => {
                const isActive = (settings.leverage || 1) === lev;
                return (
                  <button
                    key={lev}
                    type="button"
                    onClick={() => handleLeverageSelect(lev, true)}
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
                  onChange={(e) => handleLeverageSelect(e.target.value, false)}
                  onMouseUp={() => handleLeverageSelect(settings.leverage, true)}
                  onTouchEnd={() => handleLeverageSelect(settings.leverage, true)}
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
                  onChange={(e) => handleLeverageSelect(e.target.value, false)}
                  onBlur={() => handleLeverageSelect(settings.leverage, true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleLeverageSelect(settings.leverage, true);
                    }
                  }}
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
                Hard Max Loss (%)
              </label>
              <input
                type="number"
                step="0.05"
                className="form-input"
                value={settings.maxLossPercent}
                onChange={(e) => handleChange('maxLossPercent', e.target.value)}
                min="0.05"
                max="30"
                required
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                Market-sells immediately if profit% drops to -{settings.maxLossPercent}%
              </span>
            </div>

            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                Breakeven Trigger (%) [0 = OFF]
              </label>
              <input
                type="number"
                step="0.05"
                className="form-input"
                value={settings.breakevenTriggerPercent}
                onChange={(e) => handleChange('breakevenTriggerPercent', e.target.value)}
                min="0"
                max="10"
                required
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                0 = Off (pure ladder). Moves stop to entry price once touched.
              </span>
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

          {/* Stepped Profit-Lock Ladder Engine Controls */}
          <div
            style={{
              background: 'rgba(34, 197, 94, 0.05)',
              border: '1px solid rgba(34, 197, 94, 0.2)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={16} style={{ color: '#4ade80' }} />
                <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#bbf7d0' }}>
                  Stepped Profit-Lock Ladder Engine (Unified Exits)
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.72rem',
                  color: '#4ade80',
                  background: 'rgba(34, 197, 94, 0.15)',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
              >
                Unlimited Upside (No Fixed TP)
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
                  Ladder Lock Levels (%)
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.profitLockLevels}
                  onChange={(e) => handleChange('profitLockLevels', e.target.value)}
                  placeholder="1.8,3,5,7,9,11,13,15"
                  required
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                  Steps lock up when peak reaches each level (1.8% -&gt; 1.8%, 3% -&gt; 3%, etc.)
                </span>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Step After Last Level (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  className="form-input"
                  value={settings.profitLockStepAfterLast}
                  onChange={(e) => handleChange('profitLockStepAfterLast', e.target.value)}
                  min="0.1"
                  max="10"
                  required
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                  Continues stepping after last level (e.g. +1% step: 7.3% peak -&gt; lock 7%)
                </span>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Lock Buffer (%)
                </label>
                <input
                  type="number"
                  step="0.05"
                  className="form-input"
                  value={settings.lockBufferPercent}
                  onChange={(e) => handleChange('lockBufferPercent', e.target.value)}
                  min="0"
                  max="5"
                  required
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                  Sell threshold = locked level - buffer (0 = sell when profit drops below lock)
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    Backtest Strategy
                  </label>
                  <span style={{ fontSize: '0.7rem', color: '#c084fc', fontWeight: '700' }}>
                    {getTimeframeForStrategy(backtestConfig.strategyName).toUpperCase()} Mode
                  </span>
                </div>
                <select
                  className="form-input"
                  value={backtestConfig.strategyName}
                  onChange={(e) => handleBacktestStrategySelect(e.target.value)}
                  style={{ width: '100%', borderColor: 'rgba(168,85,247,0.3)' }}
                >
                  {STRATEGY_DEFINITIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} [{s.timeframe.toUpperCase()}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    Candle Timeframe
                  </label>
                  <span style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: '700' }}>
                    ⚡ Auto-Selected: {backtestConfig.interval.toUpperCase()}
                  </span>
                </div>
                <select
                  className="form-input"
                  value={backtestConfig.interval}
                  onChange={(e) => setBacktestConfig({ ...backtestConfig, interval: e.target.value })}
                  style={{ width: '100%', borderColor: 'rgba(56,189,248,0.4)', fontWeight: '600' }}
                >
                  <option value="1m">1 Minute (Ultra Micro)</option>
                  <option value="3m">3 Minutes (⚡ 3M Fast Scalp)</option>
                  <option value="5m">5 Minutes</option>
                  <option value="15m">15 Minutes (🕒 15M Trend / Scalp)</option>
                  <option value="1h">1 Hour</option>
                  <option value="4h">4 Hours (📈 4H Macro Swing)</option>
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
                  Hard Max Loss (%)
                </label>
                <input
                  type="number"
                  step="0.05"
                  className="form-input"
                  value={backtestConfig.maxLossPercent}
                  onChange={(e) => setBacktestConfig({ ...backtestConfig, maxLossPercent: e.target.value })}
                  min="0.05"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Ladder Lock Levels (%)
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={backtestConfig.profitLockLevels}
                  onChange={(e) => setBacktestConfig({ ...backtestConfig, profitLockLevels: e.target.value })}
                  placeholder="1.8,3,5,7,9,11,13,15"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Step After Last Level (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  className="form-input"
                  value={backtestConfig.profitLockStepAfterLast || 1}
                  onChange={(e) => setBacktestConfig({ ...backtestConfig, profitLockStepAfterLast: e.target.value })}
                  min="0.1"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Lock Buffer (%)
                </label>
                <input
                  type="number"
                  step="0.05"
                  className="form-input"
                  value={backtestConfig.lockBufferPercent || 0}
                  onChange={(e) => setBacktestConfig({ ...backtestConfig, lockBufferPercent: e.target.value })}
                  min="0"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Breakeven Trigger (%) [0 = OFF]
                </label>
                <input
                  type="number"
                  step="0.05"
                  className="form-input"
                  value={backtestConfig.breakevenTriggerPercent || 0}
                  onChange={(e) => setBacktestConfig({ ...backtestConfig, breakevenTriggerPercent: e.target.value })}
                  min="0"
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
