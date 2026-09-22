import React from 'react';
import { ListOrdered } from 'lucide-react';

export default function OrdersTable({ orders = [] }) {
  return (
    <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <ListOrdered size={18} style={{ color: 'var(--accent-cyan)' }} />
        <h2 style={{ fontSize: '1.05rem', fontWeight: '700' }}>Recent & Open Orders</h2>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginLeft: 'auto' }}>
          {orders.length} total orders
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Pair</th>
              <th>Side</th>
              <th>Type</th>
              <th>Price</th>
              <th>Quantity</th>
              <th>Status</th>
              <th>Mode</th>
              <th>Date / Time</th>
            </tr>
          </thead>
          <tbody>
            {orders.length > 0 ? (
              orders.map((ord) => (
                <tr key={ord.exchangeOrderId || ord._id}>
                  <td className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    {ord.exchangeOrderId?.slice(0, 16)}...
                  </td>
                  <td style={{ fontWeight: '600' }}>{ord.pair}</td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: ord.side === 'buy' ? 'var(--accent-green-bg)' : 'var(--accent-red-bg)',
                        color: ord.side === 'buy' ? 'var(--accent-green)' : 'var(--accent-red)',
                        border: `1px solid ${ord.side === 'buy' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      }}
                    >
                      {ord.side?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-dim)' }}>{ord.type}</td>
                  <td className="font-mono">${Number(ord.price).toLocaleString()}</td>
                  <td className="font-mono">{Number(ord.quantity).toFixed(6)}</td>
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
                      }}
                    >
                      {ord.status}
                    </span>
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: ord.mode === 'PAPER_TRADING' ? '#22d3ee' : '#f87171',
                      }}
                    >
                      {ord.mode === 'PAPER_TRADING' ? 'PAPER' : 'LIVE'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>
                    {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)' }}>
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
