import React from 'react';
import { ListOrdered, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function OrdersTable({ orders = [] }) {
  return (
    <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ListOrdered size={18} style={{ color: 'var(--accent-cyan)' }} />
          <h2 style={{ fontSize: '1.05rem', fontWeight: '700' }}>Recent Orders (Har Buy / Sell Ki Detail)</h2>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
          {orders.length} total orders recorded
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>Date & Time (Kab Hua)</th>
              <th>Action (Kharida / Becha)</th>
              <th>Pair</th>
              <th>Leverage</th>
              <th>Price</th>
              <th>Quantity</th>
              <th>Total Value</th>
              <th>Status</th>
              <th>Mode</th>
              <th>Order ID</th>
            </tr>
          </thead>
          <tbody>
            {orders.length > 0 ? (
              orders.map((ord) => {
                const isINR = ord.pair?.endsWith('INR');
                const currencySym = isINR ? '₹' : '$';
                const isBuy = ord.side === 'buy';
                const totalValue = ord.price && ord.quantity ? ord.price * ord.quantity : 0;
                const lev = ord.leverage || 1;

                const timeFormatted = ord.createdAt
                  ? new Date(ord.createdAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : '---';

                return (
                  <tr key={ord.exchangeOrderId || ord._id}>
                    <td style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>
                      {timeFormatted}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: isBuy ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                          color: isBuy ? 'var(--accent-green)' : 'var(--accent-red)',
                          border: `1px solid ${isBuy ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                          fontWeight: '700',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {isBuy ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                        {isBuy ? 'BOUGHT (Khareeda)' : 'SOLD (Becha)'}
                      </span>
                    </td>
                    <td style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{ord.pair}</td>
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
                      {currencySym}{Number(ord.price).toLocaleString()}
                    </td>
                    <td className="font-mono">{Number(ord.quantity).toFixed(6)}</td>
                    <td className="font-mono" style={{ fontWeight: '600', color: '#f1f5f9' }}>
                      {currencySym}{totalValue.toFixed(2)}
                    </td>
                    <td>
                      <span
                        style={{
                          color:
                            ord.status === 'filled'
                              ? 'var(--accent-green)'
                              : ord.status === 'cancelled'
                              ? 'var(--accent-red)'
                              : 'var(--accent-amber)',
                          fontWeight: '600',
                          fontSize: '0.8rem',
                        }}
                      >
                        {ord.status?.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: ord.mode === 'PAPER_TRADING' ? 'rgba(34,211,238,0.12)' : 'rgba(248,113,113,0.12)',
                          color: ord.mode === 'PAPER_TRADING' ? '#22d3ee' : '#f87171',
                          border: `1px solid ${ord.mode === 'PAPER_TRADING' ? 'rgba(34,211,238,0.3)' : 'rgba(248,113,113,0.3)'}`,
                        }}
                      >
                        {ord.mode === 'PAPER_TRADING' ? 'PAPER' : 'LIVE'}
                      </span>
                    </td>
                    <td className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      {ord.exchangeOrderId?.slice(0, 14)}...
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)' }}>
                  No orders recorded yet. Start the bot to begin automated signal execution.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
