import React, { useState, useEffect } from 'react';
import { Sliders, Save, Check } from 'lucide-react';
import api from '../services/api';

export default function StrategySettings({ botStatus, onSettingsUpdated }) {
  const [settings, setSettings] = useState({
    fastEmaPeriod: 20,
    slowEmaPeriod: 50,
    rsiPeriod: 14,
    stopLossPercent: 2.0,
    takeProfitPercent: 4.0,
    tradeAmount: 50,
    maxDailyLoss: 100,
    cooldownSeconds: 60,
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (botStatus) {
      setSettings((prev) => ({
        ...prev,
        tradeAmount: botStatus.tradeAmount || prev.tradeAmount,
        stopLossPercent: botStatus.riskLimits?.stopLossPercent || prev.stopLossPercent,
        takeProfitPercent: botStatus.riskLimits?.takeProfitPercent || prev.takeProfitPercent,
        maxDailyLoss: botStatus.riskLimits?.maxDailyLoss || prev.maxDailyLoss,
        cooldownSeconds: botStatus.riskLimits?.cooldownSeconds || prev.cooldownSeconds,
      }));
    }
  }, [botStatus]);

  const handleChange = (field, val) => {
    setSettings((prev) => ({ ...prev, [field]: parseFloat(val) || 0 }));
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
      alert(`Failed to save settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sliders size={18} style={{ color: 'var(--accent-cyan)' }} />
          <h2 style={{ fontSize: '1.05rem', fontWeight: '700' }}>Trading Strategy & Risk Parameters</h2>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', background: 'rgba(6,182,212,0.1)', padding: '3px 10px', borderRadius: '9999px', border: '1px solid rgba(6,182,212,0.2)' }}>
          Modular: EMA Crossover + RSI
        </span>
      </div>

      <form onSubmit={handleSave}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '18px' }}>
          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
              Fast EMA Period
            </label>
            <input
              type="number"
              className="form-input"
              value={settings.fastEmaPeriod}
              onChange={(e) => handleChange('fastEmaPeriod', e.target.value)}
              min="2"
              max="100"
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
              Slow EMA Period
            </label>
            <input
              type="number"
              className="form-input"
              value={settings.slowEmaPeriod}
              onChange={(e) => handleChange('slowEmaPeriod', e.target.value)}
              min="5"
              max="200"
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
              RSI Lookback Period
            </label>
            <input
              type="number"
              className="form-input"
              value={settings.rsiPeriod}
              onChange={(e) => handleChange('rsiPeriod', e.target.value)}
              min="2"
              max="50"
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
              Stop Loss (%)
            </label>
            <input
              type="number"
              step="0.1"
              className="form-input"
              value={settings.stopLossPercent}
              onChange={(e) => handleChange('stopLossPercent', e.target.value)}
              min="0.5"
              max="20"
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
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
              Trade Amount ($/₹)
            </label>
            <input
              type="number"
              step="5"
              className="form-input"
              value={settings.tradeAmount}
              onChange={(e) => handleChange('tradeAmount', e.target.value)}
              min="5"
              max="10000"
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
              Max Daily Loss ($/₹)
            </label>
            <input
              type="number"
              step="10"
              className="form-input"
              value={settings.maxDailyLoss}
              onChange={(e) => handleChange('maxDailyLoss', e.target.value)}
              min="10"
              max="50000"
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
              Cooldown (Seconds)
            </label>
            <input
              type="number"
              className="form-input"
              value={settings.cooldownSeconds}
              onChange={(e) => handleChange('cooldownSeconds', e.target.value)}
              min="0"
              max="3600"
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            className="btn btn-start"
            disabled={saving}
            style={{ fontSize: '0.85rem', padding: '8px 18px' }}
          >
            {saved ? (
              <>
                <Check size={16} /> Saved!
              </>
            ) : (
              <>
                <Save size={16} /> Save Strategy Parameters
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
