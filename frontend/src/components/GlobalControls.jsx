import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Play, Square, AlertOctagon, RotateCcw, AlertCircle, Zap, ShieldCheck, AlertTriangle, X } from 'lucide-react';
import api from '../services/api';

export default function GlobalControls({ botStatus, onActionSuccess }) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [modalError, setModalError] = useState(null);

  const handleCloseModal = () => {
    setShowLiveModal(false);
    setRiskAcknowledged(false);
    setModalError(null);
  };

  // Prevent background scroll and allow ESC key when modal is open
  useEffect(() => {
    if (!showLiveModal) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleCloseModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showLiveModal]);

  const isRunning = botStatus?.isRunning;
  const isEmergency = botStatus?.emergencyStop;
  const mode = botStatus?.mode || 'PAPER_TRADING';

  const showFeedback = (msg, isError = false) => {
    setFeedback({ msg, isError });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleSwitchToLive = async () => {
    if (!riskAcknowledged) return;
    setLoading(true);
    setModalError(null);
    try {
      const res = await api.switchMode({ mode: 'LIVE_TRADING', confirmLiveRisk: true });
      if (res.success) {
        showFeedback('🚨 Switched to LIVE_TRADING mode! Real funds at risk.');
        handleCloseModal();
        if (onActionSuccess) onActionSuccess();
      } else {
        const errMsg = res.error || res.message || 'Failed to switch to Live Trading.';
        setModalError(errMsg);
        showFeedback(errMsg, true);
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.response?.data?.message || err.message;
      setModalError(errMsg);
      showFeedback(errMsg, true);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchToPaper = async () => {
    setLoading(true);
    try {
      const res = await api.switchMode({ mode: 'PAPER_TRADING' });
      if (res.success) {
        showFeedback('🛡️ Safely switched to PAPER_TRADING. Real funds protected.');
        if (onActionSuccess) onActionSuccess();
      } else {
        showFeedback(res.error || res.message, true);
      }
    } catch (err) {
      showFeedback(err.response?.data?.error || err.message, true);
    } finally {
      setLoading(false);
    }
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

  const handleSimulateTrade = async () => {
    setLoading(true);
    try {
      const res = await api.simulateTrade();
      if (res.success) {
        showFeedback(res.message || '⚡ Demo trade executed! Balance & P&L updated.');
        if (onActionSuccess) onActionSuccess();
      } else {
        showFeedback(res.message || 'Simulation failed', true);
      }
    } catch (err) {
      showFeedback(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const handleInstantSell = async () => {
    const hasPosition = (botStatus?.activePositions?.length > 0) || botStatus?.activePosition;
    const confirmText = hasPosition
      ? 'Kya aap abhi turant Live Market Price par BTC/crypto bechna (SELL) chahte hain?'
      : 'Kya aap CoinDCX wallet me mojood crypto ko abhi turant live market price par SELL karna chahte hain?';

    if (!window.confirm(confirmText)) {
      return;
    }

    setLoading(true);
    try {
      const res = await api.instantSell({ reason: 'Manual Instant Market Sell from dashboard' });
      if (res.success) {
        showFeedback(`⚡ ${res.message || 'Market Sell executed successfully!'}`);
        if (onActionSuccess) onActionSuccess();
      } else {
        showFeedback(res.message || 'Instant sell failed or no active trade to sell', true);
      }
    } catch (err) {
      showFeedback(err.message || 'Sell failed', true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '18px 24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
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

          {/* INSTANT MARKET SELL (तुरंत बेचें) */}
          <button
            id="btn-instant-sell"
            className="btn"
            style={{
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(220, 38, 38, 0.45) 100%)',
              color: '#fee2e2',
              border: '1px solid rgba(239, 68, 68, 0.7)',
              fontWeight: '700',
              boxShadow: (botStatus?.activePositions?.length > 0 || botStatus?.activePosition)
                ? '0 0 12px rgba(239, 68, 68, 0.5)'
                : 'none',
            }}
            disabled={loading}
            onClick={handleInstantSell}
            title="Instant Market Sell: Click to immediately exit and sell all coins at live market price"
          >
            <Zap size={16} style={{ color: '#f87171' }} /> ⚡ INSTANT SELL (तुरंत बेचें)
          </button>

          {/* SIMULATE TEST TRADE */}
          <button
            id="btn-simulate-trade"
            className="btn btn-simulate"
            disabled={loading || isEmergency}
            onClick={handleSimulateTrade}
            title="Instant paper trade execution to demonstrate balance & P&L updates"
          >
            <Zap size={16} /> SIMULATE TEST TRADE
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

          {/* TRADING MODE TOGGLE WITH SAFETY GATE (Rule #20) */}
          {mode === 'PAPER_TRADING' ? (
            <button
              id="btn-switch-live"
              className="btn"
              style={{
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.25) 100%)',
                color: '#fca5a5',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                fontWeight: '600',
              }}
              disabled={loading || isEmergency}
              onClick={() => setShowLiveModal(true)}
              title="Switch to Live Trading with Real Capital"
            >
              <AlertTriangle size={16} style={{ color: '#ef4444' }} /> SWITCH TO LIVE
            </button>
          ) : (
            <button
              id="btn-switch-paper"
              className="btn"
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 182, 212, 0.2) 100%)',
                color: '#a7f3d0',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                fontWeight: '600',
              }}
              disabled={loading}
              onClick={handleSwitchToPaper}
              title="Safely revert to Paper Trading"
            >
              <ShieldCheck size={16} style={{ color: '#34d399' }} /> SWITCH TO PAPER
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

      {/* 4-POINT LIVE SAFETY CONFIRMATION MODAL (Rule #20) */}
      {showLiveModal &&
        createPortal(
          <div
            id="live-modal-overlay"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(5, 7, 15, 0.85)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 999999,
              padding: '20px',
              boxSizing: 'border-box',
            }}
            onClick={(e) => {
              if (e.target.id === 'live-modal-overlay') {
                handleCloseModal();
              }
            }}
          >
            <div
              className="glass-panel"
              style={{
                maxWidth: '520px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '28px',
                borderRadius: '16px',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                boxShadow: '0 0 50px rgba(239, 68, 68, 0.35)',
                background: '#0d111c',
                position: 'relative',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <AlertTriangle size={24} style={{ color: '#ef4444' }} />
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#fca5a5' }}>
                    Live Trading Safety Confirmation
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* In-Modal Error Banner */}
              {modalError && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    color: '#fca5a5',
                    fontSize: '0.85rem',
                    marginBottom: '16px',
                  }}
                >
                  <AlertCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                  <span>{modalError}</span>
                </div>
              )}

              <p style={{ fontSize: '0.88rem', color: '#e2e8f0', lineHeight: '1.5', marginBottom: '16px' }}>
                You are about to switch the bot to <strong>LIVE_TRADING</strong>. This will place REAL market orders on your CoinDCX account using real capital.
              </p>

              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '14px', marginBottom: '20px', fontSize: '0.82rem', color: '#fecaca' }}>
                <strong>Rule #20 4-Point Safety Checklist:</strong>
                <ul style={{ margin: '8px 0 0 18px', padding: 0, lineHeight: '1.6' }}>
                  <li>CoinDCX API Key & Secret will be authenticated live</li>
                  <li>Emergency Stop must not be active</li>
                  <li>Strict 0.5% Capital Risk per trade will be enforced</li>
                  <li>Hard Stop-Loss (-0.75%) & Dynamic Profit-Lock Ladder will protect positions</li>
                </ul>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem', color: '#f8fafc', marginBottom: '24px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={riskAcknowledged}
                  onChange={(e) => setRiskAcknowledged(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#ef4444', cursor: 'pointer' }}
                />
                <span>I understand that real funds are at risk and confirm switching to Live Mode.</span>
              </label>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-stop"
                  onClick={handleCloseModal}
                  style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff' }}
                >
                  Cancel (Stay in Paper)
                </button>
                <button
                  id="btn-confirm-live"
                  type="button"
                  className="btn btn-emergency"
                  disabled={!riskAcknowledged || loading}
                  onClick={handleSwitchToLive}
                  style={{ opacity: !riskAcknowledged ? 0.5 : 1 }}
                >
                  {loading ? 'Verifying...' : 'Confirm & Enable Live Trading'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
