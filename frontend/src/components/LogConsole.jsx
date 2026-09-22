import React, { useState } from 'react';
import { Terminal, Trash2 } from 'lucide-react';

export default function LogConsole({ logs = [], onClearLogs }) {
  const [filter, setFilter] = useState('all');

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    return log.type === filter;
  });

  const getTypeStyle = (type) => {
    switch (type) {
      case 'trade':
        return { color: 'var(--accent-green)', bg: 'rgba(16, 185, 129, 0.1)' };
      case 'risk':
        return { color: 'var(--accent-amber)', bg: 'rgba(245, 158, 11, 0.1)' };
      case 'warn':
        return { color: '#fb923c', bg: 'rgba(251, 146, 60, 0.1)' };
      case 'error':
        return { color: 'var(--accent-red)', bg: 'rgba(239, 68, 68, 0.1)' };
      default:
        return { color: 'var(--accent-cyan)', bg: 'rgba(6, 182, 212, 0.1)' };
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={16} style={{ color: 'var(--accent-cyan)' }} />
          <h2 style={{ fontSize: '0.95rem', fontWeight: '700' }}>Live Bot Activity & Audit Stream</h2>
        </div>

        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: '6px', fontSize: '0.75rem' }}>
          {['all', 'trade', 'risk', 'warn', 'error'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
                color: filter === f ? '#fff' : 'var(--text-dim)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '6px',
                padding: '2px 8px',
                cursor: 'pointer',
                textTransform: 'uppercase',
                fontWeight: '600',
              }}
            >
              {f}
            </button>
          ))}
          {onClearLogs && (
            <button
              onClick={onClearLogs}
              title="Clear Console"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                marginLeft: '8px',
              }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          background: 'rgba(8, 11, 17, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '10px',
          padding: '12px',
          height: '180px',
          overflowY: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.78rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {filteredLogs.length > 0 ? (
          filteredLogs.map((item) => {
            const style = getTypeStyle(item.type);
            const timeStr = item.timestamp
              ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : '--:--:--';

            return (
              <div key={item.id} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', lineHeight: 1.4 }}>
                <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>[{timeStr}]</span>
                <span
                  style={{
                    color: style.color,
                    background: style.bg,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontWeight: '700',
                    fontSize: '0.7rem',
                    flexShrink: 0,
                  }}
                >
                  {item.type?.toUpperCase()}
                </span>
                <span style={{ color: 'var(--text-main)', wordBreak: 'break-word' }}>
                  {item.message}
                </span>
              </div>
            );
          })
        ) : (
          <span style={{ color: 'var(--text-dim)', margin: 'auto' }}>
            Awaiting bot activity. Logs will stream here in real-time.
          </span>
        )}
      </div>
    </div>
  );
}
