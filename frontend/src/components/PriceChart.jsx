import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

export default function PriceChart({
  candles = [],
  pair = 'BTCUSDT',
  interval = '5m',
  onIntervalChange,
}) {
  if (!candles || candles.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '24px', height: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-dim)' }}>Loading market candles ({interval}) for {pair}...</span>
      </div>
    );
  }

  // Format candles for Recharts and compute simple running EMAs for visualization
  const kFast = 2 / (20 + 1);
  const kSlow = 2 / (50 + 1);
  let prevFast = parseFloat(candles[0]?.close || 0);
  let prevSlow = parseFloat(candles[0]?.close || 0);

  const chartData = candles.map((c, i) => {
    const close = parseFloat(c.close);
    prevFast = i === 0 ? close : close * kFast + prevFast * (1 - kFast);
    prevSlow = i === 0 ? close : close * kSlow + prevSlow * (1 - kSlow);

    const timeStr = c.time ? new Date(c.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `${i}`;

    return {
      time: timeStr,
      price: close,
      fastEma: parseFloat(prevFast.toFixed(2)),
      slowEma: parseFloat(prevSlow.toFixed(2)),
      volume: parseFloat(c.volume || 0),
    };
  });

  // Calculate dynamic min/max domain so the line looks dramatic and clear
  const prices = chartData.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.08 || 10;
  const domainMin = Math.floor(minPrice - padding);
  const domainMax = Math.ceil(maxPrice + padding);

  const intervals = ['1m', '5m', '15m', '1h'];

  return (
    <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: '700' }}>{pair} Price & Strategy Indicators</h2>
            {/* Timeframe selector buttons */}
            <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', padding: '2px', border: '1px solid rgba(255,255,255,0.1)' }}>
              {intervals.map((int) => (
                <button
                  key={int}
                  type="button"
                  onClick={() => onIntervalChange && onIntervalChange(int)}
                  style={{
                    background: interval === int ? 'var(--accent-cyan)' : 'transparent',
                    color: interval === int ? '#0f172a' : 'var(--text-dim)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '0.72rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {int.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '2px' }}>
            {interval === '5m' ? '5-Minute' : interval === '1m' ? '1-Minute' : interval === '15m' ? '15-Minute' : '1-Hour'} Candles with Fast EMA (20) & Slow EMA (50)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '14px', fontSize: '0.78rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8' }}>
            <span style={{ width: '10px', height: '3px', background: '#38bdf8', display: 'inline-block' }}></span> Price
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981' }}>
            <span style={{ width: '10px', height: '3px', background: '#10b981', display: 'inline-block' }}></span> Fast EMA (20)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a855f7' }}>
            <span style={{ width: '10px', height: '3px', background: '#a855f7', display: 'inline-block' }}></span> Slow EMA (50)
          </span>
        </div>
      </div>

      <div style={{ width: '100%', height: '320px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="time" stroke="var(--text-dim)" fontSize={11} tickLine={false} />
            <YAxis
              domain={[domainMin, domainMax]}
              stroke="var(--text-dim)"
              fontSize={11}
              tickLine={false}
              orientation="right"
              tickFormatter={(v) => `$${v.toLocaleString()}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f1422',
                borderColor: 'rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '12px',
                boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
              }}
              formatter={(value, name) => [`$${Number(value).toLocaleString()}`, name.toUpperCase()]}
            />
            <Line type="monotone" dataKey="price" stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="fastEma" stroke="#10b981" strokeWidth={1.5} dot={false} isAnimationActive={false} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="slowEma" stroke="#a855f7" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
