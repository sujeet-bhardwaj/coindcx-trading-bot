import React, { useState } from 'react';
import { History, Clock, ArrowDownRight, ArrowUpRight } from 'lucide-react';

function formatDuration(startTime, endTime) {
  if (!startTime) return '---';
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const diffSec = Math.max(0, Math.floor((end - start) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function TradeHistoryTable({ trades = [] }) {
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'recent'

  const now = Date.now();
  const fifteenMinutesAgo = now - 15 * 60 * 1000;

  const recentTrades = trades.filter((trd) => {
    const closedTime = new Date(trd.closedAt || trd.createdAt).getTime();
    return closedTime >= fifteenMinutesAgo;
  });

  const displayedTrades = filterMode === 'recent' ? recentTrades : trades;

  const totalPnL = trades.reduce((acc, t) => acc + parseFloat(t.profit || 0), 0);
  const isTotalProfit = totalPnL >= 0;

  return (
    <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <History size={18} style={{ color: 'var(--accent-cyan)' }} />
          <h2 style={{ fontSize: '1.05rem', fontWeight: '700' }}>
            Closed Trade History (Kab Khareeda aur Kab Becha)
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Total Realized PnL badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              fontSize: '0.78rem',
            }}
          >
            <Clock size={13} style={{ color: 'var(--accent-cyan)' }} />
            <span style={{ color: 'var(--text-dim)' }}>Net Realized P&L:</span>
            <span
              className="font-mono"
              style={{
                fontWeight: '700',
                color: isTotalProfit ? 'var(--accent-green)' : 'var(--accent-red)',
              }}
            >
              {isTotalProfit ? '+' : '-'}₹{Math.abs(totalPnL).toFixed(2)} ({trades.length} trades)
            </span>
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', padding: '2px' }}>
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              style={{
                background: filterMode === 'all' ? 'var(--accent-cyan)' : 'transparent',
                color: filterMode === 'all' ? '#0f172a' : 'var(--text-dim)',
                border: 'none',
                borderRadius: '4px',
                padding: '3px 9px',
                fontSize: '0.75rem',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              All ({trades.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('recent')}
              style={{
                background: filterMode === 'recent' ? 'var(--accent-cyan)' : 'transparent',
                color: filterMode === 'recent' ? '#0f172a' : 'var(--text-dim)',
                border: 'none',
                borderRadius: '4px',
                padding: '3px 9px',
                fontSize: '0.75rem',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              Last 15 Min ({recentTrades.length})
            </button>
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>Kab Khareeda (Buy Time)</th>
              <th>Kab Becha (Sell Time)</th>
              <th>Hold Time</th>
              <th>Pair</th>
              <th>Leverage</th>
              <th>Khareed Price (Buy)</th>
              <th>Bikri Price (Sell)</th>
              <th>Quantity</th>
              <th>Net P&L</th>
              <th>Return (%)</th>
              <th>Kyu Becha (Exit Reason)</th>
            </tr>
          </thead>
          <tbody>
            {displayedTrades.length > 0 ? (
              displayedTrades.map((trd) => {
                const profit = parseFloat(trd.profit || 0);
                const isProfitable = profit >= 0;
                const pnlPercent = parseFloat(trd.pnlPercent || 0);
                const isINR = trd.pair?.endsWith('INR');
                const currencySym = isINR ? '₹' : '$';
                const lev = trd.leverage || 1;

                const buyTimeFormatted = trd.createdAt
                  ? new Date(trd.createdAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : '---';

                const sellTimeFormatted = trd.closedAt
                  ? new Date(trd.closedAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : buyTimeFormatted;

                const holdDuration = formatDuration(trd.createdAt, trd.closedAt);

                return (
                  <tr key={trd.tradeId || trd._id}>
                    <td style={{ color: '#4ade80', fontSize: '0.78rem', fontWeight: '500' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ArrowUpRight size={13} style={{ color: '#4ade80' }} />
                        <span>{buyTimeFormatted}</span>
                      </div>
                    </td>
                    <td style={{ color: '#f87171', fontSize: '0.78rem', fontWeight: '500' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ArrowDownRight size={13} style={{ color: '#f87171' }} />
                        <span>{sellTimeFormatted}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                      ⏱️ {holdDuration}
                    </td>
                    <td style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{trd.pair}</td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: lev > 1 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                          color: lev > 1 ? '#fbbf24' : 'var(--text-dim)',
                          border: lev > 1 ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                        }}
                      >
                        {lev > 1 ? `${lev}x` : '1x Spot'}
                      </span>
                    </td>
                    <td className="font-mono">
                      {currencySym}{Number(trd.entryPrice).toLocaleString()}
                    </td>
                    <td className="font-mono">
                      {currencySym}{Number(trd.exitPrice).toLocaleString()}
                    </td>
                    <td className="font-mono">{Number(trd.quantity).toFixed(6)}</td>
                    <td>
                      <span
                        className="font-mono"
                        style={{
                          fontWeight: '700',
                          color: isProfitable ? 'var(--accent-green)' : 'var(--accent-red)',
                        }}
                      >
                        {isProfitable ? '+' : '-'}{currencySym}{Math.abs(profit).toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: isProfitable ? 'var(--accent-green-bg)' : 'var(--accent-red-bg)',
                          color: isProfitable ? 'var(--accent-green)' : 'var(--accent-red)',
                          border: `1px solid ${isProfitable ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                          fontWeight: '700',
                        }}
                      >
                        {isProfitable ? '+' : ''}
                        {pnlPercent.toFixed(2)}%
                      </span>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {trd.reason || 'Completed'}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)' }}>
                  No closed trades yet. Automated trades will appear here as soon as a buy/sell cycle completes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
