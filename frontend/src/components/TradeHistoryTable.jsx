import React from 'react';
import { History } from 'lucide-react';

export default function TradeHistoryTable({ trades = [] }) {
  return (
    <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <History size={18} style={{ color: 'var(--accent-cyan)' }} />
        <h2 style={{ fontSize: '1.05rem', fontWeight: '700' }}>Closed Trade History & Realized P&L</h2>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginLeft: 'auto' }}>
          {trades.length} completed trades
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>Date / Time</th>
              <th>Pair</th>
              <th>Side</th>
              <th>Entry Price</th>
              <th>Exit Price</th>
              <th>Quantity</th>
              <th>Fee</th>
              <th>Net P&L ($)</th>
              <th>P&L (%)</th>
              <th>Exit Reason</th>
            </tr>
          </thead>
          <tbody>
            {trades.length > 0 ? (
              trades.map((trd) => {
                const profit = parseFloat(trd.profit || 0);
                const isProfitable = profit >= 0;
                const pnlPercent = parseFloat(trd.pnlPercent || 0);

                return (
                  <tr key={trd.tradeId || trd._id}>
                    <td style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>
                      {new Date(trd.closedAt || trd.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td style={{ fontWeight: '600' }}>{trd.pair}</td>
                    <td>
                      <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                        Roundtrip
                      </span>
                    </td>
                    <td className="font-mono">${Number(trd.entryPrice).toLocaleString()}</td>
                    <td className="font-mono">${Number(trd.exitPrice).toLocaleString()}</td>
                    <td className="font-mono">{Number(trd.quantity).toFixed(6)}</td>
                    <td className="font-mono" style={{ color: 'var(--text-dim)' }}>
                      ${Number(trd.fee).toFixed(2)}
                    </td>
                    <td>
                      <span
                        className="font-mono"
                        style={{
                          fontWeight: '700',
                          color: isProfitable ? 'var(--accent-green)' : 'var(--accent-red)',
                        }}
                      >
                        {isProfitable ? '+' : '-'}${Math.abs(profit).toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: isProfitable ? 'var(--accent-green-bg)' : 'var(--accent-red-bg)',
                          color: isProfitable ? 'var(--accent-green)' : 'var(--accent-red)',
                          border: `1px solid ${isProfitable ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        }}
                      >
                        {isProfitable ? '+' : ''}
                        {pnlPercent.toFixed(2)}%
                      </span>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {trd.reason || 'Closed'}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)' }}>
                  No closed trades yet. Automated trades will appear here upon exit signal or stop-loss/take-profit triggers.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
