import React from 'react';
import { DollarSign, TrendingUp, TrendingDown, Target, Wallet, Cpu } from 'lucide-react';

export default function MetricsCards({
  botStatus,
  pairs = [],
  selectedPair,
  onPairChange,
  currentPrice,
  tickerData,
}) {
  const isINR = selectedPair?.endsWith('INR');
  const currencySymbol = isINR ? '₹' : '$';

  const price = currentPrice || botStatus?.currentPrice || 0;
  const change24h = tickerData?.change_24_hour ? parseFloat(tickerData.change_24_hour) : 0;
  const isPriceUp = change24h >= 0;

  const dailyPnL = botStatus?.dailyRealizedPnL || 0;
  const isPnLPositive = dailyPnL >= 0;

  const activePosition = botStatus?.activePosition;
  const balances = botStatus?.balances || {};
  const lastSignal = botStatus?.lastSignal;

  return (
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
          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: '600', textTransform: 'uppercase' }}>
            Available Balance
          </span>
          <Wallet size={16} style={{ color: 'var(--accent-cyan)' }} />
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
            <span className="font-mono" style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              ₹{Number(balances.INR || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Crypto (BTC):</span>
            <span className="font-mono" style={{ fontSize: '0.85rem', color: 'var(--accent-cyan)' }}>
              {Number(balances.BTC || 0).toFixed(6)} BTC
            </span>
          </div>
        </div>
      </div>

      {/* 3. TODAY'S REALIZED P&L */}
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

        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          Max daily loss limit: ${botStatus?.riskLimits?.maxDailyLoss || 100}
        </div>
      </div>

      {/* 4. ACTIVE POSITION & TARGETS */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: '600', textTransform: 'uppercase' }}>
            Active Position
          </span>
          <Target size={16} style={{ color: activePosition ? 'var(--accent-green)' : 'var(--text-dim)' }} />
        </div>

        {activePosition ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Entry:</span>
              <span className="font-mono" style={{ fontWeight: '700', color: '#fff' }}>
                ${activePosition.entryPrice.toFixed(2)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Unrealized P&L:</span>
              <span
                className="font-mono"
                style={{
                  fontWeight: '700',
                  color: (activePosition.unrealizedPnL || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                }}
              >
                {(activePosition.unrealizedPnL || 0) >= 0 ? '+' : ''}
                ${(activePosition.unrealizedPnL || 0).toFixed(2)} ({(activePosition.unrealizedPnLPercent || 0).toFixed(2)}%)
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              <span>SL: ${activePosition.stopLossPrice?.toFixed(2)}</span>
              <span>TP: ${activePosition.takeProfitPrice?.toFixed(2)}</span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '65px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No open position</span>
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
  );
}
