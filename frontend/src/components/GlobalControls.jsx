import React, { useState } from 'react';
import { Play, Square, AlertOctagon, RotateCcw, AlertCircle } from 'lucide-react';
import api from '../services/api';

export default function GlobalControls({ botStatus, onActionSuccess }) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const isRunning = botStatus?.isRunning;
  const isEmergency = botStatus?.emergencyStop;

  const showFeedback = (msg, isError = false) => {
    setFeedback({ msg, isError });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      const res = await api.startBot();
      if (res.success) {
        showFeedback('Bot started successfully!');
        if (onActionSuccess) onActionSuccess();
      } else {
        showFeedback(res.message, true);
      }
    } catch (err) {
      showFeedback(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const res = await api.stopBot();
      if (res.success) {
        showFeedback('Bot stopped.');
        if (onActionSuccess) onActionSuccess();
      } else {
        showFeedback(res.message, true);
      }
    } catch (err) {
      showFeedback(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const handleEmergencyStop = async () => {
    setLoading(true);
    try {
      const res = await api.emergencyStop();
      showFeedback('🚨 EMERGENCY STOP ACTIVATED!', true);
      if (onActionSuccess) onActionSuccess();
    } catch (err) {
      showFeedback(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const handleResetEmergency = async () => {
    setLoading(true);
    try {
      const res = await api.resetEmergencyStop();
      showFeedback('Emergency Stop reset. Bot is ready.');
      if (onActionSuccess) onActionSuccess();
    } catch (err) {
      showFeedback(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '18px 24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Global Commands:
          </span>

          {/* START BOT */}
          <button
            id="btn-start-bot"
            className="btn btn-start"
            disabled={loading || isRunning || isEmergency}
            onClick={handleStart}
          >
            <Play size={16} /> START BOT
          </button>

          {/* STOP BOT */}
          <button
            id="btn-stop-bot"
            className="btn btn-stop"
            disabled={loading || !isRunning || isEmergency}
            onClick={handleStop}
          >
            <Square size={16} /> STOP BOT
          </button>

          {/* EMERGENCY STOP */}
          <button
            id="btn-emergency-stop"
            className="btn btn-emergency"
            disabled={loading || isEmergency}
            onClick={handleEmergencyStop}
          >
            <AlertOctagon size={16} /> EMERGENCY STOP
          </button>

          {/* RESET EMERGENCY STOP (if active) */}
          {isEmergency && (
            <button
              id="btn-reset-emergency"
              className="btn btn-reset"
              disabled={loading}
              onClick={handleResetEmergency}
            >
              <RotateCcw size={16} /> RESET EMERGENCY STOP
            </button>
          )}
        </div>

        {/* Action feedback message */}
        {feedback && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: '500',
              background: feedback.isError ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              color: feedback.isError ? '#f87171' : '#34d399',
              border: `1px solid ${feedback.isError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
            }}
          >
            <AlertCircle size={15} />
            <span>{feedback.msg}</span>
          </div>
        )}
      </div>

      {/* EMERGENCY STOP NOTIFICATION BANNER */}
      {isEmergency && (
        <div
          style={{
            marginTop: '14px',
            padding: '12px 16px',
            borderRadius: '10px',
            background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.2) 0%, rgba(185, 28, 28, 0.1) 100%)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: '#fca5a5',
          }}
        >
          <AlertOctagon size={20} style={{ color: '#ef4444', flexShrink: 0 }} />
          <div style={{ fontSize: '0.85rem' }}>
            <strong>EMERGENCY STOP is currently engaged.</strong> All automated trading and signal evaluations are blocked. Click <em>Reset Emergency Stop</em> above when safe to restore normal operations.
          </div>
        </div>
      )}
    </div>
  );
}
